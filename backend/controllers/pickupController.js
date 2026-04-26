const { Op } = require('sequelize');
const asyncHandler = require('../middleware/asyncHandler');
const db = require('../models');
const { AppError } = require('../middleware/errorHandler');
const { sendInvoiceEmail, isConfigured: isEmailConfigured } = require('../services/emailService');
const { createPaymentLink, isConfigured: isSquareConfigured, verifyWebhookSignature } = require('../services/squareService');
const { assertEditable } = require('../utils/invoiceLock');

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
 * POST /api/v1/pickups/:id/items
 * Add a line item to an existing invoice. Accepts service / catalog / custom /
 * manual types — full parity with the creation flow.
 *
 * Body:
 *   type:           'service' | 'fixed' | 'custom' | 'manual' (default 'service')
 *   description:    string (required for service/custom/manual; optional for fixed)
 *   quantity:       int (default 1)
 *   base_price:     number (required unless type='fixed' with catalogItemId — then derived)
 *   catalogItemId:  uuid (required when type='fixed')
 *   catalogName:    string (auto-filled from catalog item if omitted)
 *   dimensions:     { length, width, height } (required when type='custom')
 *   photos:         array of base64 dataURLs (max 3)
 */
exports.addLineItem = asyncHandler(async (req, res) => {
  const invoice = await db.Invoice.findByPk(req.params.id);
  if (!invoice) throw new AppError('Invoice not found', 404, 'NOT_FOUND');
  assertEditable(invoice);

  const { type = 'service', description, quantity, base_price, catalogItemId, catalogName, dimensions, photos } = req.body;

  if (!['service', 'fixed', 'custom', 'manual'].includes(type)) {
    throw new AppError("type must be one of 'service', 'fixed', 'custom', 'manual'", 400, 'INVALID_TYPE');
  }

  const qty = parseInt(quantity) || 1;
  if (qty < 1) throw new AppError('quantity must be >= 1', 400, 'VALIDATION_ERROR');

  // Resolve price + catalog name + capacity weight + final description per type
  let price = parseFloat(base_price) || 0;
  let resolvedCatalogName = catalogName || null;
  let capacityWeight = 1.0;
  let resolvedDescription = description ? String(description).trim() : null;
  let dimsL = null, dimsW = null, dimsH = null;

  if (type === 'fixed') {
    if (!catalogItemId) throw new AppError('catalogItemId is required for type=fixed', 400, 'MISSING_FIELD');
    const cat = await db.CatalogItem.findByPk(catalogItemId);
    if (!cat) throw new AppError('Catalog item not found', 404, 'NOT_FOUND');
    if (!base_price && base_price !== 0) price = parseFloat(cat.price) || 0;
    if (!resolvedCatalogName) resolvedCatalogName = cat.name;
    capacityWeight = parseFloat(cat.capacityWeight) || 1.0;
    if (!resolvedDescription) resolvedDescription = cat.description || null;
  } else if (type === 'custom') {
    if (!dimensions || !dimensions.length || !dimensions.width || !dimensions.height) {
      throw new AppError('dimensions { length, width, height } required for type=custom', 400, 'MISSING_FIELD');
    }
    dimsL = parseFloat(dimensions.length);
    dimsW = parseFloat(dimensions.width);
    dimsH = parseFloat(dimensions.height);
    if (!(dimsL > 0 && dimsW > 0 && dimsH > 0)) {
      throw new AppError('dimensions must be positive numbers', 400, 'VALIDATION_ERROR');
    }
    // Frontend sends the computed price; trust it but require it > 0
    if (!(price > 0)) throw new AppError('base_price required for custom item', 400, 'MISSING_FIELD');
    if (!resolvedDescription) resolvedDescription = `${dimsL}×${dimsW}×${dimsH}"`;
  } else {
    // service or manual: description + price required
    if (!resolvedDescription) throw new AppError('description is required', 400, 'MISSING_FIELD');
    if (!(price > 0)) throw new AppError('base_price must be > 0', 400, 'MISSING_FIELD');
  }

  const crypto = require('crypto');
  const result = await db.sequelize.transaction(async (t) => {
    const item = await db.LineItem.create({
      id: crypto.randomUUID(),
      invoiceId: invoice.id,
      type,
      catalogItemId: type === 'fixed' ? catalogItemId : null,
      catalogName: resolvedCatalogName,
      description: resolvedDescription,
      quantity: qty,
      basePrice: price,
      discountType: 'none',
      discountValue: 0,
      preDiscountTotal: Math.round(qty * price * 100) / 100,
      discountAmount: 0,
      finalPrice: Math.round(qty * price * 100) / 100,
      dimensionsL: dimsL,
      dimensionsW: dimsW,
      dimensionsH: dimsH,
      capacityWeight,
      sortOrder: 999,
    }, { transaction: t });

    if (Array.isArray(photos) && photos.length > 0) {
      const trimmed = photos.slice(0, 3);
      await db.Photo.bulkCreate(
        trimmed.map((data, i) => ({ lineItemId: item.id, data, sortOrder: i })),
        { transaction: t }
      );
    }

    return item;
  });

  invoice.addedItemCount = (invoice.addedItemCount || 0) + 1;
  invoice.lastEditedAt = new Date();
  await invoice.recalculateTotals(); // implicitly saves the dirty fields above

  const fresh = await db.Invoice.findByPk(invoice.id, {
    include: [
      { model: db.LineItem, as: 'lineItems', include: [{ model: db.Photo, as: 'photos', attributes: ['id', 'data', 'sortOrder'] }] },
      { model: db.Shipment },
    ],
  });
  res.status(201).json({ success: true, data: fresh });
});

