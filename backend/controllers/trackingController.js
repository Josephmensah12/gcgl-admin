const { Op } = require('sequelize');
const asyncHandler = require('../middleware/asyncHandler');
const db = require('../models');
const { AppError } = require('../middleware/errorHandler');
const {
  createTracker,
  getTracker,
  listTrackers,
  isConfigured,
  mapStatusToGCGL,
  extractEvents,
  extractShipmentInfo,
  verifyWebhookSignature,
} = require('../services/trackingService');

/**
 * POST /api/v1/shipments/:id/track
 * Set a tracking number and create a Shipsgo ocean shipment tracker.
 */
exports.setTrackingNumber = asyncHandler(async (req, res) => {
  const shipment = await db.Shipment.findByPk(req.params.id);
  if (!shipment) throw new AppError('Shipment not found', 404, 'NOT_FOUND');

  const { tracking_number, carrier, number_type } = req.body;
  if (!tracking_number) throw new AppError('tracking_number is required', 400, 'MISSING_FIELD');

  const carrierScac = carrier || 'MSCU';

  let trackerId = null;
  let trackerError = null;
  if (isConfigured()) {
    try {
      const result = await createTracker(tracking_number, carrierScac, number_type);
      trackerId = result.trackerId;
      console.log(`Shipsgo tracker created: ${trackerId} for ${tracking_number}`);

      // Immediately fetch details if available
      if (trackerId) {
        try {
          await syncSingleShipment(shipment, trackerId);
        } catch (e) {
          console.log('Initial sync skipped:', e.message);
        }
      }
    } catch (e) {
      console.error('Shipsgo tracker creation failed:', e.message);
      trackerError = e.message;
    }
  }

  await shipment.update({
    trackingNumber: tracking_number.trim(),
    carrier: carrierScac,
    terminal49TrackerId: trackerId, // reusing column name for Shipsgo ID
  });

  res.json({
    success: true,
    data: {
      trackingNumber: shipment.trackingNumber,
      carrier: shipment.carrier,
      trackerId,
      message: trackerId
        ? 'Tracking active — updates will sync daily'
        : `Tracking number saved. ${trackerError || 'Shipsgo tracker was not created.'}`,
    },
  });
});

/**
 * GET /api/v1/shipments/:id/events
 */
exports.getEvents = asyncHandler(async (req, res) => {
  const shipment = await db.Shipment.findByPk(req.params.id, {
    attributes: ['id', 'name', 'trackingNumber', 'carrier', 'vesselName', 'voyageNumber', 'eta', 'departureDate', 'status'],
  });
  if (!shipment) throw new AppError('Shipment not found', 404, 'NOT_FOUND');

  const events = await db.ShipmentEvent.findAll({
    where: { shipmentId: req.params.id },
    order: [['eventDate', 'DESC']],
  });

  let etaDays = null;
  if (shipment.eta) {
    const diff = new Date(shipment.eta) - new Date();
    etaDays = Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  res.json({
    success: true,
    data: {
      shipment: {
        id: shipment.id,
        name: shipment.name,
        trackingNumber: shipment.trackingNumber,
        carrier: shipment.carrier,
        vesselName: shipment.vesselName,
        voyageNumber: shipment.voyageNumber,
        eta: shipment.eta,
        etaDays,
        departureDate: shipment.departureDate,
        status: shipment.status,
      },
      events: events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        eventDate: e.eventDate,
        location: e.location,
        vessel: e.vessel,
        voyage: e.voyage,
        description: e.description,
        source: e.source,
      })),
    },
  });
});

/**
 * GET /api/v1/tracking/status
 */
exports.trackingStatus = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { configured: isConfigured(), provider: 'shipsgo' } });
});

/**
 * POST /api/v1/shipments/:id/sync-tracking
 * Manually trigger a tracking sync for one shipment.
 */
exports.syncTracking = asyncHandler(async (req, res) => {
  const shipment = await db.Shipment.findByPk(req.params.id);
  if (!shipment) throw new AppError('Shipment not found', 404, 'NOT_FOUND');
  if (!shipment.terminal49TrackerId) throw new AppError('No tracker ID on this shipment', 400, 'NO_TRACKER');

  const result = await syncSingleShipment(shipment, shipment.terminal49TrackerId);
  res.json({ success: true, data: result });
});

/**
 * Sync a single shipment from Shipsgo. Shared by the manual trigger
 * and the daily cron.
 */
