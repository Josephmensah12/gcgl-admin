const { EPSILON } = require('./invoiceLock');

/**
 * Pure function: determine paymentStatus from amounts.
 *
 *   unpaid    paid = 0
 *   partial   0 < paid < total - EPSILON
 *   paid      total - EPSILON <= paid <= total + EPSILON
 *   overpaid  paid > total + EPSILON
 */
function computePaymentStatus(paid, total) {
  const p = parseFloat(paid) || 0;
  const t = parseFloat(total) || 0;
  if (p <= EPSILON) return 'unpaid';
  if (p > t + EPSILON) return 'overpaid';
  if (p >= t - EPSILON) return 'paid';
  return 'partial';
}

/**
 * Update `invoice.paymentStatus` based on current amountPaid / finalTotal.
 * Caller is responsible for saving.
 */
function recalculatePaymentStatus(invoice) {
  invoice.paymentStatus = computePaymentStatus(invoice.amountPaid, invoice.finalTotal);
  return invoice;
}

module.exports = { computePaymentStatus, recalculatePaymentStatus };