/**
 * PATCH /api/v1/pickups/:id/items/:itemId
 * Update an existing line item's quantity / unit price / description / dimensions.
 * Discount fields are NOT updated here — use the dedicated discount endpoint.
 */
exports.updateLineItem = asyncHandler(async (req, res) => {
  const invoice = await db.Invoice.findByPk(req.params.id);
  if (!invoice) throw new AppError('Invoice not found', 404, 'NOT_FOUND');
  assertEditable(invoice);

  const item = await db.LineItem.findOne({
    where: { id: req.params.itemId, invoiceId: invoice.id },
  });
  if (!item) throw new AppError('Line item not found on this invoice', 404, 'NOT_FOUND');

  const { quantity, base_price, description, dimensions } = req.body;

  if (quantity !== undefined) {
    const qty = parseInt(quantity);
    if (!(qty >= 1)) throw new AppError('quantity must be >= 1', 400, 'VALIDATION_ERROR');
    item.quantity = qty;
  }

  if (base_price !== undefined) {
    const price = parseFloat(base_price);
    if (!(price >= 0)) throw new AppError('base_price must be >= 0', 400, 'VALIDATION_ERROR');
    item.basePrice = price;
  }

  if (description !== undefined) {
    item.description = description ? String(description).trim() : null;
  }

  if (dimensions !== undefined) {
    if (item.type !== 'custom') {
      throw new AppError('dimensions can only be set on custom items', 400, 'INVALID_FIELD');
    }
    const l = parseFloat(dimensions.length);
    const w = parseFloat(dimensions.width);
    const h = parseFloat(dimensions.height);
    if (!(l > 0 && w > 0 && h > 0)) throw new AppError('dimensions must be positive numbers', 400, 'VALIDATION_ERROR');
    item.dimensionsL = l;
    item.dimensionsW = w;
    item.dimensionsH = h;
  }

  await item.save(); // beforeSave hook recomputes finalPrice from qty * basePrice
  invoice.lastEditedAt = new Date();
  await invoice.recalculateTotals(); // implicitly saves lastEditedAt

  const fresh = await db.Invoice.findByPk(invoice.id, {
    include: [
      { model: db.LineItem, as: 'lineItems', include: [{ model: db.Photo, as: 'photos', attributes: ['id', 'data', 'sortOrder'] }] },
      { model: db.Shipment },
    ],
  });
  res.json({ success: true, data: fresh });
});

/**
 * POST /api/v1/pickups/:id/cancel
 * Cancel an invoice. Voids all active payments, unassigns from shipment,
 * and sets status to 'cancelled'.
 */
