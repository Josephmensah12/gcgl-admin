const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const asyncHandler = require('../middleware/asyncHandler');
const db = require('../models');
const { AppError } = require('../middleware/errorHandler');

exports.list = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status = '', search = '', sortBy = 'start_date', sortOrder = 'ASC' } = req.query;

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

  // Goods-only value: sum line_items excluding type='service' — this drives container capacity
  const goodsValueRows = shipmentIds.length > 0 ? await db.sequelize.query(`
    SELECT i.shipment_id AS "shipmentId",
           COALESCE(SUM(li.final_price), 0)::float AS "goodsValue"
      FROM invoices i
      JOIN line_items li ON li.invoice_id = i.id
     WHERE i.shipment_id IN (:shipmentIds)
       AND i.status = 'completed'
       AND (li.type IS NULL OR li.type != 'service')
     GROUP BY i.shipment_id
  `, { replacements: { shipmentIds }, type: require('sequelize').QueryTypes.SELECT }) : [];
  const goodsMap = {};
  for (const g of goodsValueRows) goodsMap[g.shipmentId] = parseFloat(g.goodsValue) || 0;

  const statsMap = {};
  invoiceStats.forEach((s) => {
    statsMap[s.shipmentId] = {
      invoiceCount: parseInt(s.invoiceCount),
      totalValue: goodsMap[s.shipmentId] || 0, // goods only for capacity
      invoiceTotal: parseFloat(s.invoiceTotal) || 0, // full total including services
      paidValue: parseFloat(s.paidValue) || 0,
      unpaidValue: parseFloat(s.unpaidValue) || 0,
    };
  });

  // Get capacity thresholds from settings
  const settings = await db.Setting.findByPk(1);
  const maxCapacity = settings?.data?.shipmentSettings?.moneyThresholds?.max || 30000;

  const shipments = rows.map((s) => {
    const stats = statsMap[s.id] || { invoiceCount: 0, totalValue: 0, paidValue: 0, unpaidValue: 0 };
    return {
      ...s.toJSON(),
      // Override stored total_value with fresh SUM of assigned invoices (cached column can drift)
      totalValue: stats.totalValue,
      stats,
      capacityPercent: Math.min(100, Math.round((stats.totalValue / maxCapacity) * 100)),
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

  // Compute goods-only totalValue (excludes service items like packing/handling)
  const [goodsRow] = await db.sequelize.query(`
    SELECT COALESCE(SUM(li.final_price), 0)::float AS "goodsValue"
      FROM invoices i
      JOIN line_items li ON li.invoice_id = i.id
     WHERE i.shipment_id = :sid AND i.status = 'completed'
       AND (li.type IS NULL OR li.type != 'service')
  `, { replacements: { sid: shipment.id }, type: require('sequelize').QueryTypes.SELECT });
  const totalValue = parseFloat(goodsRow?.goodsValue) || 0;

  res.json({
    success: true,
    data: {
      ...shipment.toJSON(),
      totalValue,
      capacityPercent: Math.min(100, Math.round((totalValue / maxCapacity) * 100)),
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

  // Compute goods-only totalValue per shipment (excludes service items)
  const shipmentIds = shipments.map((s) => s.id);
  const goodsStats = shipmentIds.length > 0 ? await db.sequelize.query(`
    SELECT i.shipment_id AS "shipmentId",
           COALESCE(SUM(li.final_price), 0)::float AS "goodsValue"
      FROM invoices i
      JOIN line_items li ON li.invoice_id = i.id
     WHERE i.shipment_id IN (:shipmentIds) AND i.status = 'completed'
       AND (li.type IS NULL OR li.type != 'service')
     GROUP BY i.shipment_id
  `, { replacements: { shipmentIds }, type: require('sequelize').QueryTypes.SELECT }) : [];
  const totalValueMap = {};
  for (const s of goodsStats) totalValueMap[s.shipmentId] = parseFloat(s.goodsValue) || 0;

  const result = shipments.map((s) => {
    const totalValue = totalValueMap[s.id] || 0;
    return {
      ...s.toJSON(),
      totalValue,
      capacityPercent: Math.min(100, Math.round((totalValue / maxCapacity) * 100)),
      maxCapacity,
    };
  });

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
