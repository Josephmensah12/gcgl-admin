const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const asyncHandler = require('../middleware/asyncHandler');
const db = require('../models');
const { AppError } = require('../middleware/errorHandler');

/**
 * Compute weighted goods value for one or more shipments.
 * Uses li.capacity_weight (stored per line item, copied from catalog at creation).
 * Returns a map of shipmentId -> { goodsValue (actual), weightedValue (for capacity) }
 */
async function computeShipmentValues(shipmentIds) {
  if (!shipmentIds || shipmentIds.length === 0) return {};

  const rows = await db.sequelize.query(`
    SELECT i.shipment_id AS "shipmentId",
           COALESCE(SUM(li.final_price), 0)::float AS "goodsValue",
           COALESCE(SUM(li.final_price * COALESCE(li.capacity_weight, 1.0)), 0)::float AS "weightedValue"
      FROM invoices i
      JOIN line_items li ON li.invoice_id = i.id
     WHERE i.shipment_id IN (:shipmentIds) AND i.status = 'completed'
       AND (li.type IS NULL OR li.type != 'service')
     GROUP BY i.shipment_id
  `, { replacements: { shipmentIds }, type: require('sequelize').QueryTypes.SELECT });

  const map = {};
  for (const r of rows) {
    map[r.shipmentId] = {
      goodsValue: parseFloat(r.goodsValue) || 0,
      weightedValue: parseFloat(r.weightedValue) || 0,
    };
  }
  return map;
}

exports.list = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status = '', search = '', sortBy = 'start_date', sortOrder = 'DESC' } = req.query;

  const where = {};
  if (status) {
    where.status = status;
  }
  if (search) {
    where.name = { [Op.iLike]: `%${search}%` };
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const { count, rows } = await db.Shipment.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset,
    order: [[sortBy, sortOrder]],
  });

  // Get invoice counts and payment stats per shipment
  const shipmentIds = rows.map((s) => s.id);
  const invoiceStats = await db.Invoice.findAll({
    where: { shipmentId: { [Op.in]: shipmentIds }, status: 'completed' },
    attributes: [
      'shipmentId',
      [db.sequelize.fn('COUNT', db.sequelize.col('Invoice.id')), 'invoiceCount'],
      [db.sequelize.fn('SUM', db.sequelize.col('final_total')), 'invoiceTotal'],
      [db.sequelize.fn('SUM', db.sequelize.literal("CASE WHEN payment_status = 'paid' THEN final_total ELSE 0 END")), 'paidValue'],
      [db.sequelize.fn('SUM', db.sequelize.literal("CASE WHEN payment_status = 'unpaid' THEN final_total ELSE 0 END")), 'unpaidValue'],
    ],
    group: ['shipmentId'],
    raw: true,
  });

  // Get capacity thresholds and weight factors from settings
  const settings = await db.Setting.findByPk(1);
  const maxCapacity = settings?.data?.shipmentSettings?.moneyThresholds?.max || 30000;

  // Goods-only value with capacity weight factors applied
  const valuesMap = await computeShipmentValues(shipmentIds);

  const statsMap = {};
  invoiceStats.forEach((s) => {
    const vals = valuesMap[s.shipmentId] || { goodsValue: 0, weightedValue: 0 };
    statsMap[s.shipmentId] = {
      invoiceCount: parseInt(s.invoiceCount),
      totalValue: vals.goodsValue,
      weightedValue: vals.weightedValue,
      invoiceTotal: parseFloat(s.invoiceTotal) || 0,
      paidValue: parseFloat(s.paidValue) || 0,
      unpaidValue: parseFloat(s.unpaidValue) || 0,
    };
  });

  const shipments = rows.map((s) => {
    const stats = statsMap[s.id] || { invoiceCount: 0, totalValue: 0, weightedValue: 0, paidValue: 0, unpaidValue: 0 };
    return {
      ...s.toJSON(),
      totalValue: stats.totalValue,
      weightedValue: stats.weightedValue,
      stats,
      capacityPercent: Math.min(100, Math.round((stats.weightedValue / maxCapacity) * 100)),
      maxCapacity,
    };
  });

  res.json({
    success: true,
    data: {
      shipments,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit)),
      },
    },
  });
});

