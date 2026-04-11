const { Op } = require('sequelize');
const asyncHandler = require('../middleware/asyncHandler');
const db = require('../models');
const { AppError } = require('../middleware/errorHandler');

exports.list = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search = '', sortBy = 'created_at', sortOrder = 'DESC' } = req.query;

  const where = {};
  if (search) {
    where[Op.or] = [
      { fullName: { [Op.iLike]: `%${search}%` } },
      { email: { [Op.iLike]: `%${search}%` } },
      { phone: { [Op.iLike]: `%${search}%` } },
      { address: { [Op.iLike]: `%${search}%` } },
    ];
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const { count, rows } = await db.Customer.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset,
    order: [[sortBy, sortOrder]],
    // distinct avoids count inflation from the has-many recipients join
    distinct: true,
    col: 'id',
    include: [
      { model: db.Recipient, as: 'recipients', attributes: ['id', 'firstName', 'lastName', 'phone', 'city'] },
    ],
  });

  // Get invoice stats per customer
  const customerIds = rows.map((c) => c.id);
  const invoiceStats = await db.Invoice.findAll({
    where: { customerId: { [Op.in]: customerIds }, status: 'completed' },
    attributes: [
      'customerId',
      [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'totalInvoices'],
      [db.sequelize.fn('SUM', db.sequelize.col('final_total')), 'totalValue'],
      [db.sequelize.fn('SUM', db.sequelize.literal("CASE WHEN payment_status = 'unpaid' THEN final_total ELSE 0 END")), 'unpaidValue'],
    ],
    group: ['customerId'],
    raw: true,
  });

  const statsMap = {};
  invoiceStats.forEach((s) => {
    statsMap[s.customerId] = {
      totalInvoices: parseInt(s.totalInvoices),
      totalValue: parseFloat(s.totalValue) || 0,
      unpaidValue: parseFloat(s.unpaidValue) || 0,
    };
  });

  const customers = rows.map((c) => ({
    ...c.toJSON(),
    stats: statsMap[c.id] || { totalInvoices: 0, totalValue: 0, unpaidValue: 0 },
  }));

  res.json({
    success: true,
    data: {
      customers,
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
  const customer = await db.Customer.findByPk(req.params.id, {
    include: [
      { model: db.Recipient, as: 'recipients' },
      {
        model: db.Invoice,
        as: 'invoices',
        order: [['createdAt', 'DESC']],
        limit: 50,
        include: [
          { model: db.Shipment, attributes: ['id', 'name', 'status'] },
        ],
      },
    ],
  });

  if (!customer) {
    throw new AppError('Customer not found', 404, 'NOT_FOUND');
  }

  // Compute stats
  const stats = await db.Invoice.findOne({
    where: { customerId: customer.id, status: 'completed' },
    attributes: [
      [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'totalInvoices'],
      [db.sequelize.fn('SUM', db.sequelize.col('final_total')), 'totalValue'],
      [db.sequelize.fn('SUM', db.sequelize.literal("CASE WHEN payment_status = 'unpaid' THEN final_total ELSE 0 END")), 'unpaidValue'],
      [db.sequelize.fn('SUM', db.sequelize.literal("CASE WHEN payment_status = 'paid' THEN final_total ELSE 0 END")), 'paidValue'],
    ],
    raw: true,
  });

  res.json({
    success: true,
    data: {
      ...customer.toJSON(),
      stats: {
        totalInvoices: parseInt(stats?.totalInvoices) || 0,
        totalValue: parseFloat(stats?.totalValue) || 0,
        unpaidValue: parseFloat(stats?.unpaidValue) || 0,
        paidValue: parseFloat(stats?.paidValue) || 0,
      },
    },
  });
});

exports.update = asyncHandler(async (req, res) => {
  const customer = await db.Customer.findByPk(req.params.id);
  if (!customer) {
    throw new AppError('Customer not found', 404, 'NOT_FOUND');
  }

  const { fullName, email, address, phone } = req.body;
  await customer.update({ fullName, email, address, phone });

  res.json({ success: true, data: customer });
});
