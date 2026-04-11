/**
 * Sync SalesBinder payment transactions → GCGL Admin DB for any month or all-time.
 *
 * For every DB invoice whose amount_paid differs from the SB counterpart's
 * total_transactions, fetches SB's transaction detail and inserts the missing
 * rows into invoice_payments, then updates the invoice.amount_paid and
 * payment_status to match SB.
 *
 * Usage:
 *   node scripts/sync-sb-payments.js              # dry run, all months
 *   node scripts/sync-sb-payments.js --execute    # commit, all months
 *   node scripts/sync-sb-payments.js 2026-03            # dry run, March 2026 only
 *   node scripts/sync-sb-payments.js 2026-03 --execute  # commit, March 2026 only
 */

const https = require('https');
const crypto = require('crypto');
const { Sequelize } = require('sequelize');

const API_HOST = 'gcgl.salesbinder.com';
const API_KEY = '1iKEo36mgvupBdceenaS5Q3wchdzXxOEYHUINRoJ';
const AUTH = Buffer.from(`${API_KEY}:x`).toString('base64');
const RATE_DELAY = 1600;

const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://postgres:mWTtqDSnqgCaksaawcrBNfxCUPaSAYsg@centerbeam.proxy.rlwy.net:38751/railway';

// Parse args: optional YYYY-MM and optional --execute
const args = process.argv.slice(2);
const monthArg = args.find((a) => /^\d{4}-\d{2}$/.test(a));
const isDryRun = !args.includes('--execute');

