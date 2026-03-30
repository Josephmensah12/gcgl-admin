const { Op } = require('sequelize');
const asyncHandler = require('../middleware/asyncHandler');
const db = require('../models');
const { AppError } = require('../middleware/errorHandler');
const { findShipmentForDate } = require('../services/shipmentMatcher');

// ── EXPENSES CRUD ─────────────────────────────────────────

exports.list = asyncHandler(async (req, res) => {
  const {
    page = 1, limit = 50, search = '', category_id = '', shipment_id = '',
    dateFrom = '', dateTo = '',
    sortBy = 'expense_date', sortOrder = 'DESC',
  } = req.query;

  const where = {};
  if (search) {
    where[Op.or] = [
      { description: { [Op.iLike]: `%${search}%` } },
      { vendor_or_payee: { [Op.iLike]: `%${search}%` } },
    ];
  }
  if (category_id) where.category_id = category_id;
  if (shipment_id) where.shipment_id = shipment_id;
  if (dateFrom) where.expense_date = { ...where.expense_date, [Op.gte]: dateFrom };
  if (dateTo) where.expense_date = { ...where.expense_date, [Op.lte]: dateTo };

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const { count, rows } = await db.Expense.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset,
    order: [[sortBy, sortOrder]],
    include: [
      { model: db.ExpenseCategory, as: 'category', attributes: ['id', 'name'] },
      { model: db.Shipment, as: 'shipment', attributes: ['id', 'name', 'status'] },
      { model: db.User, as: 'creator', attributes: ['id', 'full_name'] },
    ],
  });

  // Totals for filtered results
  const totals = await db.Expense.findOne({
    where,
    attributes: [
      [db.sequelize.fn('SUM', db.sequelize.col('amount')), 'total'],
      [db.sequelize.fn('COUNT', db.sequelize.col('Expense.id')), 'count'],
    ],
    raw: true,
  });

  res.json({
    success: true,
    data: {
      expenses: rows,
      totals: { total: parseFloat(totals.total) || 0, count: parseInt(totals.count) || 0 },
      pagination: {
        total: count, page: parseInt(page), limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit)),
      },
    },
  });
});

exports.detail = asyncHandler(async (req, res) => {
  const expense = await db.Expense.findByPk(req.params.id, {
    include: [
      { model: db.ExpenseCategory, as: 'category' },
      { model: db.Shipment, as: 'shipment' },
      { model: db.User, as: 'creator', attributes: ['id', 'full_name'] },
    ],
  });
  if (!expense) throw new AppError('Expense not found', 404, 'NOT_FOUND');
  res.json({ success: true, data: expense });
});

exports.create = asyncHandler(async (req, res) => {
  const { expense_date, category_id, description, vendor_or_payee, amount, shipment_id, notes, is_fixed_cost } = req.body;

  if (!expense_date || !category_id || !description || !amount) {
    throw new AppError('Date, category, description, and amount are required', 400, 'VALIDATION_ERROR');
  }

  // Auto-assign shipment by date if none provided
  const resolvedShipmentId = shipment_id || await findShipmentForDate(expense_date);

  // Auto-detect fixed cost from category if not explicitly set
  let fixedCost = is_fixed_cost || false;
  if (!is_fixed_cost) {
    const cat = await db.ExpenseCategory.findByPk(category_id);
    if (cat?.is_fixed_cost) fixedCost = true;
  }

  const expense = await db.Expense.create({
    expense_date, category_id, description,
    vendor_or_payee: vendor_or_payee || null,
    amount,
    shipment_id: resolvedShipmentId || null,
    is_fixed_cost: fixedCost,
    notes: notes || null,
    created_by: req.user?.id || null,
  });

  const full = await db.Expense.findByPk(expense.id, {
    include: [
      { model: db.ExpenseCategory, as: 'category', attributes: ['id', 'name'] },
      { model: db.Shipment, as: 'shipment', attributes: ['id', 'name'] },
    ],
  });

  res.status(201).json({ success: true, data: full });
});

exports.update = asyncHandler(async (req, res) => {
  const expense = await db.Expense.findByPk(req.params.id);
  if (!expense) throw new AppError('Expense not found', 404, 'NOT_FOUND');
  await expense.update(req.body);

  const full = await db.Expense.findByPk(expense.id, {
    include: [
      { model: db.ExpenseCategory, as: 'category', attributes: ['id', 'name'] },
      { model: db.Shipment, as: 'shipment', attributes: ['id', 'name'] },
    ],
  });
  res.json({ success: true, data: full });
});

exports.remove = asyncHandler(async (req, res) => {
  const expense = await db.Expense.findByPk(req.params.id);
  if (!expense) throw new AppError('Expense not found', 404, 'NOT_FOUND');
  await expense.destroy();
  res.json({ success: true, message: 'Expense deleted' });
});

// ── ANALYTICS ─────────────────────────────────────────────

