const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const asyncHandler = require('../middleware/asyncHandler');
const db = require('../models');
const { AppError } = require('../middleware/errorHandler');

// Create or find customer
exports.createCustomer = asyncHandler(async (req, res) => {
  const { id, fullName, email, address, phone } = req.body;
  if (!fullName || !email || !address || !phone) {
    throw new AppError('All customer fields are required', 400, 'VALIDATION_ERROR');
  }
  const customer = await db.Customer.create({
    id: id || uuidv4(),
    fullName, email, address, phone,
  });
  res.status(201).json({ success: true, data: customer });
});

// Create recipient for customer
exports.createRecipient = asyncHandler(async (req, res) => {
  const { customerId } = req.params;
  const { id, firstName, lastName, phone, city, country, address, isDefault } = req.body;
  if (!firstName || !lastName || !phone || !city || !address) {
    throw new AppError('Required recipient fields missing', 400, 'VALIDATION_ERROR');
  }
  if (isDefault) {
    await db.Recipient.update({ isDefault: false }, { where: { customerId } });
  }
  const recipient = await db.Recipient.create({
    id: id || uuidv4(),
    customerId, firstName, lastName, phone, city,
    country: country || 'Ghana', address, isDefault: isDefault || false,
  });
  res.status(201).json({ success: true, data: recipient });
});

// Get next invoice number
exports.getNextNumber = asyncHandler(async (req, res) => {
  const result = await db.sequelize.transaction(async (t) => {
    const [seq] = await db.Sequence.findOrCreate({
      where: { key: 'next_invoice_num' },
      defaults: { value: 10001 },
      transaction: t,
    });
    const num = seq.value;
    await db.Sequence.update({ value: num + 1 }, { where: { key: 'next_invoice_num' }, transaction: t });
    return num;
  });
  res.json({ success: true, data: { number: result } });
});

// Create full invoice with line items
exports.createInvoice = asyncHandler(async (req, res) => {
  const { lineItems, ...invoiceData } = req.body;

  if (!invoiceData.customerId) throw new AppError('Customer is required', 400, 'VALIDATION_ERROR');
  if (!lineItems || lineItems.length === 0) throw new AppError('At least one line item is required', 400, 'VALIDATION_ERROR');

  const invoice = await db.sequelize.transaction(async (t) => {
    // Get next invoice number
    const [seq] = await db.Sequence.findOrCreate({
      where: { key: 'next_invoice_num' },
      defaults: { value: 10001 },
      transaction: t,
    });
    const invoiceNumber = seq.value;
    await db.Sequence.update({ value: invoiceNumber + 1 }, { where: { key: 'next_invoice_num' }, transaction: t });

    const inv = await db.Invoice.create({
      id: invoiceData.id || uuidv4(),
      invoiceNumber,
      customerId: invoiceData.customerId,
      customerName: invoiceData.customerName,
      customerEmail: invoiceData.customerEmail,
      customerAddress: invoiceData.customerAddress,
      customerPhone: invoiceData.customerPhone,
      recipientId: invoiceData.recipientId || null,
      recipientName: invoiceData.recipientName || null,
      recipientPhone: invoiceData.recipientPhone || null,
      recipientAddress: invoiceData.recipientAddress || null,
      subtotal: invoiceData.subtotal || 0,
      totalDiscount: invoiceData.totalDiscount || 0,
      finalTotal: invoiceData.finalTotal || 0,
      originalItemCount: invoiceData.originalItemCount || 0,
      addedItemCount: 0,
      paymentStatus: 'unpaid',
      shipmentId: invoiceData.shipmentId || null,
      status: 'completed',
    }, { transaction: t });

    for (let i = 0; i < lineItems.length; i++) {
      const { photos, dimensions, discount, ...itemData } = lineItems[i];

      // Look up capacity weight from catalog item, default 1.0
      let capacityWeight = 1.0;
      if (itemData.catalogItemId) {
        const catItem = await db.CatalogItem.findByPk(itemData.catalogItemId, { transaction: t });
        if (catItem) capacityWeight = parseFloat(catItem.capacityWeight) || 1.0;
      }

      const li = await db.LineItem.create({
        id: itemData.id || uuidv4(),
        invoiceId: inv.id,
        type: itemData.type || 'fixed',
        catalogItemId: itemData.catalogItemId || null,
        catalogName: itemData.catalogName || null,
        description: itemData.description || null,
        notes: itemData.notes ? String(itemData.notes).trim() || null : null,
        quantity: itemData.quantity || 1,
        basePrice: itemData.basePrice,
        discountType: discount?.type || null,
        discountAmount: discount?.amount || null,
        finalPrice: itemData.finalPrice,
        dimensionsL: dimensions?.length || null,
        dimensionsW: dimensions?.width || null,
        dimensionsH: dimensions?.height || null,
        capacityWeight,
        sortOrder: i,
      }, { transaction: t });

      if (photos && photos.length > 0) {
        await db.Photo.bulkCreate(
          photos.map((data, j) => ({ lineItemId: li.id, data, sortOrder: j })),
          { transaction: t }
        );
      }
    }

    return inv;
  });

  const full = await db.Invoice.findByPk(invoice.id, {
    include: [
      { model: db.LineItem, as: 'lineItems' },
      { model: db.Customer },
      { model: db.Shipment },
    ],
  });

  res.status(201).json({ success: true, data: full });
});

// Search customers (for autocomplete)
exports.searchCustomers = asyncHandler(async (req, res) => {
  const { q = '' } = req.query;
  const where = q ? {
    [Op.or]: [
      { fullName: { [Op.iLike]: `%${q}%` } },
      { phone: { [Op.iLike]: `%${q}%` } },
      { email: { [Op.iLike]: `%${q}%` } },
    ],
  } : {};
  const customers = await db.Customer.findAll({
    where, limit: 20, order: [['createdAt', 'DESC']],
    include: [{ model: db.Recipient, as: 'recipients' }],
  });
  res.json({ success: true, data: customers });
});

// Get recipients for customer
exports.getRecipients = asyncHandler(async (req, res) => {
  const recipients = await db.Recipient.findAll({
    where: { customerId: req.params.customerId },
    order: [['isDefault', 'DESC'], ['createdAt', 'DESC']],
  });
  res.json({ success: true, data: recipients });
});

// Get catalog items
exports.getCatalog = asyncHandler(async (req, res) => {
  const items = await db.CatalogItem.findAll({
    where: { active: true },
    order: [['category', 'ASC'], ['name', 'ASC']],
  });
  res.json({ success: true, data: items });
});
