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
    order: [['invoiceNumber', 'DESC']],
    limit: 10,
    include: [
      { model: db.Customer, attributes: ['fullName', 'phone'] },
    ],
  });

  res.json({ success: true, data: pickups });
});

/**
 * GET /api/v1/dashboard/tracked-shipments
 * Returns active tracked shipments (have a tracking_number) that either
 * haven't arrived yet or arrived within the last 7 days. Includes transit
 * percentage for the visual position.
 */
exports.getTrackedShipments = asyncHandler(async (req, res) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const shipments = await db.Shipment.findAll({
    where: {
      trackingNumber: { [Op.ne]: null },
      [Op.or]: [
        { status: { [Op.notIn]: ['delivered'] } },
        { updatedAt: { [Op.gte]: sevenDaysAgo } },
      ],
    },
    order: [['createdAt', 'DESC']],
  });

  const result = shipments.map((s) => {
    const dep = s.departureDate ? new Date(s.departureDate) : null;
    const eta = s.eta ? new Date(s.eta) : null;
    const now = new Date();

    let transitPercent = 0;
    if (dep && eta && eta > dep) {
      const total = eta.getTime() - dep.getTime();
      const elapsed = now.getTime() - dep.getTime();
      transitPercent = Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
    }
    // If delivered/discharged, snap to 100
    if (['delivered', 'customs'].includes(s.status) && transitPercent < 80) {
      transitPercent = s.status === 'delivered' ? 100 : 90;
    }

    let etaDays = null;
    if (eta) {
      etaDays = Math.ceil((eta.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }

    return {
      id: s.id,
      name: s.name,
      trackingNumber: s.trackingNumber,
      carrier: s.carrier,
      vesselName: s.vesselName,
      voyageNumber: s.voyageNumber,
      status: s.status,
      departureDate: s.departureDate,
      eta: s.eta,
      etaDays,
      transitPercent,
    };
  });

  res.json({ success: true, data: result });
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
      link: '/pickups?filter=unassigned',
    });
  }

  // Shipments near capacity (compute totalValue on the fly)
  const settings = await db.Setting.findByPk(1);
  const threshold = settings?.data?.shipmentSettings?.moneyThresholds?.max || 30000;

  const collecting = await db.Shipment.findAll({ where: { status: 'collecting' } });
  if (collecting.length > 0) {
    const totals = await db.Invoice.findAll({
      where: { shipmentId: { [Op.in]: collecting.map((s) => s.id) }, status: 'completed' },
      attributes: [
        'shipmentId',
        [db.sequelize.fn('SUM', db.sequelize.col('final_total')), 'totalValue'],
      ],
      group: ['shipmentId'],
      raw: true,
    });
    const totalMap = {};
    for (const t of totals) totalMap[t.shipmentId] = parseFloat(t.totalValue) || 0;

    for (const s of collecting) {
      const tv = totalMap[s.id] || 0;
      if (tv >= threshold * 0.9) {
        alerts.push({
          type: 'info',
          title: 'Shipment Near Capacity',
          message: `${s.name} is at $${tv.toLocaleString()} / $${threshold.toLocaleString()}`,
          link: `/shipments/${s.id}`,
        });
      }
    }
  }

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
      link: '/payments?paymentStatus=unpaid',
    });
  }

  res.json({ success: true, data: alerts });
});
