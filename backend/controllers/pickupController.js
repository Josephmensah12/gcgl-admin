const { Op } = require('sequelize');
const asyncHandler = require('../middleware/asyncHandler');
const db = require('../models');
const { AppError } = require('../middleware/errorHandler');
const { sendInvoiceEmail, isConfigured: isEmailConfigured } = require('../services/emailService');

exports.list = asyncHandler(async (req, res) => {
  const {
    page = 1, limit = 20, search = '', status = '', category = '',
    shipmentId = '', sortBy = 'created_at', sortOrder = 'DESC',
    unassigned = '',
    dateFrom = '', dateTo = '',
  } = req.query;

  const where = { status: 'completed' };

  if (search) {
    where[Op.or] = [
      { customerName: { [Op.iLike]: `%${search}%` } },
      { customerPhone: { [Op.iLike]: `%${search}%` } },
      { recipientName: { [Op.iLike]: `%${search}%` } },
      db.sequelize.where(
        db.sequelize.cast(db.sequelize.col('Invoice.invoice_number'), 'TEXT'),
        { [Op.iLike]: `%${search}%` }
      ),
    ];
  }

  if (unassigned === 'true') {
    where[Op.and] = [
      ...(where[Op.and] || []),
      { [Op.or]: [{ shipmentId: null }, { shipmentId: '' }] },
    ];
  } else if (shipmentId) {
    where.shipmentId = shipmentId;
  }

  // Date range on createdAt — both inclusive. Accepts ISO strings or YYYY-MM-DD.
  if (dateFrom || dateTo) {
    const range = {};
    if (dateFrom) range[Op.gte] = new Date(dateFrom);
    if (dateTo) range[Op.lte] = new Date(dateTo);
    where.createdAt = range;
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const { count, rows } = await db.Invoice.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset,
    order: [[sortBy, sortOrder]],
    // distinct + col is required so the count isn't inflated by the LEFT JOIN
    // on lineItems (one row per line item would turn 297 invoices into 1032).
    distinct: true,
    col: 'id',
    include: [
      { model: db.Customer, attributes: ['fullName', 'phone', 'email'] },
      { model: db.Shipment, attributes: ['id', 'name', 'status'] },
      {
        model: db.LineItem,
        as: 'lineItems',
        attributes: ['id', 'type', 'catalogName', 'description', 'quantity', 'finalPrice', 'dimensionsL', 'dimensionsW', 'dimensionsH'],
      },
    ],
  });

  // Compute warehouse days for each invoice
  const pickups = rows.map((inv) => {
    const days = Math.floor((Date.now() - new Date(inv.createdAt).getTime()) / (1000 * 60 * 60 * 24));
    return {
      ...inv.toJSON(),
      warehouseDays: days,
      itemCount: inv.originalItemCount + inv.addedItemCount,
    };
  });

  // Aggregate revenue across the full filtered set (not just current page)
  const totalsRow = await db.Invoice.findOne({
    where,
    attributes: [
      [db.sequelize.fn('SUM', db.sequelize.col('final_total')), 'totalRevenue'],
      [db.sequelize.fn('SUM', db.sequelize.col('amount_paid')), 'totalPaid'],
    ],
    raw: true,
  });
  const totalRevenue = parseFloat(totalsRow?.totalRevenue) || 0;
  const totalPaid = parseFloat(totalsRow?.totalPaid) || 0;

  res.json({
    success: true,
    data: {
      pickups,
      totals: {
        totalRevenue,
        totalPaid,
        totalUnpaid: Math.max(0, totalRevenue - totalPaid),
      },
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
  const invoice = await db.Invoice.findByPk(req.params.id, {
    include: [
      { model: db.Customer, include: [{ model: db.Recipient, as: 'recipients' }] },
      { model: db.Shipment },
      {
        model: db.LineItem,
        as: 'lineItems',
        include: [{ model: db.Photo, as: 'photos', attributes: ['id', 'data', 'sortOrder'] }],
      },
    ],
  });

  if (!invoice) {
    throw new AppError('Pickup not found', 404, 'NOT_FOUND');
  }

  const days = Math.floor((Date.now() - new Date(invoice.createdAt).getTime()) / (1000 * 60 * 60 * 24));

  res.json({
    success: true,
    data: { ...invoice.toJSON(), warehouseDays: days },
  });
});

exports.update = asyncHandler(async (req, res) => {
  const invoice = await db.Invoice.findByPk(req.params.id);
  if (!invoice) {
    throw new AppError('Pickup not found', 404, 'NOT_FOUND');
  }

  const allowedFields = [
    'customerName', 'customerEmail', 'customerPhone', 'customerAddress',
    'recipientName', 'recipientPhone', 'recipientAddress',
    'shipmentId', 'paymentStatus', 'status',
  ];

  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field] || null;
    }
  }

  const oldShipmentId = invoice.shipmentId;
  const newShipmentId = updates.shipmentId !== undefined ? updates.shipmentId : oldShipmentId;

  // Validate shipment if changing
  if (updates.shipmentId !== undefined && updates.shipmentId) {
    const shipment = await db.Shipment.findByPk(updates.shipmentId);
    if (!shipment) {
      throw new AppError('Shipment not found', 404, 'NOT_FOUND');
    }
  }

  await invoice.update(updates);

  // Recalculate totals on affected shipments
  const affectedIds = [...new Set([oldShipmentId, newShipmentId].filter(Boolean))];
  for (const sid of affectedIds) {
    const totals = await db.Invoice.findOne({
      where: { shipmentId: sid, status: 'completed' },
      attributes: [[db.sequelize.fn('SUM', db.sequelize.col('final_total')), 'totalValue']],
      raw: true,
    });
    await db.Shipment.update({ totalValue: parseFloat(totals?.totalValue) || 0 }, { where: { id: sid } });
  }

  // Reload with associations
  const updated = await db.Invoice.findByPk(req.params.id, {
    include: [
      { model: db.Customer, include: [{ model: db.Recipient, as: 'recipients' }] },
      { model: db.Shipment },
      { model: db.LineItem, as: 'lineItems',
        include: [{ model: db.Photo, as: 'photos', attributes: ['id', 'data', 'sortOrder'] }] },
    ],
  });

  const days = Math.floor((Date.now() - new Date(updated.createdAt).getTime()) / (1000 * 60 * 60 * 24));
  res.json({ success: true, data: { ...updated.toJSON(), warehouseDays: days } });
});

