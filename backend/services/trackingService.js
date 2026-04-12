const https = require('https');

/**
 * Terminal49 container tracking service.
 *
 * Creates tracking requests via the Terminal49 API and processes incoming
 * webhook events. Events are stored in the shipment_events table and used
 * to auto-update shipment status, ETA, vessel, and voyage.
 *
 * Env: TERMINAL49_API_KEY
 */

const API_HOST = 'api.terminal49.com';

function getKey() {
  return process.env.TERMINAL49_API_KEY;
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
        'Authorization': `Token ${key}`,
        'Content-Type': 'application/vnd.api+json',
        'Accept': 'application/vnd.api+json',
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
          const err = new Error(`Terminal49 ${res.statusCode}: ${data.substring(0, 500)}`);
          err.status = res.statusCode;
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Terminal49 timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * SCAC codes for common carriers.
 */
const CARRIER_SCAC = {
  'MSC': 'MSCU',
  'MAERSK': 'MAEU',
  'CMA CGM': 'CMDU',
  'HAPAG-LLOYD': 'HLCU',
  'COSCO': 'COSU',
  'EVERGREEN': 'EGLV',
  'ONE': 'ONEY',
  'ZIM': 'ZIMU',
  'YANG MING': 'YMLU',
};

function carrierToScac(carrier) {
  const upper = (carrier || 'MSC').toUpperCase();
  return CARRIER_SCAC[upper] || upper;
}

/**
 * Create a tracking request on Terminal49 for a container number.
 *
 * @param {string} trackingNumber — the container or B/L number
 * @param {string} carrier — carrier name (e.g., "MSC") → converted to SCAC
 * @returns {object} { trackerId, status }
 */
async function createTracker(trackingNumber, carrier = 'MSC') {
  if (!isConfigured()) {
    const err = new Error('Terminal49 not configured. Set TERMINAL49_API_KEY.');
    err.code = 'T49_NOT_CONFIGURED';
    throw err;
  }

  const scac = carrierToScac(carrier);

  const body = {
    data: {
      type: 'tracking_request',
      attributes: {
        request_number: trackingNumber.trim(),
        scac: scac,
        request_type: 'bill_of_lading',
      },
    },
  };

  // Try B/L first; if it fails, try as container number
  let result;
  try {
    result = await apiRequest('POST', '/tracking_requests', body);
  } catch (e) {
    // Retry as booking_number
    body.data.attributes.request_type = 'booking_number';
    try {
      result = await apiRequest('POST', '/tracking_requests', body);
    } catch (e2) {
      throw e; // throw original error
    }
  }

  const tracker = result.data;
  return {
    trackerId: tracker?.id,
    status: tracker?.attributes?.status,
    raw: tracker,
  };
}

/**
 * Map Terminal49 event descriptions to GCGL shipment status pipeline values.
 */
const EVENT_STATUS_MAP = {
  'container.transport.vessel_loaded': 'shipped',
  'container.transport.vessel_departed': 'shipped',
  'container.transport.vessel_arrived': 'customs',
  'container.transport.vessel_discharged': 'customs',
  'container.transport.full_out': 'delivered',
  'container.transport.empty_in': 'delivered',
  'tracking_request.succeeded': null, // informational, no status change
  'tracking_request.failed': null,
};

function mapEventToStatus(eventType) {
  return EVENT_STATUS_MAP[eventType] || null;
}

/**
 * Parse a Terminal49 webhook payload into a normalized event object.
 * Terminal49 sends JSON:API format webhooks.
 */
function parseWebhookPayload(payload) {
  const data = payload?.data;
  if (!data) return null;

  const attrs = data.attributes || {};
  const relationships = data.relationships || {};
  const included = payload.included || [];

  // Find the tracking request ID to link back to our shipment
  const trackingRequestRef = relationships?.tracking_request?.data?.id;

  // For container transport events, extract location/vessel from included resources
  let location = attrs.location || '';
  let vessel = attrs.vessel || '';
  let voyage = attrs.voyage || '';

  // Try to find vessel/location in included data
  for (const inc of included) {
    if (inc.type === 'port' || inc.type === 'terminal') {
      location = location || inc.attributes?.name || '';
    }
    if (inc.type === 'vessel') {
      vessel = vessel || inc.attributes?.name || '';
    }
  }

  return {
    eventType: data.type || attrs.event || 'unknown',
    eventDate: attrs.timestamp || attrs.created_at || new Date().toISOString(),
    location: location || attrs.port_name || '',
    vessel: vessel || attrs.vessel_name || '',
    voyage: voyage || attrs.voyage_number || '',
    description: attrs.description || attrs.event || data.type || '',
    trackingRequestId: trackingRequestRef,
    eta: attrs.estimated_arrival_at || attrs.pod_eta || null,
    raw: payload,
  };
}

module.exports = {
  isConfigured,
  createTracker,
  mapEventToStatus,
  parseWebhookPayload,
  carrierToScac,
  CARRIER_SCAC,
};