exports.cancelInvoice = asyncHandler(async (req, res) => {
  const invoice = await db.Invoice.findByPk(req.params.id);
  if (!invoice) throw new AppError('Invoice not found', 404, 'NOT_FOUND');
  if (invoice.status === 'cancelled') throw new AppError('Invoice is already cancelled', 400, 'ALREADY_CANCELLED');

  const reason = req.body.reason || 'Invoice cancelled';

  // Void all active payments
  const activePayments = await db.InvoicePayment.findAll({
    where: { invoiceId: invoice.id, voidedAt: null },
  });
  for (const payment of activePayments) {
    await payment.update({
      voidedAt: new Date(),
      voidedByUserId: req.user?.userId || null,
      voidReason: reason,
    });
  }

  // Update invoice
  await invoice.update({
    status: 'cancelled',
    amountPaid: 0,
    paymentStatus: 'unpaid',
    shipmentId: null,
  });

  const fresh = await db.Invoice.findByPk(invoice.id, {
    include: [{ model: db.LineItem, as: 'lineItems' }, { model: db.Shipment }],
  });
  res.json({ success: true, data: fresh });
});

/**
 * DELETE /api/v1/pickups/:id/items/:itemId
 * Remove a line item from an invoice.
 */
exports.removeLineItem = asyncHandler(async (req, res) => {
  const invoice = await db.Invoice.findByPk(req.params.id);
  if (!invoice) throw new AppError('Invoice not found', 404, 'NOT_FOUND');
  assertEditable(invoice);

  const item = await db.LineItem.findOne({
    where: { id: req.params.itemId, invoiceId: invoice.id },
  });
  if (!item) throw new AppError('Line item not found', 404, 'NOT_FOUND');

  // Block removal of the last item — force users through the cancel flow
  // when they want to fully empty an invoice.
  const remaining = await db.LineItem.count({ where: { invoiceId: invoice.id } });
  if (remaining <= 1) {
    throw new AppError(
      'An invoice must keep at least one item. To remove all items, cancel the invoice instead.',
      400,
      'EMPTY_INVOICE'
    );
  }

  await item.destroy();
  invoice.lastEditedAt = new Date();
  await invoice.recalculateTotals(); // implicitly saves lastEditedAt

  const fresh = await db.Invoice.findByPk(invoice.id, {
    include: [
      { model: db.LineItem, as: 'lineItems', include: [{ model: db.Photo, as: 'photos', attributes: ['id', 'data', 'sortOrder'] }] },
      { model: db.Shipment },
    ],
  });
  res.json({ success: true, data: fresh });
});

/**
 * PATCH /api/v1/pickups/:id/discount
 * Update the invoice-level discount. Accepts discount_type ('none' | 'percentage' | 'fixed')
 * and discount_value (number). Recomputes totals and returns the updated invoice.
 */
exports.updateInvoiceDiscount = asyncHandler(async (req, res) => {
  const invoice = await db.Invoice.findByPk(req.params.id);
  if (!invoice) throw new AppError('Invoice not found', 404, 'NOT_FOUND');
  assertEditable(invoice);

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
  invoice.lastEditedAt = new Date();
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
  assertEditable(invoice);

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

  invoice.lastEditedAt = new Date();
  await invoice.recalculateTotals();

  const fresh = await db.Invoice.findByPk(invoice.id, {
    include: [{ model: db.LineItem, as: 'lineItems' }, { model: db.Shipment }],
  });
  res.json({ success: true, data: fresh });
});

exports.emailStatus = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { configured: isEmailConfigured() } });
});

/* ─── Square payment link ───────────────────────────────── */

exports.squareStatus = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { configured: isSquareConfigured() } });
});

exports.createPaymentLink = asyncHandler(async (req, res) => {
  const invoice = await db.Invoice.findByPk(req.params.id);
  if (!invoice) throw new AppError('Invoice not found', 404, 'NOT_FOUND');

  // Allow custom amount for partial payments
  const customAmount = req.body?.amount ? parseFloat(req.body.amount) : null;

  try {
    const link = await createPaymentLink(invoice, customAmount);
    res.json({ success: true, data: link });
  } catch (e) {
    if (e.code === 'SQUARE_NOT_CONFIGURED') {
      throw new AppError(e.message, 503, 'SQUARE_NOT_CONFIGURED');
    }
    if (e.code === 'INVOICE_PAID') {
      throw new AppError(e.message, 400, 'INVOICE_PAID');
    }
    throw new AppError(e.message || 'Failed to create payment link', 500, 'SQUARE_ERROR');
  }
});

