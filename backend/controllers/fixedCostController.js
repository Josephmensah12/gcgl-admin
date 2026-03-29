const { Op } = require('sequelize');
const asyncHandler = require('../middleware/asyncHandler');
const db = require('../models');
const { AppError } = require('../middleware/errorHandler');
const allocationService = require('../services/fixedCostAllocationService');

// Dashboard data
exports.getDashboard = asyncHandler(async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const monthYear = today.substring(0, 7);

  const activeShipments = await db.Shipment.findAll({
    where: { status: { [Op.in]: ['collecting', 'ready'] } },
    order: [['createdAt', 'DESC']],
  });

  const monthlyData = await db.MonthlyFixedCost.findOne({ where: { month_year: monthYear } });

  const recentAllocations = await db.FixedCostAllocation.findAll({
    where: { allocation_date: { [Op.gte]: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] } },
    order: [['allocation_date', 'DESC']],
    limit: 20,
    include: [{ model: db.Shipment, as: 'shipment', attributes: ['id', 'name'] }],
  });

  // Fixed cost categories
  const fixedCategories = await db.ExpenseCategory.findAll({ where: { is_fixed_cost: true, is_active: true } });

  res.json({
    success: true,
    data: { activeShipments, monthlyFixedCosts: monthlyData, recentAllocations, fixedCategories },
  });
});

// Get fixed costs for a shipment
exports.getShipmentFixedCosts = asyncHandler(async (req, res) => {
  const shipment = await db.Shipment.findByPk(req.params.id);
  if (!shipment) throw new AppError('Shipment not found', 404);

  const allocations = await db.FixedCostAllocation.findAll({
    where: { shipment_id: req.params.id },
    order: [['allocation_date', 'ASC']],
  });

  const monthlyBreakdown = await db.FixedCostAllocation.findAll({
    where: { shipment_id: req.params.id },
    attributes: [
      'month_year',
      [db.sequelize.fn('SUM', db.sequelize.col('allocated_amount')), 'monthly_total'],
      [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'days_allocated'],
      [db.sequelize.fn('AVG', db.sequelize.col('daily_rate')), 'avg_daily_rate'],
    ],
    group: ['month_year'],
    order: [['month_year', 'ASC']],
    raw: true,
  });

  res.json({
    success: true,
    data: {
      shipment,
      totalAllocated: parseFloat(shipment.accrued_fixed_costs) || 0,
      activeDays: shipment.active_days || 0,
      allocations,
      monthlyBreakdown: monthlyBreakdown.map((m) => ({
        ...m, monthly_total: parseFloat(m.monthly_total) || 0,
        avg_daily_rate: parseFloat(m.avg_daily_rate) || 0,
      })),
    },
  });
});

// Override shipment dates
exports.overrideDates = asyncHandler(async (req, res) => {
  const shipment = await db.Shipment.findByPk(req.params.id);
  if (!shipment) throw new AppError('Shipment not found', 404);

  const { startDate, endDate, notes } = req.body;
  if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
    throw new AppError('Start date must be before end date', 400);
  }

  const updates = { fixed_cost_notes: notes || null };
  if (startDate) { updates.start_date = startDate; updates.admin_start_date_override = startDate; }
  if (endDate) { updates.end_date = endDate; updates.admin_end_date_override = endDate; }

  await db.Shipment.update(updates, { where: { id: shipment.id } });

  const effectiveStart = startDate || (shipment.start_date ? String(shipment.start_date).substring(0, 10) : null);
  const effectiveEnd = endDate || (shipment.end_date ? String(shipment.end_date).substring(0, 10) : null);

  if (effectiveStart) {
    await allocationService.recalculateShipmentAllocations(shipment.id, effectiveStart, effectiveEnd);
  }

  const updated = await db.Shipment.findByPk(shipment.id);
  res.json({ success: true, data: updated });
});

// Manual allocation
exports.manualAllocation = asyncHandler(async (req, res) => {
  const shipment = await db.Shipment.findByPk(req.params.id);
  if (!shipment) throw new AppError('Shipment not found', 404);

  const { amount, date, notes } = req.body;
  if (!amount || !date) throw new AppError('Amount and date required', 400);

  await allocationService.allocateToShipment(
    shipment.id, date, 0, parseFloat(amount), date.substring(0, 7), 'manual', req.user?.id
  );

  res.json({ success: true, message: 'Manual allocation added' });
});

// Trigger daily allocation (manual trigger)
exports.triggerAllocation = asyncHandler(async (req, res) => {
  const { date } = req.body;
  const result = await allocationService.allocateDaily(date || null);
  res.json({ success: true, data: result });
});

// Recalculate monthly rate
exports.recalculateMonth = asyncHandler(async (req, res) => {
  const { monthYear } = req.body;
  if (!monthYear) throw new AppError('monthYear required (YYYY-MM)', 400);
  const dailyRate = await allocationService.recalculateMonthlyRate(monthYear);
  res.json({ success: true, data: { monthYear, dailyRate } });
});

// Toggle fixed cost flag on expense category
exports.toggleCategoryFixed = asyncHandler(async (req, res) => {
  const cat = await db.ExpenseCategory.findByPk(req.params.id);
  if (!cat) throw new AppError('Category not found', 404);
  await cat.update({ is_fixed_cost: !cat.is_fixed_cost });

  // Recalculate current month
  const monthYear = new Date().toISOString().substring(0, 7);
  await allocationService.recalculateMonthlyRate(monthYear);

  res.json({ success: true, data: cat });
});

// Toggle fixed cost on imported transaction
exports.toggleTransactionFixed = asyncHandler(async (req, res) => {
  const tx = await db.ImportedTransaction.findByPk(req.params.id);
  if (!tx) throw new AppError('Transaction not found', 404);
  await tx.update({ is_fixed_cost: !tx.is_fixed_cost });

  const monthYear = new Date(tx.transaction_date).toISOString().substring(0, 7);
  await allocationService.recalculateMonthlyRate(monthYear);

  res.json({ success: true, data: tx });
});
