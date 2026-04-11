/**
 * One-off: import SB #600 (Ambrose, 2026-03-31, $2,101.20) into GCGL DB
 * as DB invoice #600, filling the gap between #599 and #601.
 *
 * Usage:
 *   node scripts/import-sb-600.js            # dry run
 *   node scripts/import-sb-600.js --execute
 */

const https = require('https');
const crypto = require('crypto');
const { Sequelize } = require('sequelize');

const API_HOST = 'gcgl.salesbinder.com';
const API_KEY = '1iKEo36mgvupBdceenaS5Q3wchdzXxOEYHUINRoJ';
const AUTH = Buffer.from(`${API_KEY}:x`).toString('base64');

const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://postgres:mWTtqDSnqgCaksaawcrBNfxCUPaSAYsg@centerbeam.proxy.rlwy.net:38751/railway';

const isDryRun = process.argv[2] !== '--execute';

const SB_ID = '78b6b2e2-0acf-4cd9-97f9-fb334f77f6ac';
const TARGET_NUM = 600;

const seq = new Sequelize(DATABASE_URL, {
  dialect: 'postgres', logging: false,
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

function fetchJSON(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: API_HOST,
      path: `/api/2.0${path}`,
      headers: { 'Authorization': `Basic ${AUTH}`, 'Accept': 'application/json' },
      timeout: 15000,
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: ${d.slice(0, 200)}`));
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function parseDimensions(desc) {
  if (!desc) return null;
  const m = desc.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
  return m ? { l: parseFloat(m[1]), w: parseFloat(m[2]), h: parseFloat(m[3]) } : null;
}

const STATUS_MAP = {
  'paid in full': 'paid', 'unpaid': 'unpaid', 'partially paid': 'partial',
  'open': 'unpaid', 'draft': 'unpaid', 'overdue': 'unpaid',
  'cancelled': 'unpaid', 'void': 'unpaid',
};
function mapStatus(sb) {
  return STATUS_MAP[(sb?.name || '').toLowerCase().trim()] || 'unpaid';
}

async function run() {
  console.log(isDryRun ? '=== DRY RUN ===' : '=== EXECUTING ===');

  // 1. Check DB #600 is free
  const [[{ count: c }]] = await seq.query(
    'SELECT COUNT(*)::int as count FROM invoices WHERE invoice_number = :n',
    { replacements: { n: TARGET_NUM } }
  );
  if (c > 0) { console.log('ABORT: DB #' + TARGET_NUM + ' already exists'); return; }
  console.log('  DB #' + TARGET_NUM + ' is free');

  // 2. Fetch SB #600
  console.log('\nFetching SB #600...');
  const sbResp = await fetchJSON(`/documents/${SB_ID}.json`);
  const sb = sbResp.document || sbResp;
  console.log(`  ${sb.cache__customer_name} | doc#${sb.document_number} | issue ${sb.issue_date} | $${sb.total_price} | ${(sb.document_items || []).length} items`);
  if (Number(sb.document_number) !== TARGET_NUM) {
    console.log('ABORT: SB document_number is ' + sb.document_number + ', expected ' + TARGET_NUM);
    return;
  }

  // 3. Ensure customer exists in DB
  const [cust] = await seq.query(
    'SELECT id, full_name, email, phone, address FROM customers WHERE id = :id',
    { replacements: { id: sb.customer_id } }
  );
  let customer;
  let createCustomer = false;
  if (cust.length > 0) {
    customer = cust[0];
    console.log(`  Customer already in DB: ${customer.full_name}`);
  } else {
    console.log(`  Customer ${sb.customer_id} not in DB, fetching from SB...`);
    const custResp = await fetchJSON(`/customers/${sb.customer_id}.json`);
    const sbCust = custResp.customer || custResp;
    const addrParts = [sbCust.billing_address_1, sbCust.billing_city, sbCust.billing_region, sbCust.billing_postal_code, sbCust.billing_country].filter(Boolean);
    customer = {
      id: sb.customer_id,
      full_name: (sbCust.name || sb.cache__customer_name || 'Unknown').trim(),
      email: sbCust.office_email?.trim() || 'noemail@gcgl.com',
      phone: sbCust.office_phone?.trim() || 'N/A',
      address: addrParts.length ? addrParts.join(', ') : 'N/A',
    };
    createCustomer = true;
    console.log(`  Will create: ${customer.full_name} | ${customer.phone}`);
  }

  // 4. Build line items. SB's total_price is SUM(qty*price) ignoring discount_percent,
  // so we mirror SB and skip the per-line discount application. Negative-price adjustment
  // lines (no description) are kept as-is.
  const items = (sb.document_items || []).filter(i => i.delete !== 1);
  let subtotal = 0;
  const liRows = [];
  for (let idx = 0; idx < items.length; idx++) {
    const li = items[idx];
    const qty = parseInt(li.quantity) || 1;
    const price = parseFloat(li.price) || 0;
    const finalPrice = price * qty;
    const dims = parseDimensions(li.description);
    subtotal += finalPrice;
    liRows.push({
      id: li.id,
      invoice_id: sb.id,
      type: 'fixed',
      catalog_item_id: li.item_id || null,
      catalog_name: li.item?.name || null,
      description: li.description || (price < 0 ? 'Adjustment' : null),
      quantity: qty,
      base_price: price,
      discount_type: null,
      discount_amount: null,
      final_price: finalPrice,
      dimensions_l: dims?.l || null,
      dimensions_w: dims?.w || null,
      dimensions_h: dims?.h || null,
      sort_order: idx,
      created_at: li.created || sb.created || new Date().toISOString(),
      updated_at: li.modified || sb.modified || new Date().toISOString(),
    });
  }
  const discount = 0;

  const inv = {
    id: sb.id,
    invoice_number: TARGET_NUM,
    customer_id: customer.id,
    customer_name: sb.cache__customer_name || customer.full_name,
    customer_email: customer.email || 'noemail@gcgl.com',
    customer_address: customer.address || 'N/A',
    customer_phone: customer.phone || 'N/A',
    recipient_id: null,
    recipient_name: customer.full_name,
    recipient_phone: customer.phone || 'N/A',
    recipient_address: customer.address || 'N/A',
    subtotal,
    total_discount: discount,
    final_total: parseFloat(sb.total_price) || (subtotal - discount),
    original_item_count: items.length,
    added_item_count: 0,
    payment_status: mapStatus(sb.status),
    payment_method: null,
    amount_paid: parseFloat(sb.total_transactions) || 0,
    shipment_id: null,
    status: 'completed',
    last_edited_at: sb.modified || null,
    created_at: sb.issue_date ? sb.issue_date.split('T')[0] + 'T12:00:00Z' : sb.created,
    updated_at: sb.modified || new Date().toISOString(),
  };

  console.log('\nInvoice to insert:');
  console.log('  id:', inv.id);
  console.log('  #' + inv.invoice_number + ' | $' + inv.final_total + ' | ' + items.length + ' items | ' + inv.payment_status);
  console.log('  subtotal $' + subtotal.toFixed(2) + ' | discount $' + discount.toFixed(2));

  const sbTxns = sb.transactions || [];
  console.log('  payments to sync: ' + sbTxns.length);

  if (isDryRun) {
    console.log('\nDry run. Re-run with --execute to commit.');
    return;
  }

  const t = await seq.transaction();
  try {
    if (createCustomer) {
      await seq.query(
        `INSERT INTO customers (id, full_name, email, phone, address, created_at, updated_at)
         VALUES (:id, :full_name, :email, :phone, :address, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        { replacements: customer, transaction: t }
      );
    }

    const INV_COLS = [
      'id', 'invoice_number', 'customer_id', 'customer_name', 'customer_email',
      'customer_address', 'customer_phone', 'recipient_id', 'recipient_name',
      'recipient_phone', 'recipient_address', 'subtotal', 'total_discount',
      'final_total', 'original_item_count', 'added_item_count', 'payment_status',
      'payment_method', 'amount_paid', 'shipment_id', 'status', 'last_edited_at',
      'created_at', 'updated_at'
    ];
    const ph = INV_COLS.map((_, i) => `$${i + 1}`).join(', ');
    await seq.query(
      `INSERT INTO invoices (${INV_COLS.map(c => `"${c}"`).join(', ')}) VALUES (${ph})`,
      { bind: INV_COLS.map(c => inv[c]), transaction: t }
    );

    const LI_COLS = [
      'id', 'invoice_id', 'type', 'catalog_item_id', 'catalog_name', 'description',
      'quantity', 'base_price', 'discount_type', 'discount_amount', 'final_price',
      'dimensions_l', 'dimensions_w', 'dimensions_h', 'sort_order', 'created_at', 'updated_at'
    ];
    for (const li of liRows) {
      const liPh = LI_COLS.map((_, i) => `$${i + 1}`).join(', ');
      await seq.query(
        `INSERT INTO line_items (${LI_COLS.map(c => `"${c}"`).join(', ')}) VALUES (${liPh})`,
        { bind: LI_COLS.map(c => li[c]), transaction: t }
      );
    }

    // Sync payment transactions if any
    for (const txn of sbTxns) {
      const amt = parseFloat(txn.amount || 0);
      if (amt === 0) continue;
      const txnDate = (txn.transaction_date || txn.created || '').split('T')[0] ||
                      (sb.issue_date || '').split('T')[0] ||
                      new Date().toISOString().split('T')[0];
      await seq.query(
        `INSERT INTO invoice_payments (id, invoice_id, transaction_type, payment_date, amount, payment_method, comment, created_at, updated_at)
         VALUES (:id, :inv, :type, :date, :amt, 'Cash', :cmt, NOW(), NOW())`,
        {
          replacements: {
            id: crypto.randomUUID(),
            inv: sb.id,
            type: amt < 0 ? 'REFUND' : 'PAYMENT',
            date: txnDate,
            amt: Math.abs(amt),
            cmt: txn.reference || 'Synced from SalesBinder',
          },
          transaction: t,
        }
      );
    }

    await t.commit();
    console.log('\n✓ Committed');
  } catch (e) {
    await t.rollback();
    console.error('\n✗ Rolled back:', e.message);
    throw e;
  }

  // Verify
  const [final] = await seq.query(
    `SELECT invoice_number, customer_name, final_total, amount_paid, payment_status
     FROM invoices WHERE invoice_number BETWEEN 598 AND 602 ORDER BY invoice_number`
  );
  console.log('\nVerify:');
  for (const r of final) {
    console.log(`  #${r.invoice_number} | $${String(r.final_total).padStart(9)} | paid $${String(r.amount_paid).padStart(8)} | ${r.payment_status.padEnd(8)} | ${r.customer_name}`);
  }
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
