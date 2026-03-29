const { Op } = require('sequelize');
const asyncHandler = require('../middleware/asyncHandler');
const db = require('../models');
const { AppError } = require('../middleware/errorHandler');

// Recalculate invoice payment totals from active transactions
async function recalculateInvoiceTotals(invoice, transaction = null) {
  const opts = transaction ? { transaction } : {};

  const txns = await db.InvoicePayment.findAll({
    where: { invoiceId: invoice.id, voidedAt: null },
    ...opts,
  });

  let paymentsSum = 0;
  let refundsSum = 0;
  for (const tx of txns) {
    const amt = parseFloat(tx.amount) || 0;
    if (tx.transactionType === 'PAYMENT') paymentsSum += amt;
    else refundsSum += amt;
  }

  const netPaid = Math.max(0, paymentsSum - refundsSum);
  const totalAmount = parseFloat(invoice.finalTotal) || 0;

  invoice.amountPaid = netPaid;

  if (netPaid <= 0) {
    invoice.paymentStatus = 'unpaid';
  } else if (netPaid >= totalAmount) {
    invoice.paymentStatus = 'paid';
  } else {
    invoice.paymentStatus = 'partial';
  }

  await invoice.save(opts);
  return { paymentsSum, refundsSum, netPaid, status: invoice.paymentStatus };
}

// POST /api/v1/invoices/:id/transactions - Record payment or refund
exports.createTransaction = asyncHandler(async (req, res) => {
  const invoice = await db.Invoice.findByPk(req.params.id);
  if (!invoice) throw new AppError('Invoice not found', 404, 'NOT_FOUND');

  const { transaction_type, amount, payment_method, payment_method_other_text, comment, payment_date } = req.body;

  if (!amount || parseFloat(amount) <= 0) {
    throw new AppError('Amount must be greater than 0', 400, 'VALIDATION_ERROR');
  }
  if (!payment_method) {
    throw new AppError('Payment method is required', 400, 'VALIDATION_ERROR');
  }
  if (!comment || !comment.trim()) {
    throw new AppError('Comment is required', 400, 'VALIDATION_ERROR');
  }
  if (payment_method === 'Other' && (!payment_method_other_text || !payment_method_other_text.trim())) {
    throw new AppError('Please specify the payment method', 400, 'VALIDATION_ERROR');
  }

  const totalAmount = parseFloat(invoice.finalTotal) || 0;
  const currentPaid = parseFloat(invoice.amountPaid) || 0;
  const parsedAmount = parseFloat(amount);
  const type = transaction_type || 'PAYMENT';

  if (type === 'PAYMENT' && currentPaid + parsedAmount > totalAmount) {
    throw new AppError(`Payment would exceed invoice total. Max allowed: $${(totalAmount - currentPaid).toFixed(2)}`, 400, 'OVERPAYMENT');
  }
  if (type === 'REFUND' && parsedAmount > currentPaid) {
    throw new AppError(`Refund cannot exceed amount paid ($${currentPaid.toFixed(2)})`, 400, 'OVER_REFUND');
  }

  const dbTx = await db.sequelize.transaction();
  try {
    const txRecord = await db.InvoicePayment.create({
      invoiceId: invoice.id,
      transactionType: type,
      paymentDate: payment_date || new Date(),
      amount: parsedAmount,
      paymentMethod: payment_method,
      paymentMethodOtherText: payment_method === 'Other' ? payment_method_other_text?.trim() : null,
      comment: comment.trim(),
      recordedByUserId: req.user?.id || null,
    }, { transaction: dbTx });

    await recalculateInvoiceTotals(invoice, dbTx);

    // Also update the paymentMethod field on invoice for quick reference
    if (type === 'PAYMENT') {
      invoice.paymentMethod = payment_method;
      await invoice.save({ transaction: dbTx });
    }

    await dbTx.commit();

    const full = await db.InvoicePayment.findByPk(txRecord.id, {
      include: [{ model: db.User, as: 'recordedBy', attributes: ['id', 'full_name'] }],
    });

    res.status(201).json({
      success: true,
      data: { transaction: full, invoice },
      message: `${type === 'PAYMENT' ? 'Payment' : 'Refund'} recorded successfully`,
    });
  } catch (err) {
    await dbTx.rollback();
    throw err;
  }
});

// GET /api/v1/invoices/:id/transactions - Get transaction history
exports.getTransactions = asyncHandler(async (req, res) => {
  const invoice = await db.Invoice.findByPk(req.params.id);
  if (!invoice) throw new AppError('Invoice not found', 404, 'NOT_FOUND');

  const { includeVoided = 'false' } = req.query;
  const where = { invoiceId: req.params.id };
  if (includeVoided !== 'true') where.voidedAt = null;

  const txns = await db.InvoicePayment.findAll({
    where,
    order: [['paymentDate', 'DESC']],
    include: [
      { model: db.User, as: 'recordedBy', attributes: ['id', 'full_name'] },
      { model: db.User, as: 'voidedBy', attributes: ['id', 'full_name'] },
    ],
  });

  // Summary
  let paymentsSum = 0;
  let refundsSum = 0;
  let activeCount = 0;
  txns.forEach((tx) => {
    if (!tx.voidedAt) {
      activeCount++;
      const amt = parseFloat(tx.amount) || 0;
      if (tx.transactionType === 'PAYMENT') paymentsSum += amt;
      else refundsSum += amt;
    }
  });

  res.json({
    success: true,
    data: {
      transactions: txns,
      summary: {
        totalAmount: parseFloat(invoice.finalTotal) || 0,
        paymentsSum,
        refundsSum,
        amountPaid: parseFloat(invoice.amountPaid) || 0,
        balanceDue: Math.max(0, (parseFloat(invoice.finalTotal) || 0) - (parseFloat(invoice.amountPaid) || 0)),
        transactionCount: txns.length,
        activeCount,
      },
    },
  });
});

