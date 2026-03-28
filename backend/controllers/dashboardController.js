const { Op, fn, col, literal } = require('sequelize');
const asyncHandler = require('../middleware/asyncHandler');
const db = require('../models');

exports.getMetrics = asyncHandler(async (req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  // Warehouse items (invoices not assigned to shipment or shipment still collecting)
  const warehouseItems = await db.Invoice.count({
    where: {
      [Op.or]: [
        { shipmentId: null },
        { shipmentId: '' },
      ],
      status: 'completed',
    },
  });

  // Warehouse value
  const warehouseValue = await db.Invoice.sum('finalTotal', {
    where: {
      [Op.or]: [
        { shipmentId: null },
        { shipmentId: '' },
      ],
      status: 'completed',
    },
  });

  // Active shipments
  const activeShipments = await db.Shipment.count({
    where: { status: { [Op.in]: ['collecting', 'ready'] } },
  });

  // Revenue this month
  const revenueThisMonth = await db.Invoice.sum('finalTotal', {
    where: {
      createdAt: { [Op.gte]: startOfMonth },
      status: 'completed',
    },
  });

  // Revenue last month
  const revenueLastMonth = await db.Invoice.sum('finalTotal', {
    where: {
      createdAt: { [Op.gte]: startOfLastMonth, [Op.lte]: endOfLastMonth },
      status: 'completed',
    },
  });

  // Unpaid invoices
  const unpaidInvoices = await db.Invoice.sum('finalTotal', {
    where: { paymentStatus: 'unpaid', status: 'completed' },
  });

  const unpaidCount = await db.Invoice.count({
    where: { paymentStatus: 'unpaid', status: 'completed' },
  });

  // Total customers
  const totalCustomers = await db.Customer.count();

  // Invoices this month
  const invoicesThisMonth = await db.Invoice.count({
    where: { createdAt: { [Op.gte]: startOfMonth }, status: 'completed' },
  });

  res.json({
    success: true,
    data: {
      warehouseItems,
      warehouseValue: parseFloat(warehouseValue) || 0,
      activeShipments,
      revenueThisMonth: parseFloat(revenueThisMonth) || 0,
      revenueLastMonth: parseFloat(revenueLastMonth) || 0,
      unpaidTotal: parseFloat(unpaidInvoices) || 0,
      unpaidCount,
      totalCustomers,
      invoicesThisMonth,
    },
  });
});

exports.getRevenueChart = asyncHandler(async (req, res) => {
  const { period = '6months' } = req.query;
  let months = 6;
  if (period === '12months') months = 12;
  if (period === '3months') months = 3;

  const data = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

    const revenue = await db.Invoice.sum('finalTotal', {
      where: {
        createdAt: { [Op.gte]: start, [Op.lte]: end },
        status: 'completed',
      },
    });

    const count = await db.Invoice.count({
      where: {
        createdAt: { [Op.gte]: start, [Op.lte]: end },
        status: 'completed',
      },
    });

    data.push({
      month: start.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
      revenue: parseFloat(revenue) || 0,
      invoices: count,
    });
  }

  res.json({ success: true, data });
});

exports.getRecentPickups = asyncHandler(async (req, res) => {
  const pickups = await db.Invoice.findAll({
    where: { status: 'completed' },
    order: [['createdAt', 'DESC']],
    limit: 10,
    include: [
      { model: db.Customer, attributes: ['fullName', 'phone'] },
    ],
  });

  res.json({ success: true, data: pickups });
});

exports.getAlerts = asyncHandler(async (req, res) => {
  const alerts = [];

  // Aging items (in warehouse > 7 days, no shipment)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const agingCount = await db.Invoice.count({
    where: {
      [Op.or]: [{ shipmentId: null }, { shipmentId: '' }],
      status: 'completed',
      createdAt: { [Op.lte]: sevenDaysAgo },
    },
  });
  if (agingCount > 0) {
    alerts.push({
      type: 'warning',
      title: 'Aging Warehouse Items',
      message: `${agingCount} items have been in the warehouse for over 7 days`,
    });
  }

  // Shipments near capacity
  const settings = await db.Setting.findByPk(1);
  const threshold = settings?.data?.shipmentSettings?.moneyThresholds?.max || 30000;

  const nearCapacity = await db.Shipment.findAll({
    where: {
      status: 'collecting',
      totalValue: { [Op.gte]: threshold * 0.9 },
    },
  });
  nearCapacity.forEach((s) => {
    alerts.push({
      type: 'info',
      title: 'Shipment Near Capacity',
      message: `${s.name} is at $${parseFloat(s.totalValue).toLocaleString()} / $${threshold.toLocaleString()}`,
    });
  });

  // Unpaid invoices > 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const overdueCount = await db.Invoice.count({
    where: {
      paymentStatus: 'unpaid',
      status: 'completed',
      createdAt: { [Op.lte]: thirtyDaysAgo },
    },
  });
  if (overdueCount > 0) {
    alerts.push({
      type: 'error',
      title: 'Overdue Invoices',
      message: `${overdueCount} unpaid invoices are over 30 days old`,
    });
  }

  res.json({ success: true, data: alerts });
});