exports.analytics = asyncHandler(async (req, res) => {
  const { dateFrom = '', dateTo = '', shipment_id = '' } = req.query;

  const where = {};
  if (dateFrom) where.expense_date = { ...where.expense_date, [Op.gte]: dateFrom };
  if (dateTo) where.expense_date = { ...where.expense_date, [Op.lte]: dateTo };
  if (shipment_id) where.shipment_id = shipment_id;

  // By category
  const byCategory = await db.Expense.findAll({
    where,
    attributes: [
      'category_id',
      [db.sequelize.fn('SUM', db.sequelize.col('amount')), 'total'],
      [db.sequelize.fn('COUNT', db.sequelize.col('Expense.id')), 'count'],
    ],
    group: ['category_id', 'category.id', 'category.name'],
    include: [{ model: db.ExpenseCategory, as: 'category', attributes: ['id', 'name'] }],
    order: [[db.sequelize.fn('SUM', db.sequelize.col('amount')), 'DESC']],
    raw: true,
    nest: true,
  });

  // By shipment
  const byShipment = await db.Expense.findAll({
    where,
    attributes: [
      'shipment_id',
      [db.sequelize.fn('SUM', db.sequelize.col('amount')), 'total'],
      [db.sequelize.fn('COUNT', db.sequelize.col('Expense.id')), 'count'],
    ],
    group: ['shipment_id', 'shipment.id', 'shipment.name'],
    include: [{ model: db.Shipment, as: 'shipment', attributes: ['id', 'name'] }],
    order: [[db.sequelize.fn('SUM', db.sequelize.col('amount')), 'DESC']],
    raw: true,
    nest: true,
  });

  // Monthly trend (last 6 months)
  const monthlyTrend = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    const mWhere = { ...where, expense_date: { [Op.gte]: start.toISOString().split('T')[0], [Op.lte]: end.toISOString().split('T')[0] } };
    const result = await db.Expense.findOne({
      where: mWhere,
      attributes: [
        [db.sequelize.fn('SUM', db.sequelize.col('amount')), 'total'],
        [db.sequelize.fn('COUNT', db.sequelize.col('Expense.id')), 'count'],
      ],
      raw: true,
    });
    monthlyTrend.push({
      month: start.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
      total: parseFloat(result.total) || 0,
      count: parseInt(result.count) || 0,
    });
  }

  // Summary
  const summary = await db.Expense.findOne({
    where,
    attributes: [
      [db.sequelize.fn('SUM', db.sequelize.col('amount')), 'total'],
      [db.sequelize.fn('COUNT', db.sequelize.col('Expense.id')), 'count'],
      [db.sequelize.fn('AVG', db.sequelize.col('amount')), 'avg'],
      [db.sequelize.fn('MAX', db.sequelize.col('amount')), 'max'],
    ],
    raw: true,
  });

  // Top vendors
  const topVendors = await db.Expense.findAll({
    where: { ...where, vendor_or_payee: { [Op.ne]: null, [Op.ne]: '' } },
    attributes: [
      'vendor_or_payee',
      [db.sequelize.fn('SUM', db.sequelize.col('amount')), 'total'],
      [db.sequelize.fn('COUNT', db.sequelize.col('Expense.id')), 'count'],
    ],
    group: ['vendor_or_payee'],
    order: [[db.sequelize.fn('SUM', db.sequelize.col('amount')), 'DESC']],
    limit: 10,
    raw: true,
  });

  res.json({
    success: true,
    data: {
      byCategory: byCategory.map((c) => ({ ...c, total: parseFloat(c.total) || 0, count: parseInt(c.count) })),
      byShipment: byShipment.map((s) => ({ ...s, total: parseFloat(s.total) || 0, count: parseInt(s.count) })),
      monthlyTrend,
      summary: {
        total: parseFloat(summary.total) || 0,
        count: parseInt(summary.count) || 0,
        avg: parseFloat(summary.avg) || 0,
        max: parseFloat(summary.max) || 0,
      },
      topVendors: topVendors.map((v) => ({ ...v, total: parseFloat(v.total) || 0, count: parseInt(v.count) })),
    },
  });
});

// ── CATEGORIES ─────────────────────────────────────────────

exports.listCategories = asyncHandler(async (req, res) => {
  const categories = await db.ExpenseCategory.findAll({
    where: { is_active: true },
    order: [['sort_order', 'ASC'], ['name', 'ASC']],
  });
  res.json({ success: true, data: categories });
});

exports.createCategory = asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name) throw new AppError('Category name required', 400, 'VALIDATION_ERROR');
  const cat = await db.ExpenseCategory.create({ name: name.trim() });
  res.status(201).json({ success: true, data: cat });
});

exports.updateCategory = asyncHandler(async (req, res) => {
  const cat = await db.ExpenseCategory.findByPk(req.params.id);
  if (!cat) throw new AppError('Category not found', 404, 'NOT_FOUND');
  await cat.update(req.body);
  res.json({ success: true, data: cat });
});

exports.deleteCategory = asyncHandler(async (req, res) => {
  const cat = await db.ExpenseCategory.findByPk(req.params.id);
  if (!cat) throw new AppError('Category not found', 404, 'NOT_FOUND');
  await cat.update({ is_active: false });
  res.json({ success: true, message: 'Category deactivated' });
});
