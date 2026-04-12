const https = require('https');

/**
 * Shipsgo container tracking service (v2 API).
 *
 * Creates ocean shipment tracking requests and polls for updates daily.
 * Events are stored in the shipment_events table and used to auto-update
 * shipment status, ETA, vessel, and voyage.
 *
 * Auth: X-Shipsgo-User-Token header
 * Base: https://api.shipsgo.com/v2
 *
 * Env: SHIPSGO_API_KEY
 */

const API_HOST = 'api.shipsgo.com';

function getKey() {
  return process.env.SHIPSGO_API_KEY;
}

function isConfigured() {
  return Boolean(getKey());
}

function apiRequest(method, path, body) {
  const key = getKey();
  const payload = body ? JSON.stringify(body) : '';
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: API_HOST,
      path: `/v2${path}`,
      method,
      headers: {
        'X-Shipsgo-User-Token': key,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 20000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch { resolve(data); }
        } else {
          const err = new Error(`Shipsgo ${res.statusCode}: ${data.substring(0, 500)}`);
          err.status = res.statusCode;
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Shipsgo timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Create an ocean shipment tracking request on Shipsgo.
 *
 * @param {string} containerNumber — container or B/L number
 * @param {string} carrier — carrier SCAC code (e.g., 'MSCU')
 * @returns {object} the created shipment
 */
/**
 * @param {string} trackingNumber — container or booking number
 * @param {string} carrier — carrier SCAC code
 * @param {string} numberType — 'container' | 'booking' (default: auto-detect)
 */
async function createTracker(trackingNumber, carrier = 'MSCU', numberType) {
  if (!isConfigured()) {
    const err = new Error('Shipsgo not configured. Set SHIPSGO_API_KEY.');
    err.code = 'SHIPSGO_NOT_CONFIGURED';
    throw err;
  }

  const num = trackingNumber.trim();
  // Auto-detect: container numbers are 4 letters + 7 digits (e.g., MSCU1234567)
  const isContainer = numberType === 'container' || (!numberType && /^[A-Z]{4}\d{7}$/i.test(num));

  const body = { scac: carrier };
  if (isContainer) {
    body.container_number = num;
  } else {
    body.booking_number = num;
  }

  const result = await apiRequest('POST', '/ocean/shipments', body);
  const shipment = result.shipment || result;
  return {
    trackerId: shipment.id || shipment.tracking_id || null,
    status: shipment.status,
    raw: shipment,
  };
}

/**
 * Get a tracked shipment's details including milestones/events.
 *
 * @param {string} shipsgoId — the Shipsgo shipment ID
 * @returns {object} shipment with events
 */
async function getTracker(shipsgoId) {
  if (!isConfigured()) return null;
  const result = await apiRequest('GET', `/ocean/shipments/${shipsgoId}`);
  return result.shipment || result;
}

/**
 * List all tracked ocean shipments (for the daily poll).
 *
 * @returns {Array} shipments
 */
async function listTrackers() {
  if (!isConfigured()) return [];
  const result = await apiRequest('GET', '/ocean/shipments?take=100');
  return result.shipments || [];
}

/**
 * Map Shipsgo milestone/status to GCGL shipment status pipeline values.
 */
const STATUS_MAP = {
  'BOOKED': 'ready',
  'LOADED': 'shipped',
  'SAILING': 'shipped',
  'EN_ROUTE': 'shipped',
  'TRANSSHIPMENT': 'shipped',
  'ARRIVED': 'customs',
  'DISCHARGED': 'customs',
  'GATE_OUT': 'delivered',
  'DELIVERED': 'delivered',
  'COMPLETED': 'delivered',
};

function mapStatusToGCGL(shipsgoStatus) {
  if (!shipsgoStatus) return null;
  return STATUS_MAP[shipsgoStatus.toUpperCase()] || null;
}

/**
 * Extract events/milestones from a Shipsgo shipment response.
 * Returns normalized event objects.
 */
function extractEvents(shipsgoShipment) {
  const events = [];
  const milestones = shipsgoShipment.milestones || shipsgoShipment.events || [];

  for (const m of milestones) {
    events.push({
      eventType: m.type || m.status || m.event || 'unknown',
      eventDate: m.date || m.timestamp || m.actual_date || m.estimated_date || new Date().toISOString(),
      location: m.location || m.port || m.terminal || '',
      vessel: m.vessel_name || m.vessel || '',
      voyage: m.voyage_number || m.voyage || '',
      description: m.description || m.type || '',
    });
  }

  return events;
}

/**
 * Extract ETA, vessel, voyage from Shipsgo shipment.
 */
function extractShipmentInfo(shipsgoShipment) {
  return {
    eta: shipsgoShipment.date_of_eta || shipsgoShipment.eta || shipsgoShipment.pod_eta || null,
    departureDate: shipsgoShipment.date_of_etd || shipsgoShipment.etd || shipsgoShipment.pol_etd || null,
    vesselName: shipsgoShipment.vessel_name || shipsgoShipment.vessel || null,
    voyageNumber: shipsgoShipment.voyage_number || shipsgoShipment.voyage || null,
    status: shipsgoShipment.status || null,
  };
}

/**
 * Verify a Shipsgo webhook signature (HMAC-SHA256).
 */
function verifyWebhookSignature(signatureHeader, body, secretKey) {
  if (!secretKey) return false;
  const crypto = require('crypto');
  const expected = crypto.createHmac('sha256', secretKey).update(body).digest('hex');
  return signatureHeader === expected;
}

module.exports = {
  isConfigured,
  createTracker,
  getTracker,
  listTrackers,
  mapStatusToGCGL,
  extractEvents,
  extractShipmentInfo,
  verifyWebhookSignature,
  apiRequest,
};