async function syncSingleShipment(shipment, shipsgoId) {
  const shipsgoData = await getTracker(shipsgoId);
  if (!shipsgoData) return { synced: false, reason: 'no data from Shipsgo' };

  const info = extractShipmentInfo(shipsgoData);
  const events = extractEvents(shipsgoData);

  // Upsert events (deduplicate by eventType + eventDate)
  let newEvents = 0;
  for (const ev of events) {
    const existing = await db.ShipmentEvent.findOne({
      where: {
        shipmentId: shipment.id,
        eventType: ev.eventType,
        eventDate: ev.eventDate,
      },
    });
    if (!existing) {
      await db.ShipmentEvent.create({
        shipmentId: shipment.id,
        eventType: ev.eventType,
        eventDate: ev.eventDate,
        location: ev.location,
        vessel: ev.vessel,
        voyage: ev.voyage,
        description: ev.description,
        rawData: shipsgoData,
        source: 'shipsgo',
      });
      newEvents++;
    }
  }

  // Update shipment fields
  const updates = {};
  if (info.vesselName && info.vesselName !== shipment.vesselName) updates.vesselName = info.vesselName;
  if (info.voyageNumber && info.voyageNumber !== shipment.voyageNumber) updates.voyageNumber = info.voyageNumber;
  if (info.eta) updates.eta = info.eta.split('T')[0];
  if (info.departureDate) updates.departureDate = info.departureDate.split('T')[0];

  // Auto-advance status — only based on CONFIRMED events (date in the past)
  const now = new Date();
  const confirmedEvents = events.filter(ev => new Date(ev.eventDate) <= now);
  if (confirmedEvents.length > 0) {
    // Find the most advanced confirmed event
    const eventPriority = { 'EMSH': 0, 'GTIN': 0, 'LOAD': 1, 'DEPA': 1, 'ARRV': 2, 'TSLO': 1, 'TSDI': 2, 'DISC': 3, 'GTOT': 3, 'EMRT': 3 };
    const statusByPriority = ['collecting', 'shipped', 'shipped', 'customs'];
    let maxPriority = -1;
    for (const ev of confirmedEvents) {
      const p = eventPriority[ev.eventType] ?? -1;
      if (p > maxPriority) maxPriority = p;
    }
    if (maxPriority >= 0) {
      const derivedStatus = statusByPriority[maxPriority] || null;
      if (derivedStatus) {
        const pipeline = ['collecting', 'ready', 'shipped', 'transit', 'customs', 'delivered'];
        const currentIdx = pipeline.indexOf(shipment.status);
        const newIdx = pipeline.indexOf(derivedStatus);
        if (newIdx > currentIdx) updates.status = derivedStatus;
      }
    }
  }

  if (Object.keys(updates).length > 0) {
    await shipment.update(updates);
  }

  return { synced: true, newEvents, updates: Object.keys(updates) };
}

/**
 * Daily cron job: sync all shipments that have a Shipsgo tracker.
 * Called from server.js cron schedule.
 */
exports.syncAllTracking = async function syncAllTracking() {
  if (!isConfigured()) {
    console.log('Tracking sync: Shipsgo not configured, skipping');
    return;
  }

  const shipments = await db.Shipment.findAll({
    where: {
      terminal49TrackerId: { [Op.ne]: null },
      status: { [Op.notIn]: ['delivered'] }, // skip delivered shipments
    },
  });

  console.log(`Tracking sync: ${shipments.length} active tracked shipment(s)`);
  let synced = 0;
  let errors = 0;

  for (const ship of shipments) {
    try {
      const result = await syncSingleShipment(ship, ship.terminal49TrackerId);
      if (result.synced) synced++;
      if (result.newEvents > 0) {
        console.log(`  ${ship.name}: ${result.newEvents} new event(s), updates: ${result.updates.join(', ') || 'none'}`);
      }
    } catch (e) {
      errors++;
      console.error(`  ${ship.name}: sync failed — ${e.message}`);
    }
  }

  console.log(`Tracking sync complete: ${synced} synced, ${errors} errors`);
  return { synced, errors };
};

/**
 * POST /api/v1/webhooks/shipsgo
 * Receive webhook events from Shipsgo (optional — used if webhooks are configured).
 */
exports.shipsgoWebhook = async (req, res) => {
  try {
    const payload = req.body;

    // Find shipment by container number or Shipsgo ID
    const containerNumber = payload.container_number || payload.containerNumber;
    const shipsgoId = payload.id || payload.shipment_id;

    let shipment = null;
    if (shipsgoId) {
      shipment = await db.Shipment.findOne({ where: { terminal49TrackerId: String(shipsgoId) } });
    }
    if (!shipment && containerNumber) {
      shipment = await db.Shipment.findOne({ where: { trackingNumber: containerNumber } });
    }

    if (!shipment) {
      console.log('Shipsgo webhook: no matching shipment for', containerNumber || shipsgoId);
      return res.status(200).json({ received: true, matched: false });
    }

    // Sync from the webhook payload
    const info = extractShipmentInfo(payload);
    const events = extractEvents(payload);

    let newEvents = 0;
    for (const ev of events) {
      const existing = await db.ShipmentEvent.findOne({
        where: { shipmentId: shipment.id, eventType: ev.eventType, eventDate: ev.eventDate },
      });
      if (!existing) {
        await db.ShipmentEvent.create({
          shipmentId: shipment.id,
          eventType: ev.eventType,
          eventDate: ev.eventDate,
          location: ev.location,
          vessel: ev.vessel,
          voyage: ev.voyage,
          description: ev.description,
          rawData: payload,
          source: 'shipsgo',
        });
        newEvents++;
      }
    }

    const updates = {};
    if (info.vesselName) updates.vesselName = info.vesselName;
    if (info.voyageNumber) updates.voyageNumber = info.voyageNumber;
    if (info.eta) updates.eta = info.eta.split('T')[0];
    if (info.departureDate) updates.departureDate = info.departureDate.split('T')[0];

    const gcglStatus = mapStatusToGCGL(info.status);
    if (gcglStatus) {
      const pipeline = ['collecting', 'ready', 'shipped', 'transit', 'customs', 'delivered'];
      if (pipeline.indexOf(gcglStatus) > pipeline.indexOf(shipment.status)) {
        updates.status = gcglStatus;
      }
    }

    if (Object.keys(updates).length > 0) await shipment.update(updates);

    console.log(`Shipsgo webhook: ${newEvents} new event(s) for ${shipment.name}`);
    return res.status(200).json({ received: true, newEvents });
  } catch (err) {
    console.error('Shipsgo webhook error:', err.message);
    return res.status(200).json({ received: true, error: err.message });
  }
};