exports.getById = asyncHandler(async (req, res) => {
  const shipment = await db.Shipment.findByPk(req.params.id, {
    include: [{
      model: db.Invoice,
      as: 'invoices',
      where: { status: 'completed' },
      required: false,
      include: [
        { model: db.Customer, attributes: ['fullName', 'phone'] },
        { model: db.LineItem, as: 'lineItems', attributes: ['id', 'type', 'catalogName', 'quantity', 'finalPrice'] },
      ],
    }],
  });

  if (!shipment) {
    throw new AppError('Shipment not found', 404, 'NOT_FOUND');
  }

  const settings = await db.Setting.findByPk(1);
  const maxCapacity = settings?.data?.shipmentSettings?.moneyThresholds?.max || 30000;

  // Compute goods-only totalValue with capacity weight factors
  const valuesMap = await computeShipmentValues([shipment.id]);
  const vals = valuesMap[shipment.id] || { goodsValue: 0, weightedValue: 0 };

  res.json({
    success: true,
    data: {
      ...shipment.toJSON(),
      totalValue: vals.goodsValue,
      weightedValue: vals.weightedValue,
      capacityPercent: Math.min(100, Math.round((vals.weightedValue / maxCapacity) * 100)),
      maxCapacity,
    },
  });
});

exports.create = asyncHandler(async (req, res) => {
  const { name, capacityType = 'money' } = req.body;

  const shipmentName = name || generateShipmentName();
  const shipment = await db.Shipment.create({
    id: uuidv4(),
    name: shipmentName,
    status: 'collecting',
    capacityType,
  });

  res.status(201).json({ success: true, data: shipment });
});

exports.update = asyncHandler(async (req, res) => {
  const shipment = await db.Shipment.findByPk(req.params.id);
  if (!shipment) {
    throw new AppError('Shipment not found', 404, 'NOT_FOUND');
  }

  const { name, status, capacityType } = req.body;
  const updates = {};
  if (name) updates.name = name;
  if (status) {
    updates.status = status;
    if (status === 'shipped' && !shipment.shippedAt) {
      updates.shippedAt = new Date();
    }
  }
  if (capacityType) updates.capacityType = capacityType;

  await shipment.update(updates);
  res.json({ success: true, data: shipment });
});

exports.delete = asyncHandler(async (req, res) => {
  const shipment = await db.Shipment.findByPk(req.params.id);
  if (!shipment) {
    throw new AppError('Shipment not found', 404, 'NOT_FOUND');
  }

  // Unassign all invoices first
  await db.Invoice.update(
    { shipmentId: null },
    { where: { shipmentId: shipment.id } }
  );

  await shipment.destroy();
  res.json({ success: true, message: 'Shipment deleted' });
});

exports.getActiveShipments = asyncHandler(async (req, res) => {
  const shipments = await db.Shipment.findAll({
    order: [['start_date', 'ASC'], ['createdAt', 'ASC']],
  });

  const settings = await db.Setting.findByPk(1);
  const maxCapacity = settings?.data?.shipmentSettings?.moneyThresholds?.max || 30000;

  const shipmentIds = shipments.map((s) => s.id);
  const valuesMap = await computeShipmentValues(shipmentIds);

  const result = shipments.map((s) => {
    const vals = valuesMap[s.id] || { goodsValue: 0, weightedValue: 0 };
    return {
      ...s.toJSON(),
      totalValue: vals.goodsValue,
      weightedValue: vals.weightedValue,
      capacityPercent: Math.min(100, Math.round((vals.weightedValue / maxCapacity) * 100)),
      maxCapacity,
    };
  });

  res.json({ success: true, data: result });
});

/**
 * POST /api/v1/shipments/:id/notify
 * Send batch shipment update emails to all customers in this shipment.
 *
 * Body: { message?: string }   — optional custom message overriding the status default
 */