const seq = new Sequelize(DATABASE_URL, {
  dialect: 'postgres', logging: false,
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

function fetchJSON(path, retries = 3) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: API_HOST,
      path: `/api/2.0${path}`,
      headers: { 'Authorization': `Basic ${AUTH}`, 'Accept': 'application/json' },
      timeout: 15000
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', async () => {
        if (res.statusCode === 429 && retries > 0) {
          await new Promise(r => setTimeout(r, 10000));
          try { resolve(await fetchJSON(path, retries - 1)); } catch (e) { reject(e); }
          return;
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: ${d.slice(0, 200)}`));
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function fetchAllSbDocs() {
  const all = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    process.stdout.write(`  Fetching SB page ${page}/${totalPages}...\r`);
    const r = await fetchJSON(`/documents.json?contextId=5&limit=100&page=${page}`);
    totalPages = parseInt(r.pages);
    all.push(...(r.documents[0] || r.documents || []).flat());
    page++;
    if (page <= totalPages) await new Promise((r) => setTimeout(r, 600));
  }
  process.stdout.write(`  Fetched ${all.length} SB invoices across ${totalPages} pages${' '.repeat(20)}\n`);
  return all;
}

async function run() {
  console.log(isDryRun ? '=== DRY RUN ===' : '=== EXECUTING PAYMENT SYNC ===');
  console.log(`Scope: ${monthArg || 'all months'}`);
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  // 1. Load DB invoices
  console.log('Step 1: Loading DB invoices...');
  let where = "status = 'completed'";
  const replacements = {};
  if (monthArg) {
    const [y, m] = monthArg.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
    const end = new Date(Date.UTC(y, m, 1)).toISOString();
    where += ' AND created_at >= :start AND created_at < :end';
    replacements.start = start;
    replacements.end = end;
  }
  const [dbInvs] = await seq.query(
    `SELECT id, invoice_number, customer_name, final_total, amount_paid, payment_status FROM invoices WHERE ${where} ORDER BY invoice_number`,
    { replacements }
  );
  console.log(`  ${dbInvs.length} DB invoice(s) in scope`);

  // 2. Load all SB documents and index by document_number
  console.log('\nStep 2: Loading SB documents...');
  const sbDocs = await fetchAllSbDocs();
  const sbByNum = new Map();
  for (const d of sbDocs) sbByNum.set(Number(d.document_number), d);

  // 3. Find drift
  console.log('\nStep 3: Comparing amount_paid...');
  const drift = [];
  for (const inv of dbInvs) {
    const sb = sbByNum.get(Number(inv.invoice_number));
    if (!sb) continue;
    const sbPaid = parseFloat(sb.total_transactions) || 0;
    const dbPaid = parseFloat(inv.amount_paid) || 0;
    if (Math.abs(sbPaid - dbPaid) > 0.01) {
      drift.push({ inv, sbLite: sb, sbPaid, dbPaid });
    }
  }
  console.log(`  ${drift.length} invoice(s) need payment sync`);
  if (drift.length === 0) {
    console.log('\nNothing to sync.');
    return;
  }

  // Show table
  console.log('\n  # / Customer                 | SB paid   | DB paid   | drift');
  console.log('  ' + '─'.repeat(70));
  for (const d of drift.slice(0, 40)) {
    const name = (d.inv.customer_name || '').slice(0, 22).padEnd(22);
    const sbStr = `$${d.sbPaid.toFixed(2)}`.padStart(9);
    const dbStr = `$${d.dbPaid.toFixed(2)}`.padStart(9);
    const driftStr = `$${(d.sbPaid - d.dbPaid).toFixed(2)}`.padStart(10);
    console.log(`  #${String(d.inv.invoice_number).padEnd(5)} ${name} | ${sbStr} | ${dbStr} | ${driftStr}`);
  }
  if (drift.length > 40) console.log(`  ... and ${drift.length - 40} more`);

  // 4. Fetch transaction detail for each and prepare inserts
  console.log(`\nStep 4: Fetching transaction detail from SB (${drift.length} calls, ~${Math.round((drift.length * RATE_DELAY) / 1000)}s)...`);
  const paymentsToInsert = [];
  const invoiceUpdates = [];

  for (let i = 0; i < drift.length; i++) {
    const { inv, sbLite, sbPaid } = drift[i];
    process.stdout.write(`  ${i + 1}/${drift.length} fetching #${inv.invoice_number}...\r`);
    await new Promise((r) => setTimeout(r, RATE_DELAY));

    let sbDoc;
    try {
      const full = await fetchJSON(`/documents/${sbLite.id}.json`);
      sbDoc = full.document || full;
    } catch (e) {
      console.log(`\n  #${inv.invoice_number}: fetch error — ${e.message}`);
      continue;
    }

    const sbTxns = sbDoc.transactions || [];
    if (sbTxns.length === 0) {
      // Synthetic payment — SB knows amount but has no txn detail
      const payDate = (sbDoc.issue_date || '').split('T')[0] || new Date().toISOString().split('T')[0];
      paymentsToInsert.push({
        id: crypto.randomUUID(),
        invoice_id: inv.id,
        transaction_type: 'PAYMENT',
        payment_date: payDate,
        amount: sbPaid,
        payment_method: 'Cash',
        comment: 'Synced from SalesBinder',
        _display: `#${inv.invoice_number} synthetic $${sbPaid.toFixed(2)}`,
      });
    } else {
      for (const txn of sbTxns) {
        const amount = parseFloat(txn.amount || 0);
        if (amount === 0) continue;
        const txnDate = (txn.transaction_date || txn.created || '').split('T')[0] ||
                        (sbDoc.issue_date || '').split('T')[0] ||
                        new Date().toISOString().split('T')[0];
        const isRefund = amount < 0;
        paymentsToInsert.push({
          id: crypto.randomUUID(),
          invoice_id: inv.id,
          transaction_type: isRefund ? 'REFUND' : 'PAYMENT',
          payment_date: txnDate,
          amount: Math.abs(amount),
          payment_method: 'Cash',
          comment: txn.reference || 'Synced from SalesBinder',
          _display: `#${inv.invoice_number} ${isRefund ? 'REFUND' : 'PAYMENT'} $${Math.abs(amount).toFixed(2)}`,
        });
      }
    }

    const final = parseFloat(inv.final_total) || 0;
    let newStatus = 'unpaid';
    if (sbPaid >= final - 0.01) newStatus = 'paid';
    else if (sbPaid > 0.01) newStatus = 'partial';

    invoiceUpdates.push({
      invoice_number: inv.invoice_number,
      customer_name: inv.customer_name,
      id: inv.id,
      new_amount_paid: sbPaid,
      new_status: newStatus,
      old_status: inv.payment_status,
    });
  }
  process.stdout.write(`${' '.repeat(60)}\r`);

  console.log(`\n  Payment rows to insert: ${paymentsToInsert.length}`);
  console.log(`  Invoice updates:        ${invoiceUpdates.length}`);

  if (isDryRun) {
    console.log('\nDry run complete. Re-run with --execute to commit.');
    return;
  }

  // 5. Execute in one transaction
  console.log('\nStep 5: Committing...');
  const t = await seq.transaction();
  try {
    const PAY_COLS = ['id', 'invoice_id', 'transaction_type', 'payment_date', 'amount', 'payment_method', 'comment', 'created_at', 'updated_at'];
    for (const p of paymentsToInsert) {
      const vals = [p.id, p.invoice_id, p.transaction_type, p.payment_date, p.amount, p.payment_method, p.comment, new Date().toISOString(), new Date().toISOString()];
      await seq.query(
        `INSERT INTO invoice_payments (${PAY_COLS.map((c) => `"${c}"`).join(', ')}) VALUES (${PAY_COLS.map((_, i) => `$${i + 1}`).join(', ')})`,
        { bind: vals, transaction: t }
      );
    }
    for (const u of invoiceUpdates) {
      await seq.query(
        `UPDATE invoices SET amount_paid = :paid, payment_status = :status, updated_at = NOW() WHERE id = :id`,
        { replacements: { paid: u.new_amount_paid, status: u.new_status, id: u.id }, transaction: t }
      );
    }
    await t.commit();
    console.log('✓ Committed');
  } catch (e) {
    await t.rollback();
    console.error('✗ Rolled back:', e.message);
    throw e;
  }

  // 6. Summary
  console.log('\n=== DONE ===');
  console.log(`  ${paymentsToInsert.length} payment rows inserted`);
  console.log(`  ${invoiceUpdates.length} invoices updated`);
}

async function main() {
  try {
    await seq.authenticate();
    console.log('DB connected\n');
    await run();
  } catch (e) {
    console.error('Fatal:', e.message);
    process.exit(1);
  } finally {
    await seq.close();
  }
}

main();