exports.assignToShipment = asyncHandler(async (req, res) => {
  const { invoiceIds, shipmentId } = req.body;
  if (!invoiceIds?.length || !shipmentId) {
    throw new AppError('invoiceIds and shipmentId required', 400, 'VALIDATION_ERROR');
  }

  const shipment = await db.Shipment.findByPk(shipmentId);
  if (!shipment) {
    throw new AppError('Shipment not found', 404, 'NOT_FOUND');
  }

  await db.Invoice.update(
    { shipmentId },
    { where: { id: { [Op.in]: invoiceIds } } }
  );

  // Recalculate shipment totals
  const totals = await db.Invoice.findOne({
    where: { shipmentId, status: 'completed' },
    attributes: [
      [db.sequelize.fn('SUM', db.sequelize.col('final_total')), 'totalValue'],
      [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'invoiceCount'],
    ],
    raw: true,
  });

  await shipment.update({ totalValue: parseFloat(totals.totalValue) || 0 });

  res.json({
    success: true,
    data: { assigned: invoiceIds.length, shipment: shipment.toJSON() },
  });
});

exports.unassignFromShipment = asyncHandler(async (req, res) => {
  const { invoiceIds } = req.body;
  if (!invoiceIds?.length) {
    throw new AppError('invoiceIds required', 400, 'VALIDATION_ERROR');
  }

  // Get the shipment IDs before unassigning to recalculate
  const invoices = await db.Invoice.findAll({
    where: { id: { [Op.in]: invoiceIds } },
    attributes: ['id', 'shipmentId'],
  });

  const affectedShipmentIds = [...new Set(invoices.map((i) => i.shipmentId).filter(Boolean))];

  await db.Invoice.update(
    { shipmentId: null },
    { where: { id: { [Op.in]: invoiceIds } } }
  );

  // Recalculate affected shipments
  for (const sid of affectedShipmentIds) {
    const totals = await db.Invoice.findOne({
      where: { shipmentId: sid, status: 'completed' },
      attributes: [[db.sequelize.fn('SUM', db.sequelize.col('final_total')), 'totalValue']],
      raw: true,
    });
    await db.Shipment.update({ totalValue: parseFloat(totals?.totalValue) || 0 }, { where: { id: sid } });
  }

  res.json({ success: true, data: { unassigned: invoiceIds.length } });
});