exports.notifyCustomers = asyncHandler(async (req, res) => {
  const shipment = await db.Shipment.findByPk(req.params.id);
  if (!shipment) throw new AppError('Shipment not found', 404, 'NOT_FOUND');

  const { isConfigured, sendShipmentUpdateEmail, STATUS_MESSAGES } = require('../services/emailService');
  if (!isConfigured()) throw new AppError('SMTP not configured', 503, 'SMTP_NOT_CONFIGURED');

  // Load company settings (needed for logo, contact info, and custom status messages)
  const settings = await db.Setting.findOne({ where: { id: 1 } });
  const company = settings?.data?.companyInfo || {};

  // Resolve message: request body > settings per-status > built-in default
  const savedMessages = company.shipmentUpdateMessages || {};
  const customMessage = req.body.message
    || savedMessages[shipment.status]
    || null;

  // Load invoices with customer details
  const invoices = await db.Invoice.findAll({
    where: { shipmentId: shipment.id, status: { [Op.ne]: 'cancelled' } },
    attributes: ['id', 'invoiceNumber', 'customerName', 'customerEmail', 'finalTotal', 'amountPaid', 'paymentStatus'],
  });

  if (invoices.length === 0) throw new AppError('No invoices in this shipment', 400, 'NO_INVOICES');

  // Optionally generate Square payment links
  let squareConfigured = false;
  try {
    const sq = require('../services/squareService');
    squareConfigured = sq.isConfigured();
  } catch {}

  // Deduplicate by email, but send per-invoice (each customer gets one email per invoice)
  const results = { sent: 0, skipped: 0, failed: 0, details: [] };

  for (const inv of invoices) {
    const email = inv.customerEmail;
    if (!email || email === 'noemail@gcgl.com') {
      results.skipped++;
      results.details.push({ invoiceNumber: inv.invoiceNumber, status: 'skipped', reason: 'no email' });
      continue;
    }

    const balance = Math.max(0, (parseFloat(inv.finalTotal) || 0) - (parseFloat(inv.amountPaid) || 0));

    // Generate payment link if there's a balance
    let paymentUrl = null;
    if (squareConfigured && balance > 0.01) {
      try {
        const sq = require('../services/squareService');
        const link = await sq.createPaymentLink(inv);
        paymentUrl = link.url;
      } catch {}
    }

    try {
      await sendShipmentUpdateEmail({
        to: email,
        customerName: inv.customerName,
        invoiceNumber: inv.invoiceNumber,
        shipmentStatus: shipment.status,
        eta: shipment.eta,
        balance,
        paymentUrl,
        customMessage,
        company,
      });
      results.sent++;
      results.details.push({ invoiceNumber: inv.invoiceNumber, email, status: 'sent' });
    } catch (err) {
      results.failed++;
      results.details.push({ invoiceNumber: inv.invoiceNumber, email, status: 'failed', error: err.message });
    }
  }

  res.json({ success: true, data: results });
});

/**
 * GET /api/v1/shipments/:id/notify/preview
 * Preview the list of customers who will be notified.
 */
exports.notifyPreview = asyncHandler(async (req, res) => {
  const shipment = await db.Shipment.findByPk(req.params.id);
  if (!shipment) throw new AppError('Shipment not found', 404, 'NOT_FOUND');

  const { STATUS_MESSAGES } = require('../services/emailService');

  // Load settings for custom per-status messages
  const settings = await db.Setting.findOne({ where: { id: 1 } });
  const savedMessages = settings?.data?.companyInfo?.shipmentUpdateMessages || {};

  const invoices = await db.Invoice.findAll({
    where: { shipmentId: shipment.id, status: { [Op.ne]: 'cancelled' } },
    attributes: ['id', 'invoiceNumber', 'customerName', 'customerEmail', 'finalTotal', 'amountPaid', 'paymentStatus'],
  });

  const customers = invoices.map((inv) => ({
    invoiceNumber: inv.invoiceNumber,
    customerName: inv.customerName,
    email: inv.customerEmail,
    hasEmail: Boolean(inv.customerEmail && inv.customerEmail !== 'noemail@gcgl.com'),
    balance: Math.max(0, (parseFloat(inv.finalTotal) || 0) - (parseFloat(inv.amountPaid) || 0)),
    paymentStatus: inv.paymentStatus,
  }));

  res.json({
    success: true,
    data: {
      shipmentName: shipment.name,
      shipmentStatus: shipment.status,
      defaultMessage: savedMessages[shipment.status] || STATUS_MESSAGES[shipment.status] || STATUS_MESSAGES.collecting,
      totalCustomers: customers.length,
      withEmail: customers.filter((c) => c.hasEmail).length,
      withoutEmail: customers.filter((c) => !c.hasEmail).length,
      customers,
    },
  });
});

/**
 * GET /api/v1/shipments/:id/volume?container=40hc&llm=true
 * Analyze volume usage for a shipment with the 4-step dimension resolution chain.
 */
exports.volumeAnalysis = asyncHandler(async (req, res) => {
  const { analyzeVolume } = require('../services/volumeService');
  const containerType = req.query.container || '40hc';
  const useLLM = req.query.llm !== 'false';
  const packingEfficiency = req.query.efficiency ? parseFloat(req.query.efficiency) : 0.75;

  const result = await analyzeVolume(req.params.id, { containerType, useLLM, packingEfficiency });
  res.json({ success: true, data: result });
});

function generateShipmentName() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
  return `${y}-${m}-${d}-${rand}`;
}
