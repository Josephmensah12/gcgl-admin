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
 * Human-readable event code descriptions.
 */
const EVENT_DESCRIPTIONS = {
  'EMSH': 'Empty container shipped',
  'GTIN': 'Gate in at terminal',
  'LOAD': 'Loaded on vessel',
  'DEPA': 'Departed port',
  'ARRV': 'Arrived at port',
  'DISC': 'Discharged from vessel',
  'GTOT': 'Gate out — left port',
  'EMRT': 'Empty container returned',
  'TSLO': 'Transshipment loaded',
  'TSDI': 'Transshipment discharged',
  'BOOK': 'Booked',
};

/**
 * Extract events from a Shipsgo shipment response.
 * Events live in shipment.containers[].movements — NOT in a top-level
 * milestones or events array.
 */
function extractEvents(shipsgoShipment) {
  const events = [];
  const containers = shipsgoShipment.containers || [];

  for (const container of containers) {
    const movements = container.movements || [];
    for (const m of movements) {
      const locName = m.location?.name || '';
      const country = m.location?.country?.name || '';
      const locationStr = country ? `${locName}, ${country}` : locName;

      events.push({
        eventType: m.event || 'unknown',
        eventDate: m.timestamp || new Date().toISOString(),
        location: locationStr,
        vessel: m.vessel?.name || '',
        voyage: m.voyage || '',
        description: EVENT_DESCRIPTIONS[m.event] || m.event || '',
      });
    }
  }

  return events;
}

/**
 * Extract ETA, vessel, voyage, departure from Shipsgo shipment.
 * Route-level data lives in shipment.route.port_of_loading / port_of_discharge.
 * Vessel info is on the most recent movement with a vessel.
 */
function extractShipmentInfo(shipsgoShipment) {
  const route = shipsgoShipment.route || {};
  const pol = route.port_of_loading || {};
  const pod = route.port_of_discharge || {};

  // Find the latest vessel from container movements
  let vesselName = null;
  let voyageNumber = null;
  const containers = shipsgoShipment.containers || [];
  for (const c of containers) {
    for (const m of (c.movements || []).reverse()) {
      if (m.vessel?.name && !vesselName) {
        vesselName = m.vessel.name;
        voyageNumber = m.voyage;
        break;
      }
    }
  }

  return {
    eta: pod.date_of_discharge?.split('T')[0] || null,
    departureDate: pol.date_of_loading?.split('T')[0] || null,
    vesselName,
    voyageNumber,
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
