/**
 * Fix April 2026 invoice number drift between SalesBinder and GCGL Admin DB.
 *
 * Changes (with SB as source of truth):
 *   1. Park DB #601 (Ambrose/Eric Ayi, local-only) at DB #606 so it survives
 *   2. Renumber DB #602 → #601 (Araba), #603 → #602, #604 → #603, #605 → #604
 *   3. Apply invoice-level discounts to new #602 (Jackson) and #603 (Nettey)
 *      so final_total matches SB while keeping GCGL's $0.011/cu.in. line pricing
 *   4. Insert SB #605 "MARK QUIST" ($1,255.29, 8 line items) as new DB #605
 *   5. Set sequences.next_invoice_num = 607
 *
 * Usage:
 *   node scripts/fix-april-2026-numbers.js              # dry run
 *   node scripts/fix-april-2026-numbers.js --execute     # commit
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

const seq = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

function fetchJSON(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: API_HOST,
      path: `/api/2.0${path}`,
      headers: { 'Authorization': `Basic ${AUTH}`, 'Accept': 'application/json' },
      timeout: 15000
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: ${d.slice(0, 300)}`));
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
  if (!m) return null;
  return { l: parseFloat(m[1]), w: parseFloat(m[2]), h: parseFloat(m[3]) };
}

const PAYMENT_STATUS_MAP = {
  'paid in full': 'paid', 'unpaid': 'unpaid', 'partially paid': 'partial',
  'open': 'unpaid', 'draft': 'unpaid', 'overdue': 'unpaid',
  'cancelled': 'unpaid', 'void': 'unpaid',
};
function mapPaymentStatus(sbStatus) {
  const name = (sbStatus?.name || '').toLowerCase().trim();
  return PAYMENT_STATUS_MAP[name] || 'unpaid';
}

async function run() {
  console.log(isDryRun
    ? '=== DRY RUN — no data will be changed ==='
    : '=== EXECUTING APRIL 2026 NUMBER FIX ===');
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  // ---------- Verify current DB state ----------
  console.log('Step 1: Verifying current DB state for April 2026...');
  const [currentAprilInvs] = await seq.query(`
    SELECT invoice_number, customer_name, final_total, id
    FROM invoices WHERE invoice_number BETWEEN 601 AND 605
    ORDER BY invoice_number
  `);
  console.log('  Current DB #601-#605:');
  for (const r of currentAprilInvs) {
    console.log(`    #${r.invoice_number} | $${r.final_total} | ${r.customer_name}`);
  }

  const expected = {
    601: { customer: 'Ambrose', total: '2591.69' },
    602: { customer: 'ARABA', total: '340.00' },
    603: { customer: 'Priscilla  Jackson', total: '607.57' },
    604: { customer: 'William Nettey', total: '196.59' },
    605: { customer: 'John Poku', total: '170.00' },
  };
  let mismatch = false;
  for (const r of currentAprilInvs) {
    const e = expected[r.invoice_number];
    if (!e) continue;
    if (!r.customer_name.toLowerCase().includes(e.customer.toLowerCase().split(' ')[0])) {
      console.log(`  WARN: #${r.invoice_number} customer mismatch. Expected ~"${e.customer}", got "${r.customer_name}"`);
      mismatch = true;
    }
  }
  if (currentAprilInvs.length !== 5) {
    console.log(`  ABORT: expected 5 invoices in #601-#605, got ${currentAprilInvs.length}`);
    return;
  }
  if (mismatch) {
    console.log('  ABORT: customer mismatch — aborting to avoid corrupting data');
    return;
  }

  // Check #606 is free
  const [[{ count: c606 }]] = await seq.query(`SELECT COUNT(*)::int as count FROM invoices WHERE invoice_number = 606`);
  if (c606 > 0) {
    console.log(`  ABORT: DB #606 already exists`);
    return;
  }
  console.log('  ✓ DB state matches expectations\n');

  // ---------- Fetch SB #605 MARK QUIST ----------
  console.log('Step 2: Fetching SB #605 MARK QUIST details...');
  const sb605Resp = await fetchJSON('/documents/2e0ccf0f-8241-47a9-98b8-9d0b3ab397ec.json');
  const sb605 = sb605Resp.document || sb605Resp;
  console.log(`  ✓ SB #605: ${sb605.cache__customer_name} | $${sb605.total_price} | ${(sb605.document_items || []).length} items`);

  // ---------- Ensure MARK QUIST customer exists in DB ----------
  console.log('\nStep 3: Ensuring MARK QUIST customer exists in DB...');
  const sbCustomerId = sb605.customer_id;
  const [existingCust] = await seq.query(
    `SELECT id, full_name FROM customers WHERE id = :id`,
    { replacements: { id: sbCustomerId } }
  );

  let customerToUse;
  if (existingCust.length > 0) {
    console.log(`  ✓ Customer already in DB: ${existingCust[0].full_name}`);
    customerToUse = existingCust[0];
  } else {
    console.log(`  Customer ${sbCustomerId} not in DB — fetching from SB...`);
    const custResp = await fetchJSON(`/customers/${sbCustomerId}.json`);
    const sbCust = custResp.customer || custResp;
    const addrParts = [sbCust.billing_address_1, sbCust.billing_city, sbCust.billing_region, sbCust.billing_postal_code, sbCust.billing_country].filter(Boolean);
    customerToUse = {
      id: sbCustomerId,
      full_name: (sbCust.name || sb605.cache__customer_name || 'Unknown').trim(),
      email: sbCust.office_email?.trim() || 'noemail@gcgl.com',
      phone: sbCust.office_phone?.trim() || 'N/A',
      address: addrParts.length ? addrParts.join(', ') : 'N/A',
    };
    console.log(`  Will create: ${customerToUse.full_name} | ${customerToUse.phone}`);
  }

  // ---------- Build MARK QUIST line items ----------
  const markQuistItems = (sb605.document_items || []).filter(i => i.delete !== 1);
  let markQuistSubtotal = 0;
  let markQuistDiscount = 0;
  const markQuistLineRows = [];
  for (let idx = 0; idx < markQuistItems.length; idx++) {
    const li = markQuistItems[idx];
    const qty = parseInt(li.quantity) || 1;
    const price = parseFloat(li.price) || 0;
    const discPct = parseFloat(li.discount_percent) || 0;
    const discAmt = discPct > 0 ? (price * qty * discPct / 100) : 0;
    const finalPrice = (price * qty) - discAmt;
    const dims = parseDimensions(li.description);
    markQuistSubtotal += price * qty;
    markQuistDiscount += discAmt;
    markQuistLineRows.push({
      id: li.id,
      invoice_id: sb605.id,
      type: 'fixed',
      catalog_item_id: li.item_id || null,
      catalog_name: li.item?.name || null,
      description: li.description || null,
      quantity: qty,
      base_price: price,
      discount_type: discPct > 0 ? 'percentage' : null,
      discount_amount: discAmt > 0 ? discAmt : null,
      final_price: finalPrice,
      dimensions_l: dims?.l || null,
      dimensions_w: dims?.w || null,
      dimensions_h: dims?.h || null,
      sort_order: idx,
      created_at: li.created || sb605.created || new Date().toISOString(),
      updated_at: li.modified || sb605.modified || new Date().toISOString(),
    });
  }

  const markQuistInvoice = {
    id: sb605.id,
    invoice_number: 605,
    customer_id: customerToUse.id,
    customer_name: sb605.cache__customer_name || customerToUse.full_name,
    customer_email: customerToUse.email || 'noemail@gcgl.com',
    customer_address: customerToUse.address || 'N/A',
    customer_phone: customerToUse.phone || 'N/A',
    recipient_id: null,
    recipient_name: customerToUse.full_name,
    recipient_phone: customerToUse.phone || 'N/A',
    recipient_address: customerToUse.address || 'N/A',
    subtotal: markQuistSubtotal,
    total_discount: markQuistDiscount,
    final_total: parseFloat(sb605.total_price) || markQuistSubtotal - markQuistDiscount,
    original_item_count: markQuistItems.length,
    added_item_count: 0,
    payment_status: mapPaymentStatus(sb605.status),
    payment_method: null,
    amount_paid: parseFloat(sb605.total_transactions) || 0,
    shipment_id: null,
    status: 'completed',
    last_edited_at: sb605.modified || null,
    created_at: sb605.issue_date ? sb605.issue_date.split('T')[0] + 'T12:00:00Z' : sb605.created,
    updated_at: sb605.modified || new Date().toISOString(),
  };

  console.log(`\nStep 4: Prepared MARK QUIST invoice`);
  console.log(`  id: ${markQuistInvoice.id}`);
  console.log(`  total: $${markQuistInvoice.final_total} | ${markQuistLineRows.length} line items`);
  console.log(`  status: ${markQuistInvoice.payment_status} | paid: $${markQuistInvoice.amount_paid}`);

  console.log('\n============================================================');
  console.log('PLAN');
  console.log('============================================================');
  console.log('  1. Park: UPDATE invoices SET invoice_number=606 WHERE invoice_number=601  (Ambrose/Eric Ayi)');
  console.log('  2. Renumber: 602→601, 603→602, 604→603, 605→604 (in that order)');
  console.log('  3. Discount new #602 Jackson: total_discount +$26.57, final_total $607.57 → $581.00');
  console.log('  3. Discount new #603 Nettey:  total_discount +$8.87,  final_total $196.59 → $187.72');
  console.log(`  4. ${existingCust.length === 0 ? 'INSERT' : 'skip'} MARK QUIST customer`);
  console.log('  5. INSERT MARK QUIST invoice + 8 line items as new #605');
  console.log('  6. UPDATE sequences SET value=607 WHERE key=\'next_invoice_num\'');
  console.log('============================================================\n');

  if (isDryRun) {
    console.log('Dry run complete. Re-run with --execute to commit.');
    return;
  }

  // ========== EXECUTE ==========
  const t = await seq.transaction();
  try {
    console.log('Step A: Park DB #601 → #606...');
    await seq.query(`UPDATE invoices SET invoice_number = 606 WHERE invoice_number = 601`, { transaction: t });

    console.log('Step B: Renumber 602→601, 603→602, 604→603, 605→604...');
    await seq.query(`UPDATE invoices SET invoice_number = 601 WHERE invoice_number = 602`, { transaction: t });
    await seq.query(`UPDATE invoices SET invoice_number = 602 WHERE invoice_number = 603`, { transaction: t });
    await seq.query(`UPDATE invoices SET invoice_number = 603 WHERE invoice_number = 604`, { transaction: t });
    await seq.query(`UPDATE invoices SET invoice_number = 604 WHERE invoice_number = 605`, { transaction: t });

    console.log('Step B2: Apply discounts to match SB totals...');
    // New #602 Jackson: $607.57 - $26.57 = $581.00
    await seq.query(
      `UPDATE invoices
         SET total_discount = total_discount + 26.57,
             final_total = 581.00,
             updated_at = NOW()
       WHERE invoice_number = 602`,
      { transaction: t }
    );
    // New #603 Nettey: $196.59 - $8.87 = $187.72
    await seq.query(
      `UPDATE invoices
         SET total_discount = total_discount + 8.87,
             final_total = 187.72,
             updated_at = NOW()
       WHERE invoice_number = 603`,
      { transaction: t }
    );

    if (existingCust.length === 0) {
      console.log('Step C: Insert MARK QUIST customer...');
      await seq.query(
        `INSERT INTO customers (id, full_name, email, phone, address, created_at, updated_at)
         VALUES (:id, :full_name, :email, :phone, :address, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        { replacements: customerToUse, transaction: t }
      );
    }

    console.log('Step D: Insert MARK QUIST invoice as #605...');
    const INV_COLS = [
      'id', 'invoice_number', 'customer_id', 'customer_name', 'customer_email',
      'customer_address', 'customer_phone', 'recipient_id', 'recipient_name',
      'recipient_phone', 'recipient_address', 'subtotal', 'total_discount',
      'final_total', 'original_item_count', 'added_item_count', 'payment_status',
      'payment_method', 'amount_paid', 'shipment_id', 'status', 'last_edited_at',
      'created_at', 'updated_at'
    ];
    const placeholders = INV_COLS.map((_, j) => `$${j + 1}`).join(', ');
    const values = INV_COLS.map(col => markQuistInvoice[col]);
    await seq.query(
      `INSERT INTO invoices (${INV_COLS.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`,
      { bind: values, transaction: t }
    );

    console.log(`Step E: Insert ${markQuistLineRows.length} line items...`);
    const LI_COLS = [
      'id', 'invoice_id', 'type', 'catalog_item_id', 'catalog_name', 'description',
      'quantity', 'base_price', 'discount_type', 'discount_amount', 'final_price',
      'dimensions_l', 'dimensions_w', 'dimensions_h', 'sort_order', 'created_at', 'updated_at'
    ];
    for (const li of markQuistLineRows) {
      const liPh = LI_COLS.map((_, j) => `$${j + 1}`).join(', ');
      const liVals = LI_COLS.map(col => li[col]);
      await seq.query(
        `INSERT INTO line_items (${LI_COLS.map(c => `"${c}"`).join(', ')}) VALUES (${liPh})`,
        { bind: liVals, transaction: t }
      );
    }

    console.log('Step F: Update sequences.next_invoice_num = 607...');
    await seq.query(`UPDATE sequences SET value = 607 WHERE key = 'next_invoice_num'`, { transaction: t });

    await t.commit();
    console.log('\n✓ Transaction committed.\n');
  } catch (e) {
    await t.rollback();
    console.error('\n✗ Transaction rolled back:', e.message);
    console.error(e.stack);
    throw e;
  }

  // ---------- Verify ----------
  console.log('Step G: Verifying final state...');
  const [finalState] = await seq.query(`
    SELECT invoice_number, customer_name, subtotal, total_discount, final_total, amount_paid, payment_status
    FROM invoices
    WHERE invoice_number BETWEEN 601 AND 606
    ORDER BY invoice_number
  `);
  console.log('Final DB #601-#606:');
  for (const r of finalState) {
    console.log(`  #${r.invoice_number} | sub $${String(r.subtotal).padStart(9)} | disc $${String(r.total_discount).padStart(7)} | final $${String(r.final_total).padStart(9)} | ${String(r.payment_status).padEnd(8)} | ${r.customer_name}`);
  }
  const [[seqRow]] = await seq.query(`SELECT value FROM sequences WHERE key = 'next_invoice_num'`);
  console.log(`Next invoice #: ${seqRow.value}`);
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
