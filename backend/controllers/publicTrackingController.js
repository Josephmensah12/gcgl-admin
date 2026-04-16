const { Op } = require('sequelize');
const db = require('../models');

/**
 * GET /api/public/track?invoice=601&phone=3467028488
 *
 * Public, unauthenticated endpoint for customers to track their shipment.
 * Requires both invoice number and customer phone (last 10 digits) to match.
 * Returns sanitized data — no financials.
 */
exports.track = async (req, res) => {
  try {
    const { invoice, phone } = req.query;

    if (!invoice || !phone) {
      return res.status(400).json({
        success: false,
        error: 'Both invoice number and phone number are required',
      });
    }

    // Normalize phone: strip non-digits, take last 10
    const cleanPhone = (phone || '').replace(/\D/g, '').slice(-10);
    if (cleanPhone.length < 7) {
      return res.status(400).json({
        success: false,
        error: 'Phone number too short',
      });
    }

    // Find invoice by number
    const invoiceNumber = parseInt(invoice);
    if (isNaN(invoiceNumber)) {
      return res.status(400).json({ success: false, error: 'Invalid invoice number' });
    }

    const inv = await db.Invoice.findOne({
      where: { invoiceNumber },
      include: [
        { model: db.Shipment, attributes: ['id', 'name', 'status', 'trackingNumber', 'carrier', 'vesselName', 'voyageNumber', 'eta', 'departureDate'] },
        { model: db.LineItem, as: 'lineItems', attributes: ['id', 'catalogName', 'description', 'quantity'] },
      ],
    });

    if (!inv) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    // Verify phone matches customer phone (last 10 digits)
    const customerPhone = (inv.customerPhone || '').replace(/\D/g, '').slice(-10);
    if (customerPhone !== cleanPhone) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    // Get tracking events if shipment exists
    let events = [];
    if (inv.Shipment) {
      events = await db.ShipmentEvent.findAll({
        where: { shipmentId: inv.Shipment.id },
        attributes: ['eventType', 'eventDate', 'location', 'vessel', 'voyage', 'description'],
        order: [['eventDate', 'DESC']],
        limit: 50,
      });
    }

    // Build sanitized response — no financials
    const response = {
      invoiceNumber: inv.invoiceNumber,
      customerName: inv.customerName,
      recipientName: inv.recipientName,
      recipientCity: inv.recipientAddress ? inv.recipientAddress.split(',').find(p => p.trim()) : null,
      status: inv.status,
      createdAt: inv.createdAt,
      itemCount: inv.lineItems.length,
      items: inv.lineItems.map((li) => ({
        name: li.catalogName || li.description,
        quantity: li.quantity,
      })),
      shipment: inv.Shipment ? {
        name: inv.Shipment.name,
        status: inv.Shipment.status,
        carrier: inv.Shipment.carrier,
        trackingNumber: inv.Shipment.trackingNumber,
        vesselName: inv.Shipment.vesselName,
        voyageNumber: inv.Shipment.voyageNumber,
        eta: inv.Shipment.eta,
        departureDate: inv.Shipment.departureDate,
      } : null,
      events: events.map((e) => ({
        type: e.eventType,
        date: e.eventDate,
        location: e.location,
        vessel: e.vessel,
        voyage: e.voyage,
        description: e.description,
      })),
    };

    res.json({ success: true, data: response });
  } catch (err) {
    console.error('Public tracking error:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
