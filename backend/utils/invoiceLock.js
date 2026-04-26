const { AppError } = require('../middleware/errorHandler');

const EPSILON = 0.01;

/**
 * Throw if the invoice cannot be edited. Mirrors the frontend lock condition.
 *
 * Rules:
 *   - cancelled invoices are never editable
 *   - fully-paid invoices (paid ≈ finalTotal) are not editable
 *   - overpaid invoices (paid > finalTotal) ARE editable, so a refund can
 *     bring them back into a clean state
 */
function assertEditable(invoice) {
  if (invoice.status === 'cancelled') {
    throw new AppError('Cancelled invoices cannot be edited', 400, 'INVOICE_CANCELLED');
  }
  const total = parseFloat(invoice.finalTotal) || 0;
  const paid = parseFloat(invoice.amountPaid) || 0;
  if (paid >= total - EPSILON && paid <= total + EPSILON) {
    throw new AppError(
      'Fully-paid invoices cannot be edited. Issue a refund to unlock.',
      403,
      'INVOICE_LOCKED'
    );
  }
}

module.exports = { assertEditable, EPSILON };
