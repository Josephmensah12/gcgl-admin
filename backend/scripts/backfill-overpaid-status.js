/**
 * One-off backfill: any invoice with amountPaid > finalTotal + 0.01
 * gets paymentStatus = 'overpaid'. Idempotent — safe to re-run.
 *
 * Usage:  node backend/scripts/backfill-overpaid-status.js
 */
require('dotenv').config();
const db = require('../models');
const { computePaymentStatus } = require('../utils/invoicePaymentStatus');

(async () => {
  try {
    const all = await db.Invoice.findAll({
      where: { status: 'completed' },
      attributes: ['id', 'invoiceNumber', 'amountPaid', 'finalTotal', 'paymentStatus'],
    });

    let changed = 0;
    let scanned = 0;
    for (const inv of all) {
      scanned += 1;
      const correct = computePaymentStatus(inv.amountPaid, inv.finalTotal);
      if (correct !== inv.paymentStatus) {
        console.log(`Invoice #${inv.invoiceNumber}: ${inv.paymentStatus} → ${correct} ` +
                    `(paid=${inv.amountPaid}, total=${inv.finalTotal})`);
        await inv.update({ paymentStatus: correct });
        changed += 1;
      }
    }

    console.log(`\nScanned ${scanned} invoices, updated ${changed}.`);
    process.exit(0);
  } catch (err) {
    console.error('Backfill failed:', err);
    process.exit(1);
  }
})();