exports.getWarehouseSummary = asyncHandler(async (req, res) => {
  // Aging breakdown
  const now = Date.now();
  const ranges = [
    { label: '0-3 days', min: 0, max: 3 },
    { label: '4-7 days', min: 4, max: 7 },
    { label: '8-14 days', min: 8, max: 14 },
    { label: '15-30 days', min: 15, max: 30 },
    { label: '30+ days', min: 31, max: 9999 },
  ];

  const aging = [];
  for (const range of ranges) {
    const minDate = new Date(now - range.max * 24 * 60 * 60 * 1000);
    const maxDate = new Date(now - range.min * 24 * 60 * 60 * 1000);

    const count = await db.Invoice.count({
      where: {
        [Op.or]: [{ shipmentId: null }, { shipmentId: '' }],
        status: 'completed',
        createdAt: { [Op.gte]: minDate, [Op.lte]: maxDate },
      },
    });

    aging.push({ label: range.label, count });
  }

  // Value by payment status
  const byPayment = await db.Invoice.findAll({
    where: {
      [Op.or]: [{ shipmentId: null }, { shipmentId: '' }],
      status: 'completed',
    },
    attributes: [
      'paymentStatus',
      [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count'],
      [db.sequelize.fn('SUM', db.sequelize.col('final_total')), 'value'],
    ],
    group: ['paymentStatus'],
    raw: true,
  });

  res.json({ success: true, data: { aging, byPayment } });
});

/**
 * PATCH /api/v1/pickups/:id/discount
 * Update the invoice-level discount. Accepts discount_type ('none' | 'percentage' | 'fixed')
 * and discount_value (number). Recomputes totals and returns the updated invoice.
 */
exports.updateInvoiceDiscount = asyncHandler(async (req, res) => {
  const invoice = await db.Invoice.findByPk(req.params.id);
  if (!invoice) throw new AppError('Invoice not found', 404, 'NOT_FOUND');

  const discountType = req.body.discount_type ?? req.body.discountType ?? invoice.discountType;
  let discountValue = req.body.discount_value ?? req.body.discountValue;
  if (discountValue === undefined || discountValue === null) discountValue = invoice.discountValue;
  discountValue = parseFloat(discountValue) || 0;

  if (!['none', 'percentage', 'fixed'].includes(discountType)) {
    throw new AppError("discount_type must be 'none', 'percentage', or 'fixed'", 400, 'INVALID_DISCOUNT_TYPE');
  }
  if (discountType === 'percentage' && (discountValue < 0 || discountValue > 100)) {
    throw new AppError('Percentage discount must be between 0 and 100', 400, 'INVALID_DISCOUNT_VALUE');
  }
  if (discountType === 'fixed' && discountValue < 0) {
    throw new AppError('Fixed discount cannot be negative', 400, 'INVALID_DISCOUNT_VALUE');
  }

  invoice.discountType = discountType;
  invoice.discountValue = discountType === 'none' ? 0 : discountValue;
  await invoice.recalculateTotals();

  // Return the invoice with its lineItems so the UI can refresh totals
  const fresh = await db.Invoice.findByPk(invoice.id, {
    include: [{ model: db.LineItem, as: 'lineItems' }, { model: db.Shipment }],
  });
  res.json({ success: true, data: fresh });
});

/**
 * PATCH /api/v1/pickups/:id/items/:itemId/discount
 * Update a single line-item discount. Accepts discount_type and discount_value.
 * Recalculates the line (via beforeSave hook) and the parent invoice.
 */
exports.updateLineItemDiscount = asyncHandler(async (req, res) => {
  const invoice = await db.Invoice.findByPk(req.params.id);
  if (!invoice) throw new AppError('Invoice not found', 404, 'NOT_FOUND');

  const item = await db.LineItem.findOne({
    where: { id: req.params.itemId, invoiceId: invoice.id },
  });
  if (!item) throw new AppError('Line item not found on this invoice', 404, 'NOT_FOUND');

  const discountType = req.body.discount_type ?? req.body.discountType ?? item.discountType;
  let discountValue = req.body.discount_value ?? req.body.discountValue;
  if (discountValue === undefined || discountValue === null) discountValue = item.discountValue;
  discountValue = parseFloat(discountValue) || 0;

  if (!['none', 'percentage', 'fixed'].includes(discountType)) {
    throw new AppError("discount_type must be 'none', 'percentage', or 'fixed'", 400, 'INVALID_DISCOUNT_TYPE');
  }
  if (discountType === 'percentage' && (discountValue < 0 || discountValue > 100)) {
    throw new AppError('Percentage discount must be between 0 and 100', 400, 'INVALID_DISCOUNT_VALUE');
  }
  if (discountType === 'fixed' && discountValue < 0) {
    throw new AppError('Fixed discount cannot be negative', 400, 'INVALID_DISCOUNT_VALUE');
  }

  item.discountType = discountType;
  item.discountValue = discountType === 'none' ? 0 : discountValue;
  await item.save(); // triggers calculateTotals via beforeSave

  await invoice.recalculateTotals();

  const fresh = await db.Invoice.findByPk(invoice.id, {
    include: [{ model: db.LineItem, as: 'lineItems' }, { model: db.Shipment }],
  });
  res.json({ success: true, data: fresh });
});

exports.emailStatus = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { configured: isEmailConfigured() } });
});