/* ─── Square webhook ────────────────────────────────────── */

exports.squareWebhook = async (req, res) => {
  // This handler is NOT wrapped in asyncHandler because it needs to
  // always return 200 to Square (even on errors) to avoid retries.
  try {
    const event = req.body;
    const eventType = event?.type;

    console.log('Square webhook received:', eventType, JSON.stringify(event).substring(0, 1000));

    // Accept payment.completed, payment.created, payment.updated, and order.fulfilled
    const paymentEvents = ['payment.completed', 'payment.created', 'payment.updated'];
    const orderEvents = ['order.fulfilled'];
    if (!paymentEvents.includes(eventType) && !orderEvents.includes(eventType)) {
      console.log('Square webhook: ignoring event type:', eventType);
      return res.status(200).json({ received: true });
    }

    // For order.fulfilled — extract payment info from the order
    // For payment events — extract from payment object
    let payment;
    let invoiceNumber;

    if (orderEvents.includes(eventType)) {
      // order.fulfilled: data.object.order_fulfilled.order has line_items with name "Invoice #NNN ..."
      const order = event.data?.object?.order_fulfilled?.order
        || event.data?.object?.order
        || event.data?.object;
      if (!order) {
        console.log('Square webhook: order.fulfilled but no order object found');
        return res.status(200).json({ received: true });
      }
      // Try to extract invoice number from line item names
      const lineItems = order.line_items || [];
      for (const li of lineItems) {
        const m = (li.name || '').match(/Invoice #(\d+)/i);
        if (m) { invoiceNumber = parseInt(m[1]); break; }
      }
      if (!invoiceNumber) {
        console.log('Square webhook: order.fulfilled but no invoice # in line items:', lineItems.map(l => l.name));
        return res.status(200).json({ received: true, matched: false });
      }
      // Build a pseudo-payment from order tenders
      const tenders = order.tenders || [];
      const tender = tenders[0] || {};
      payment = {
        id: tender.id || order.id,
        amount_money: tender.amount_money || order.total_money,
        created_at: order.closed_at || order.updated_at || order.created_at,
        status: 'COMPLETED',
      };
    } else {
      // payment.completed / payment.created
      payment = event.data?.object?.payment || event.data?.object;
      if (!payment || !payment.id) {
        console.log('Square webhook: no payment object in event');
        return res.status(200).json({ received: true });
      }

      // If payment is APPROVED (not yet captured), auto-complete it via Square API
      if (payment.status === 'APPROVED') {
        console.log(`Square webhook: ${eventType} status APPROVED — auto-completing payment ${payment.id}`);
        try {
          const { apiRequest } = require('../services/squareService');
          await apiRequest('POST', `/payments/${payment.id}/complete`, {});
          console.log(`Square webhook: payment ${payment.id} completed successfully`);
          // Square will send payment.updated with COMPLETED — that event will record the payment
          return res.status(200).json({ received: true, autoCompleted: true });
        } catch (completeErr) {
          console.error(`Square webhook: failed to auto-complete payment ${payment.id}:`, completeErr.message);
          return res.status(200).json({ received: true, error: 'auto-complete failed' });
        }
      }

      // Only process payments that have reached COMPLETED status
      if (payment.status !== 'COMPLETED') {
        console.log(`Square webhook: ${eventType} but status is ${payment.status} — skipping`);
        return res.status(200).json({ received: true, skipped: payment.status });
      }

      // Extract invoice number from multiple possible locations:
      // 1. payment.note (set by payment_note on checkout link)
      // 2. payment.receipt_url (fallback, unlikely)
      // 3. order line items via Square API (quick_pay.name contains "Invoice #NNN")
      const note = payment.note || '';
      const noteMatch = note.match(/Invoice #(\d+)/i);
      if (noteMatch) {
        invoiceNumber = parseInt(noteMatch[1]);
      }

      // If note didn't have it, try reference_id
      if (!invoiceNumber && payment.reference_id) {
        const refMatch = payment.reference_id.match(/(\d+)/);
        if (refMatch) invoiceNumber = parseInt(refMatch[1]);
      }

      // If still no match, fetch the order from Square to get line item names
      if (!invoiceNumber && payment.order_id) {
        try {
          const { apiRequest } = require('../services/squareService');
          const orderResult = await apiRequest('GET', `/orders/${payment.order_id}`);
          const order = orderResult.order || orderResult;
          const lineItems = order.line_items || [];
          for (const li of lineItems) {
            const m = (li.name || '').match(/Invoice #(\d+)/i);
            if (m) { invoiceNumber = parseInt(m[1]); break; }
          }
          if (!invoiceNumber) {
            console.log('Square webhook: no invoice # in order line items:', lineItems.map(l => l.name));
          }
        } catch (orderErr) {
          console.log('Square webhook: could not fetch order', payment.order_id, orderErr.message);
        }
      }
    }

    if (!invoiceNumber) {
      console.log('Square webhook: could not extract invoice number from event');
      return res.status(200).json({ received: true, matched: false });
    }

    const invoice = await db.Invoice.findOne({ where: { invoiceNumber } });
    if (!invoice) {
      console.log('Square webhook: invoice #' + invoiceNumber + ' not found');
      return res.status(200).json({ received: true, matched: false });
    }

    // Avoid duplicate payment records (idempotency by Square payment ID)
    const squarePaymentId = payment.id;
    const existing = await db.InvoicePayment.findOne({
      where: { comment: { [Op.like]: '%' + squarePaymentId + '%' } },
    });
    if (existing) {
      console.log('Square webhook: payment already recorded for ' + squarePaymentId);
      return res.status(200).json({ received: true, duplicate: true });
    }

    // Amount is in cents
    const amountCents = payment.amount_money?.amount || 0;
    const amount = amountCents / 100;
    const paymentDate = payment.created_at ? new Date(payment.created_at) : new Date();

    // Create invoice_payment row
    const crypto = require('crypto');
    await db.InvoicePayment.create({
      id: crypto.randomUUID(),
      invoiceId: invoice.id,
      transactionType: 'PAYMENT',
      paymentDate: paymentDate,
      amount: amount,
      paymentMethod: 'Square',
      comment: `Square online payment ${squarePaymentId}`,
    });

    // Update invoice amount_paid and payment_status
    const allPayments = await db.InvoicePayment.findAll({
      where: { invoiceId: invoice.id, transactionType: 'PAYMENT', voidedAt: null },
    });
    const totalPaid = allPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const total = parseFloat(invoice.finalTotal || 0);
    let status = 'unpaid';
    if (totalPaid >= total - 0.01) status = 'paid';
    else if (totalPaid > 0.01) status = 'partial';

    await invoice.update({
      amountPaid: Math.round(totalPaid * 100) / 100,
      paymentStatus: status,
      paymentMethod: 'Square',
    });

    console.log(`Square webhook: recorded $${amount} payment for invoice #${invoiceNumber} (${squarePaymentId}) — status now: ${status}`);
    return res.status(200).json({ received: true, invoiceNumber, amount, status });
  } catch (err) {
    console.error('Square webhook error:', err.message, err.stack);
    return res.status(200).json({ received: true, error: err.message });
  }
};

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

  // Auto-generate a Square payment link if Square is configured and balance > 0
  let paymentUrl = null;
  const total = parseFloat(invoice.finalTotal) || 0;
  const paid = parseFloat(invoice.amountPaid) || 0;
  if (isSquareConfigured() && total - paid > 0.01) {
    try {
      const link = await createPaymentLink(invoice.toJSON());
      paymentUrl = link.url;
    } catch (e) {
      console.log('Square link skipped for email:', e.message);
    }
  }

  try {
    const result = await sendInvoiceEmail({
      to,
      cc: req.body?.cc,
      bcc: req.body?.bcc,
      extraMessage: req.body?.message,
      invoice: invoice.toJSON(),
      company,
      paymentUrl,
    });
    res.json({ success: true, data: { to, messageId: result.messageId, paymentUrl } });
  } catch (e) {
    if (e.code === 'SMTP_NOT_CONFIGURED') {
      throw new AppError(e.message, 503, 'SMTP_NOT_CONFIGURED');
    }
    throw new AppError(e.message || 'Failed to send email', 500, 'EMAIL_SEND_FAILED');
  }
});
