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

  // Generate expense number
  const lastExp = await db.Expense.findOne({ where: { expense_number: { [Op.ne]: null } }, order: [['id', 'DESC']] });
  const lastNum = lastExp?.expense_number ? parseInt(lastExp.expense_number.replace('EXP-', '')) : 0;
  const expenseNumber = `EXP-${String(lastNum + 1).padStart(5, '0')}`;

  const expense = await db.Expense.create({
    expense_number: expenseNumber,
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

// ── REVERT TO PERSONAL ────────────────────────────────────

exports.revertToPersonal = asyncHandler(async (req, res) => {
  const expense = await db.Expense.findByPk(req.params.id);
  if (!expense) throw new AppError('Expense not found', 404, 'NOT_FOUND');

  // If linked to a bank transaction, mark it as rejected
  if (expense.notes?.startsWith('Imported from bank:')) {
    const plaidId = expense.notes.replace('Imported from bank: ', '');
    const tx = await db.ImportedTransaction.findOne({ where: { plaid_transaction_id: plaidId } });
    if (tx) {
      await tx.update({
        status: 'rejected',
        is_business_expense: false,
        gcgl_category: null,
        shipment_id: null,
        notes: 'Reverted to personal from expense',
      });
    }
  }

  await expense.destroy();
  res.json({ success: true, message: 'Expense reverted to personal and removed' });
});

// ── REASSIGN ALL ──────────────────────────────────────────

exports.reassignAll = asyncHandler(async (req, res) => {
  // Clear all shipment assignments on expenses
  await db.Expense.update({ shipment_id: null }, { where: {} });

  // Clear all shipment assignments on imported transactions
  await db.ImportedTransaction.update({ shipment_id: null }, { where: { status: 'approved' } });

  // Reassign all expenses by date
  const expenses = await db.Expense.findAll();
  let expAssigned = 0;
  for (const exp of expenses) {
    const sid = await findShipmentForDate(exp.expense_date);
    if (sid) { await exp.update({ shipment_id: sid }); expAssigned++; }
  }

  // Reassign all approved transactions by date
  const transactions = await db.ImportedTransaction.findAll({ where: { status: 'approved', is_business_expense: true } });
  let txAssigned = 0;
  for (const tx of transactions) {
    const sid = await findShipmentForDate(tx.transaction_date);
    if (sid) { await tx.update({ shipment_id: sid }); txAssigned++; }
  }

  // Reassign invoices by date
  const invoices = await db.Invoice.findAll({ where: { status: 'completed' } });
  let invAssigned = 0;
  for (const inv of invoices) {
    const invDate = inv.createdAt ? new Date(inv.createdAt).toISOString().split('T')[0] : null;
    if (invDate) {
      const sid = await findShipmentForDate(invDate);
      if (sid && inv.shipmentId !== sid) {
        await inv.update({ shipmentId: sid });
        invAssigned++;
      }
    }
  }

  // Recalculate shipment totals
  const shipments = await db.Shipment.findAll();
  for (const sh of shipments) {
    const totals = await db.Invoice.findOne({
      where: { shipmentId: sh.id, status: 'completed' },
      attributes: [[db.sequelize.fn('SUM', db.sequelize.col('final_total')), 'totalValue']],
      raw: true,
    });
    await sh.update({ totalValue: parseFloat(totals?.totalValue) || 0 });
  }

  res.json({
    success: true,
    data: { expensesAssigned: expAssigned, transactionsAssigned: txAssigned, invoicesAssigned: invAssigned },
  });
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

  // By shipment — include ALL shipments, even those with $0 expenses
  const allShipments = await db.Shipment.findAll({
    attributes: ['id', 'name', 'status', 'start_date'],
    order: [['start_date', 'ASC'], ['createdAt', 'ASC']],
  });

  const expenseByShipment = await db.Expense.findAll({
    where,
    attributes: [
      'shipment_id',
      [db.sequelize.fn('SUM', db.sequelize.col('amount')), 'total'],
      [db.sequelize.fn('COUNT', db.sequelize.col('Expense.id')), 'count'],
    ],
    group: ['shipment_id'],
    raw: true,
  });

  const expMap = {};
  expenseByShipment.forEach((e) => { expMap[e.shipment_id] = { total: parseFloat(e.total) || 0, count: parseInt(e.count) }; });

  const byShipment = allShipments.map((s) => ({
    shipment_id: s.id,
    total: expMap[s.id]?.total || 0,
    count: expMap[s.id]?.count || 0,
    shipment: { id: s.id, name: s.name, status: s.status },
  }));

  // Add unassigned if any
  if (expMap[null] || expMap[undefined]) {
    const unassigned = expMap[null] || expMap[undefined];
    byShipment.push({ shipment_id: null, total: unassigned.total, count: unassigned.count, shipment: { id: null, name: null } });
  }

  // Monthly trend (last 13 months)
  const monthlyTrend = [];
  const now = new Date();
  for (let i = 12; i >= 0; i--) {
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
    const monthYear = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
    monthlyTrend.push({
      month: start.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
      monthYear,
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

// ── BULK AUTO-ASSIGN ──────────────────────────────────────

exports.bulkAutoAssign = asyncHandler(async (req, res) => {
  const expenses = await db.Expense.findAll({
    where: { shipment_id: null },
  });

  let assigned = 0;
  for (const exp of expenses) {
    const shipmentId = await findShipmentForDate(exp.expense_date);
    if (shipmentId) {
      await exp.update({ shipment_id: shipmentId });
      assigned++;
    }
  }

  // Also update imported transactions without shipment
  const transactions = await db.ImportedTransaction.findAll({
    where: { shipment_id: null, status: 'approved', is_business_expense: true },
  });

  let txAssigned = 0;
  for (const tx of transactions) {
    const shipmentId = await findShipmentForDate(tx.transaction_date);
    if (shipmentId) {
      await tx.update({ shipment_id: shipmentId });
      txAssigned++;
    }
  }

  res.json({ success: true, data: { expensesAssigned: assigned, transactionsAssigned: txAssigned, total: assigned + txAssigned } });
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