exports.emailInvoice = asyncHandler(async (req, res) => {
  const invoice = await db.Invoice.findByPk(req.params.id, {
    include: [
      { model: db.Shipment, attributes: ['id', 'name'] },
      { model: db.LineItem, as: 'lineItems' },
    ],
  });
  if (!invoice) throw new AppError('Invoice not found', 404, 'NOT_FOUND');

  const override = req.body?.to;
  const to = override || invoice.customerEmail;
  if (!to || to === 'noemail@gcgl.com' || !to.includes('@')) {
    throw new AppError('Customer has no email address on file. Provide a "to" field in the request body to override.', 400, 'INVALID_EMAIL');
  }

  const settings = await db.Setting.findByPk(1);
  const company = {
    ...(settings?.data?.companyInfo || {}),
    footerText: settings?.data?.branding?.footerText,
  };

  try {
    const result = await sendInvoiceEmail({
      to,
      cc: req.body?.cc,
      bcc: req.body?.bcc,
      extraMessage: req.body?.message,
      invoice: invoice.toJSON(),
      company,
    });
    res.json({ success: true, data: { to, messageId: result.messageId } });
  } catch (e) {
    if (e.code === 'SMTP_NOT_CONFIGURED') {
      throw new AppError(e.message, 503, 'SMTP_NOT_CONFIGURED');
    }
    throw new AppError(e.message || 'Failed to send email', 500, 'EMAIL_SEND_FAILED');
  }
});
