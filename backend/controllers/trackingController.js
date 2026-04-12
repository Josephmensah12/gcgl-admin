const { Op } = require('sequelize');
const asyncHandler = require('../middleware/asyncHandler');
const db = require('../models');
const { AppError } = require('../middleware/errorHandler');
const {
  createTracker,
  isConfigured,
  parseWebhookPayload,
  mapEventToStatus,
} = require('../services/trackingService');

/**
 * POST /api/v1/shipments/:id/track
 * Set a tracking number on a shipment and create a Terminal49 tracker.
 */
exports.setTrackingNumber = asyncHandler(async (req, res) => {
  const shipment = await db.Shipment.findByPk(req.params.id);
  if (!shipment) throw new AppError('Shipment not found', 404, 'NOT_FOUND');

  const { tracking_number, carrier } = req.body;
  if (!tracking_number) throw new AppError('tracking_number is required', 400, 'MISSING_FIELD');

  const carrierName = carrier || shipment.carrier || 'MSC';

  // Create Terminal49 tracker
  let trackerId = null;
  if (isConfigured()) {
    try {
      const result = await createTracker(tracking_number, carrierName);
      trackerId = result.trackerId;
      console.log(`Terminal49 tracker created: ${trackerId} for ${tracking_number}`);
    } catch (e) {
      console.error('Terminal49 tracker creation failed:', e.message);
      // Don't fail the request — save the number even if Terminal49 is down
    }
  }

  await shipment.update({
    trackingNumber: tracking_number.trim(),
    carrier: carrierName,
    terminal49TrackerId: trackerId,
  });

  res.json({
    success: true,
    data: {
      trackingNumber: shipment.trackingNumber,
      carrier: shipment.carrier,
      trackerId,
      message: trackerId
        ? 'Tracking active — events will arrive via webhook'
        : 'Tracking number saved but Terminal49 tracker was not created',
    },
  });
});

/**
 * GET /api/v1/shipments/:id/events
 * Return the tracking event timeline for a shipment.
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

  // ETA countdown
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
 * Check if Terminal49 is configured.
 */
exports.trackingStatus = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { configured: isConfigured() } });
});

/**
 * POST /api/v1/webhooks/terminal49
 * Receive tracking events from Terminal49. No auth (called by Terminal49 servers).
 * Always returns 200 to prevent retries.
 */
exports.terminal49Webhook = async (req, res) => {
  try {
    const payload = req.body;
    const parsed = parseWebhookPayload(payload);
    if (!parsed) {
      return res.status(200).json({ received: true, skipped: 'unparseable' });
    }

    // Find the shipment by terminal49TrackerId
    const trackerId = parsed.trackingRequestId;
    let shipment = null;
    if (trackerId) {
      shipment = await db.Shipment.findOne({
        where: { terminal49TrackerId: trackerId },
      });
    }

    if (!shipment) {
      console.log('Terminal49 webhook: no matching shipment for tracker', trackerId);
      return res.status(200).json({ received: true, matched: false });
    }

    // Deduplicate: check if we already have this exact event
    const existing = await db.ShipmentEvent.findOne({
      where: {
        shipmentId: shipment.id,
        eventType: parsed.eventType,
        eventDate: parsed.eventDate,
      },
    });
    if (existing) {
      return res.status(200).json({ received: true, duplicate: true });
    }

    // Insert event
    await db.ShipmentEvent.create({
      shipmentId: shipment.id,
      eventType: parsed.eventType,
      eventDate: parsed.eventDate,
      location: parsed.location,
      vessel: parsed.vessel,
      voyage: parsed.voyage,
      description: parsed.description,
      rawData: parsed.raw,
      source: 'terminal49',
    });

    // Auto-update shipment fields from event data
    const updates = {};
    if (parsed.vessel && !shipment.vesselName) updates.vesselName = parsed.vessel;
    if (parsed.voyage && !shipment.voyageNumber) updates.voyageNumber = parsed.voyage;
    if (parsed.eta) updates.eta = parsed.eta.split('T')[0];

    // Auto-advance shipment status
    const newStatus = mapEventToStatus(parsed.eventType);
    if (newStatus) {
      const pipeline = ['collecting', 'ready', 'shipped', 'transit', 'customs', 'delivered'];
      const currentIdx = pipeline.indexOf(shipment.status);
      const newIdx = pipeline.indexOf(newStatus);
      if (newIdx > currentIdx) {
        updates.status = newStatus;
        if (newStatus === 'shipped' && !shipment.departureDate) {
          updates.departureDate = parsed.eventDate.split ? parsed.eventDate.split('T')[0] : new Date(parsed.eventDate).toISOString().split('T')[0];
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      await shipment.update(updates);
    }

    console.log(`Terminal49 webhook: ${parsed.eventType} for shipment ${shipment.name} (${parsed.location || 'no location'})`);
    return res.status(200).json({ received: true, shipmentId: shipment.id, eventType: parsed.eventType });
  } catch (err) {
    console.error('Terminal49 webhook error:', err.message);
    return res.status(200).json({ received: true, error: err.message });
  }
};
