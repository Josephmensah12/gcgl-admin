/**
 * Sync SalesBinder payment transactions → GCGL Admin DB for April 2026.
 *
 * Targets invoices where SB shows payments but DB has amount_paid = 0.
 * Inserts missing rows into invoice_payments and updates invoices.amount_paid
 * + payment_status to match SB.
 *
 * Usage:
 *   node scripts/sync-sb-payments-april.js             # dry run
 *   node scripts/sync-sb-payments-april.js --execute    # commit
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

const isDryRun = process.argv[2] !== '--execute';

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

async function run() {
  console.log(isDryRun ? '=== DRY RUN ===' : '=== EXECUTING PAYMENT SYNC ===');
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  // Step 1: Load SB page 1 (most recent) and index by document_number
  console.log('Step 1: Loading SB documents page 1 (most recent)...');
  const p1 = await fetchJSON('/documents.json?contextId=5&limit=100&page=1');
  const sbDocsByNum = new Map();
  for (const d of (p1.documents[0] || p1.documents || []).flat()) {
    sbDocsByNum.set(Number(d.document_number), d);
  }
  console.log(`  Indexed ${sbDocsByNum.size} SB docs (range ${Math.min(...sbDocsByNum.keys())} – ${Math.max(...sbDocsByNum.keys())})`);

  // Step 2: Match DB April invoices against SB by invoice_number
  console.log('\nStep 2: Comparing April 2026 DB invoices vs SB...');
  const [dbInvs] = await seq.query(`
    SELECT id, invoice_number, customer_name, final_total, amount_paid, payment_status
    FROM invoices
    WHERE invoice_number BETWEEN 601 AND 605
    ORDER BY invoice_number
  `);

  const toSync = [];
  for (const inv of dbInvs) {
    const sbLite = sbDocsByNum.get(inv.invoice_number);
    if (!sbLite) {
      console.log(`  #${inv.invoice_number}: not found in SB page 1`);
      continue;
    }
    const sbPaid = parseFloat(sbLite.total_transactions) || 0;
    const dbPaid = parseFloat(inv.amount_paid) || 0;
    const diff = Math.abs(sbPaid - dbPaid);
    if (diff > 0.01) {
      // Fetch full doc for transaction detail
      await new Promise(r => setTimeout(r, RATE_DELAY));
      try {
        const full = await fetchJSON(`/documents/${sbLite.id}.json`);
        const sbDoc = full.document || full;
        toSync.push({ inv, sbDoc, sbPaid, dbPaid });
        console.log(`  #${inv.invoice_number} ${inv.customer_name}: SB $${sbPaid} vs DB $${dbPaid} — needs sync (${(sbDoc.transactions || []).length} txns)`);
      } catch (e) {
        console.log(`  #${inv.invoice_number}: fetch error — ${e.message}`);
      }
    } else {
      console.log(`  #${inv.invoice_number} ${inv.customer_name}: $${dbPaid} — in sync`);
    }
  }

  if (toSync.length === 0) {
    console.log('\nNothing to sync.');
    return;
  }

  console.log(`\nStep 2: Building payment rows for ${toSync.length} invoices...`);
  const paymentsToInsert = [];
  const invoiceUpdates = [];

  for (const { inv, sbDoc, sbPaid } of toSync) {
    const sbTxns = sbDoc.transactions || [];

    if (sbTxns.length === 0) {
      // Synthetic payment — SB shows paid amount but no transaction detail
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
          _display: `#${inv.invoice_number} ${isRefund ? 'REFUND' : 'PAYMENT'} $${Math.abs(amount).toFixed(2)} (${txn.reference || 'no ref'})`,
        });
      }
    }

    // Decide final payment_status
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

  console.log(`  Payment rows to insert: ${paymentsToInsert.length}`);
  for (const p of paymentsToInsert) console.log(`    ${p._display}`);
  console.log(`  Invoice updates:`);
  for (const u of invoiceUpdates) {
    console.log(`    #${u.invoice_number} ${u.customer_name}: amount_paid → $${u.new_amount_paid.toFixed(2)}, status ${u.old_status} → ${u.new_status}`);
  }

  if (isDryRun) {
    console.log('\nDry run complete. Re-run with --execute to commit.');
    return;
  }

  // ========== EXECUTE ==========
  const t = await seq.transaction();
  try {
    const PAY_COLS = ['id', 'invoice_id', 'transaction_type', 'payment_date', 'amount', 'payment_method', 'comment', 'created_at', 'updated_at'];
    for (const p of paymentsToInsert) {
      const vals = [p.id, p.invoice_id, p.transaction_type, p.payment_date, p.amount, p.payment_method, p.comment, new Date().toISOString(), new Date().toISOString()];
      await seq.query(
        `INSERT INTO invoice_payments (${PAY_COLS.map(c => `"${c}"`).join(', ')}) VALUES (${PAY_COLS.map((_, i) => `$${i + 1}`).join(', ')})`,
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
    console.log('\n✓ Transaction committed.');
  } catch (e) {
    await t.rollback();
    console.error('\n✗ Transaction rolled back:', e.message);
    throw e;
  }

  // Verify
  const [final] = await seq.query(`
    SELECT invoice_number, customer_name, final_total, amount_paid, payment_status
    FROM invoices WHERE invoice_number BETWEEN 601 AND 605 ORDER BY invoice_number
  `);
  console.log('\nFinal April state:');
  for (const r of final) {
    console.log(`  #${r.invoice_number} | final $${String(r.final_total).padStart(9)} | paid $${String(r.amount_paid).padStart(9)} | ${String(r.payment_status).padEnd(8)} | ${r.customer_name}`);
  }
  console.log('\n=== DONE ===');
}

async function main() {
  try {
    await seq.authenticate();
    console.log('Database connected.\n');
    await run();
  } catch (e) {
    console.error('Fatal error:', e.message);
    process.exit(1);
  } finally {
    await seq.close();
  }
}

main();
