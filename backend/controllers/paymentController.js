const { Op } = require('sequelize');
const asyncHandler = require('../middleware/asyncHandler');
const db = require('../models');
const { AppError } = require('../middleware/errorHandler');

exports.list = asyncHandler(async (req, res) => {
  const {
    page = 1, limit = 20, search = '', paymentStatus = '',
    sortBy = 'created_at', sortOrder = 'DESC',
  } = req.query;

  const where = { status: 'completed' };

  if (paymentStatus) {
    where.paymentStatus = paymentStatus;
  }

  if (search) {
    where[Op.or] = [
      { customerName: { [Op.iLike]: `%${search}%` } },
      db.sequelize.where(
        db.sequelize.cast(db.sequelize.col('invoice_number'), 'TEXT'),
        { [Op.iLike]: `%${search}%` }
      ),
    ];
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const { count, rows } = await db.Invoice.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset,
    order: [[sortBy, sortOrder]],
    attributes: [
      'id', 'invoiceNumber', 'customerId', 'customerName', 'customerPhone',
      'finalTotal', 'paymentStatus', 'paymentMethod', 'amountPaid',
      'shipmentId', 'createdAt',
    ],
    include: [
      { model: db.Shipment, attributes: ['id', 'name'] },
    ],
  });

  res.json({
    success: true,
    data: {
      invoices: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit)),
      },
    },
  });
});

exports.updatePayment = asyncHandler(async (req, res) => {
  const invoice = await db.Invoice.findByPk(req.params.id);
  if (!invoice) {
    throw new AppError('Invoice not found', 404, 'NOT_FOUND');
  }

  const { paymentStatus, paymentMethod, amountPaid } = req.body;
  const updates = {};
  if (paymentStatus) updates.paymentStatus = paymentStatus;
  if (paymentMethod) updates.paymentMethod = paymentMethod;
  if (amountPaid !== undefined) updates.amountPaid = amountPaid;

  await invoice.update(updates);
  res.json({ success: true, data: invoice });
});

exports.getSummary = asyncHandler(async (req, res) => {
  // Overall payment stats
  const stats = await db.Invoice.findAll({
    where: { status: 'completed' },
    attributes: [
      'paymentStatus',
      [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count'],
      [db.sequelize.fn('SUM', db.sequelize.col('final_total')), 'total'],
    ],
    group: ['paymentStatus'],
    raw: true,
  });

  // Payment method breakdown (paid only)
  const methods = await db.Invoice.findAll({
    where: { status: 'completed', paymentStatus: 'paid' },
    attributes: [
      'paymentMethod',
      [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count'],
      [db.sequelize.fn('SUM', db.sequelize.col('final_total')), 'total'],
    ],
    group: ['paymentMethod'],
    raw: true,
  });

  // Aging of unpaid invoices
  const now = Date.now();
  const agingRanges = [
    { label: '0-7 days', max: 7 },
    { label: '8-14 days', max: 14 },
    { label: '15-30 days', max: 30 },
    { label: '30+ days', max: 9999 },
  ];

  const aging = [];
  let prevMax = 0;
  for (const range of agingRanges) {
    const minDate = new Date(now - range.max * 24 * 60 * 60 * 1000);
    const maxDate = new Date(now - prevMax * 24 * 60 * 60 * 1000);

    const result = await db.Invoice.findOne({
      where: {
        paymentStatus: 'unpaid',
        status: 'completed',
        createdAt: { [Op.gte]: minDate, [Op.lte]: maxDate },
      },
      attributes: [
        [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count'],
        [db.sequelize.fn('SUM', db.sequelize.col('final_total')), 'total'],
      ],
      raw: true,
    });

    aging.push({
      label: range.label,
      count: parseInt(result.count) || 0,
      total: parseFloat(result.total) || 0,
    });

    prevMax = range.max;
  }

  res.json({
    success: true,
    data: {
      byStatus: stats.map((s) => ({
        status: s.paymentStatus,
        count: parseInt(s.count),
        total: parseFloat(s.total) || 0,
      })),
      byMethod: methods.map((m) => ({
        method: m.paymentMethod || 'Unknown',
        count: parseInt(m.count),
        total: parseFloat(m.total) || 0,
      })),
      aging,
    },
  });
});
