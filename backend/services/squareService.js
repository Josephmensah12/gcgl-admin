const https = require('https');
const crypto = require('crypto');

/**
 * Square Checkout integration for GCGL invoice payments.
 *
 * Creates payment links via the Square Checkout API so customers can pay
 * their invoices online. A webhook handler auto-records the payment in
 * invoice_payments when Square confirms the transaction.
 *
 * Env vars:
 *   SQUARE_ACCESS_TOKEN   — production access token
 *   SQUARE_APPLICATION_ID — for reference (not used in server calls)
 *   SQUARE_LOCATION_ID    — the active Square location
 *   SQUARE_WEBHOOK_SIGNATURE_KEY — from the Square Developer Dashboard
 *                                   Webhooks section (used to verify
 *                                   incoming webhook payloads)
 */

const API_HOST = 'connect.squareup.com';
const API_VERSION = '2024-01-18';

function getConfig() {
  return {
    token: process.env.SQUARE_ACCESS_TOKEN,
    locationId: process.env.SQUARE_LOCATION_ID,
    appId: process.env.SQUARE_APPLICATION_ID,
    webhookSigKey: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY,
  };
}

function isConfigured() {
  const c = getConfig();
  return Boolean(c.token && c.locationId);
}

function apiRequest(method, path, body) {
  const { token } = getConfig();
  const payload = body ? JSON.stringify(body) : '';
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: API_HOST,
      path: `/v2${path}`,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Square-Version': API_VERSION,
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch { resolve(data); }
        } else {
          const err = new Error(`Square API ${res.statusCode}: ${data.substring(0, 500)}`);
          err.status = res.statusCode;
          try { err.squareErrors = JSON.parse(data).errors; } catch {}
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Square API timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Create a Square Checkout payment link for an invoice.
 *
 * @param {object} invoice — the GCGL invoice (with invoiceNumber, finalTotal, amountPaid, customerName, customerEmail)
 * @returns {object} { url, orderId, paymentLinkId }
 */
async function createPaymentLink(invoice, customAmount = null) {
  if (!isConfigured()) {
    const err = new Error('Square is not configured. Set SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID.');
    err.code = 'SQUARE_NOT_CONFIGURED';
    throw err;
  }

  const fullBalance = Math.max(0, (parseFloat(invoice.finalTotal) || 0) - (parseFloat(invoice.amountPaid) || 0));

  if (fullBalance <= 0) {
    const err = new Error('Invoice is already paid in full.');
    err.code = 'INVOICE_PAID';
    throw err;
  }

  // Use custom amount for partial payments, otherwise full balance
  const paymentAmount = customAmount && customAmount > 0 && customAmount <= fullBalance
    ? customAmount
    : fullBalance;
  const amountCents = Math.round(paymentAmount * 100);

  const isPartial = paymentAmount < fullBalance - 0.01;

  const { locationId } = getConfig();
  const idempotencyKey = crypto.randomUUID();

  const body = {
    idempotency_key: idempotencyKey,
    quick_pay: {
      name: `Invoice #${invoice.invoiceNumber}${isPartial ? ' (partial)' : ''} — ${invoice.customerName || 'GCGL'}`,
      price_money: {
        amount: amountCents,
        currency: 'USD',
      },
      location_id: locationId,
    },
    checkout_options: {
      allow_tipping: false,
      accepted_payment_methods: {
        apple_pay: true,
        google_pay: true,
        cash_app_pay: true,
      },
    },
    payment_note: `GCGL Invoice #${invoice.invoiceNumber}`,
    pre_populated_data: {
      buyer_email: invoice.customerEmail && invoice.customerEmail !== 'noemail@gcgl.com'
        ? invoice.customerEmail
        : undefined,
    },
  };

  const result = await apiRequest('POST', '/online-checkout/payment-links', body);

  return {
    url: result.payment_link?.url || result.payment_link?.long_url,
    orderId: result.payment_link?.order_id,
    paymentLinkId: result.payment_link?.id,
    amount: paymentAmount,
    amountCents,
    isPartial,
    fullBalance,
  };
}

/**
 * Verify a Square webhook signature.
 * Returns true if valid, false otherwise.
 */
function verifyWebhookSignature(signatureHeader, body, url) {
  const { webhookSigKey } = getConfig();
  if (!webhookSigKey) return false;

  const combined = url + body;
  const expectedSignature = crypto
    .createHmac('sha256', webhookSigKey)
    .update(combined)
    .digest('base64');

  return signatureHeader === expectedSignature;
}

module.exports = {
  isConfigured,
  getConfig,
  createPaymentLink,
  verifyWebhookSignature,
  apiRequest,
};
