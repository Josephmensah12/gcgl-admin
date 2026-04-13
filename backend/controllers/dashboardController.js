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

  // Active shipments (collecting/loading + en-route)
  const activeShipments = await db.Shipment.count({
    where: { status: { [Op.in]: ['collecting', 'ready', 'shipped', 'transit'] } },
  });
  const collectingCount = await db.Shipment.count({
    where: { status: { [Op.in]: ['collecting', 'ready'] } },
  });
  const enRouteCount = await db.Shipment.count({
    where: { status: { [Op.in]: ['shipped', 'transit'] } },
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
      collectingCount,
      enRouteCount,
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

  // Include tracked shipments + collecting (loading) ones for the map viz
  const shipments = await db.Shipment.findAll({
    where: {
      [Op.or]: [
        // Tracked shipments (have tracking number, not delivered or recently delivered)
        {
          trackingNumber: { [Op.ne]: null },
          [Op.or]: [
            { status: { [Op.notIn]: ['delivered'] } },
            { updatedAt: { [Op.gte]: sevenDaysAgo } },
          ],
        },
        // Collecting/loading shipments (show at origin on the map)
        { status: { [Op.in]: ['collecting', 'ready'] } },
      ],
    },
    order: [
      // Collecting first (at origin), then in-transit, then delivered
      [db.sequelize.literal("CASE WHEN status IN ('collecting','ready') THEN 0 WHEN status = 'delivered' THEN 2 ELSE 1 END"), 'ASC'],
      ['createdAt', 'DESC'],
    ],
  });

  // For each shipment, find the last CONFIRMED tracking event (date <= now)
  const now = new Date();
  const result = [];

  for (const s of shipments) {
    const lastEvent = await db.ShipmentEvent.findOne({
      where: {
        shipmentId: s.id,
        eventDate: { [Op.lte]: now },
      },
      order: [['eventDate', 'DESC']],
    });

    // Position the ship based on the last confirmed event location/type
    // instead of a time-based percentage
    let transitPercent = 0;
    let lastEventType = lastEvent?.eventType || null;
    let lastEventLocation = lastEvent?.location || '';
    let lastEventDate = lastEvent?.eventDate || null;

    if (lastEventType) {
      const EVENT_POSITIONS = {
        'EMSH': 5,   // Empty container shipped → at origin
        'GTIN': 8,   // Gate in at terminal → at origin
        'LOAD': 15,  // Loaded on vessel → departing origin
        'DEPA': 20,  // Departed → just left port
        'ARRV': 45,  // Arrived → at a port (could be transshipment or destination)
        'TSLO': 50,  // Transshipment loaded
        'TSDI': 45,  // Transshipment discharged
        'DISC': 92,  // Discharged → at destination
        'GTOT': 97,  // Gate out → leaving destination port
        'EMRT': 100, // Empty return → done
      };

      transitPercent = EVENT_POSITIONS[lastEventType] || 50;

      // Refine: if the event is a DEPA or ARRV, check if it's at origin,
      // transshipment, or destination
      const locLower = lastEventLocation.toLowerCase();
      if (lastEventType === 'DEPA') {
        if (locLower.includes('houston') || locLower.includes('united states')) {
          transitPercent = 20; // Just left Houston
        } else if (locLower.includes('freeport') || locLower.includes('bahamas')) {
          transitPercent = 55; // Left Freeport, heading to Ghana
        } else {
          transitPercent = 40; // Unknown port departure
        }
        // If departed and time has passed, interpolate toward next stop
        if (lastEventDate) {
          const daysSinceDep = (now.getTime() - new Date(lastEventDate).getTime()) / (1000 * 60 * 60 * 24);
          transitPercent = Math.min(transitPercent + Math.round(daysSinceDep * 2.5), 88);
        }
      } else if (lastEventType === 'ARRV') {
        if (locLower.includes('freeport') || locLower.includes('bahamas')) {
          transitPercent = 42;
        } else if (locLower.includes('tema') || locLower.includes('ghana')) {
          transitPercent = 92;
        }
      }
    } else {
      // No events — fall back to time-based if we have dates
      const dep = s.departureDate ? new Date(s.departureDate) : null;
      const eta = s.eta ? new Date(s.eta) : null;
      if (dep && eta && eta > dep) {
        const total = eta.getTime() - dep.getTime();
        const elapsed = now.getTime() - dep.getTime();
        transitPercent = Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
      }
    }

    let etaDays = null;
    if (s.eta) {
      etaDays = Math.ceil((new Date(s.eta).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }

    result.push({
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
      lastEvent: lastEvent ? {
        type: lastEvent.eventType,
        location: lastEvent.location,
        date: lastEvent.eventDate,
      } : null,
    });
  }

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