// POST /api/v1/invoices/:id/transactions/:txId/void - Void a transaction
exports.voidTransaction = asyncHandler(async (req, res) => {
  const invoice = await db.Invoice.findByPk(req.params.id);
  if (!invoice) throw new AppError('Invoice not found', 404, 'NOT_FOUND');

  const tx = await db.InvoicePayment.findByPk(req.params.txId);
  if (!tx || tx.invoiceId !== req.params.id) throw new AppError('Transaction not found', 404, 'NOT_FOUND');
  if (tx.voidedAt) throw new AppError('Transaction already voided', 400, 'ALREADY_VOIDED');

  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    throw new AppError('Void reason is required', 400, 'VALIDATION_ERROR');
  }

  const dbTx = await db.sequelize.transaction();
  try {
    tx.voidedAt = new Date();
    tx.voidedByUserId = req.user?.id || null;
    tx.voidReason = reason.trim();
    await tx.save({ transaction: dbTx });

    await recalculateInvoiceTotals(invoice, dbTx);

    await dbTx.commit();

    const full = await db.InvoicePayment.findByPk(tx.id, {
      include: [
        { model: db.User, as: 'recordedBy', attributes: ['id', 'full_name'] },
        { model: db.User, as: 'voidedBy', attributes: ['id', 'full_name'] },
      ],
    });

    res.json({
      success: true,
      data: { transaction: full, invoice },
      message: `${tx.transactionType === 'PAYMENT' ? 'Payment' : 'Refund'} voided successfully`,
    });
  } catch (err) {
    await dbTx.rollback();
    throw err;
  }
});

// GET /api/v1/payments - Global payment transaction list
exports.listAll = asyncHandler(async (req, res) => {
  const {
    page = 1, limit = 50, search = '', paymentMethod = '', transactionType = '',
    dateFrom = '', dateTo = '', includeVoided = 'false',
    sortBy = 'payment_date', sortOrder = 'DESC',
  } = req.query;

  const where = {};
  if (includeVoided !== 'true') where.voidedAt = null;
  if (transactionType) where.transactionType = { [Op.in]: transactionType.split(',') };
  if (paymentMethod) where.paymentMethod = { [Op.in]: paymentMethod.split(',') };
  if (dateFrom) where.paymentDate = { ...where.paymentDate, [Op.gte]: new Date(dateFrom) };
  if (dateTo) where.paymentDate = { ...where.paymentDate, [Op.lte]: new Date(dateTo + 'T23:59:59') };

  const invoiceWhere = {};
  if (search) {
    invoiceWhere[Op.or] = [
      { customerName: { [Op.iLike]: `%${search}%` } },
      db.sequelize.where(db.sequelize.cast(db.sequelize.col('invoice.invoice_number'), 'TEXT'), { [Op.iLike]: `%${search}%` }),
    ];
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const { count, rows } = await db.InvoicePayment.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset,
    order: [[sortBy === 'payment_date' ? 'paymentDate' : sortBy, sortOrder]],
    include: [
      {
        model: db.Invoice, as: 'invoice',
        attributes: ['id', 'invoiceNumber', 'customerName', 'customerId', 'finalTotal', 'paymentStatus'],
        where: Object.keys(invoiceWhere).length > 0 ? invoiceWhere : undefined,
      },
      { model: db.User, as: 'recordedBy', attributes: ['id', 'full_name'] },
      { model: db.User, as: 'voidedBy', attributes: ['id', 'full_name'] },
    ],
  });

  // Aggregates (from filtered active transactions)
  const aggWhere = { ...where, voidedAt: null };
  const agg = await db.InvoicePayment.findAll({
    where: aggWhere,
    attributes: [
      'transactionType',
      [db.sequelize.fn('SUM', db.sequelize.col('amount')), 'total'],
      [db.sequelize.fn('COUNT', db.sequelize.col('InvoicePayment.id')), 'count'],
    ],
    group: ['transactionType'],
    include: [{
      model: db.Invoice, as: 'invoice', attributes: [],
      where: Object.keys(invoiceWhere).length > 0 ? invoiceWhere : undefined,
    }],
    raw: true,
  });

  let totalPayments = 0, totalRefunds = 0, paymentCount = 0, refundCount = 0;
  agg.forEach((a) => {
    if (a.transactionType === 'PAYMENT') { totalPayments = parseFloat(a.total) || 0; paymentCount = parseInt(a.count); }
    else { totalRefunds = parseFloat(a.total) || 0; refundCount = parseInt(a.count); }
  });

  res.json({
    success: true,
    data: {
      transactions: rows,
      aggregates: {
        totalPayments, totalRefunds,
        netCollected: totalPayments - totalRefunds,
        paymentCount, refundCount,
        transactionCount: paymentCount + refundCount,
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

exports.getMethods = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      methods: db.InvoicePayment.PAYMENT_METHODS,
      transactionTypes: ['PAYMENT', 'REFUND'],
    },
  });
});
