/**
 * Fix #610-#616 number drift: park local DB #610 (ENTECHPRISE LLC) at #617,
 * shift #611-#616 down by 1, import SB #616 (Dr. George Katei).
 *
 * Usage:
 *   node scripts/fix-610-616-numbers.js              # dry run
 *   node scripts/fix-610-616-numbers.js --execute
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

async function run() {
  console.log(isDryRun ? '=== DRY RUN ===' : '=== EXECUTING ===');

  // Verify current state
  const [current] = await seq.query(
    `SELECT invoice_number, customer_name, final_total FROM invoices
     WHERE invoice_number BETWEEN 610 AND 617 ORDER BY invoice_number`
  );
  console.log('\nCurrent DB #610-617:');
  for (const r of current) console.log(`  #${r.invoice_number} | $${r.final_total} | ${r.customer_name}`);

  // Check #617 is free
  const has617 = current.some(r => r.invoice_number === 617);
  if (has617) { console.log('\nABORT: #617 already exists'); return; }

  // Fetch SB #616
  console.log('\nFetching SB #616...');
  const p1 = await fetchJSON('/documents.json?contextId=5&limit=100&page=1');
  const docs = (p1.documents[0] || p1.documents || []).flat();
  const sb616 = docs.find(d => Number(d.document_number) === 616);
  if (!sb616) { console.log('SB #616 not found'); return; }

  await new Promise(r => setTimeout(r, RATE_DELAY));
  const full = await fetchJSON(`/documents/${sb616.id}.json`);
  const sbDoc = full.document || full;
  console.log(`  SB #616: ${sbDoc.cache__customer_name} | $${sbDoc.total_price} | ${(sbDoc.document_items || []).length} items`);

  console.log('\n============================================================');
  console.log('PLAN');
  console.log('  1. Park DB #610 (ENTECHPRISE LLC) → #617');
  console.log('  2. Shift: #611→#610, #612→#611, #613→#612, #614→#613, #615→#614, #616→#615');
  console.log('  3. Import SB #616 Dr. George Katei');
  console.log('  4. Set sequence to 618');
  console.log('============================================================');

  if (isDryRun) {
    console.log('\nDry run complete. Re-run with --execute to commit.');
    return;
  }

  const t = await seq.transaction();
  try {
    // Step 1: Park
    console.log('\nStep 1: Park #610 → #617');
    await seq.query('UPDATE invoices SET invoice_number = 617 WHERE invoice_number = 610', { transaction: t });

    // Step 2: Shift
    console.log('Step 2: Shift down');
    for (let n = 611; n <= 616; n++) {
      await seq.query('UPDATE invoices SET invoice_number = :new WHERE invoice_number = :old',
        { replacements: { old: n, new: n - 1 }, transaction: t });
      console.log(`  #${n} → #${n - 1}`);
    }

    // Step 3: Import SB #616
    console.log('Step 3: Import SB #616');

    // Ensure customer exists
    const [cust] = await seq.query(
      'SELECT id, full_name, email, phone, address FROM customers WHERE id = :id',
      { replacements: { id: sbDoc.customer_id }, transaction: t }
    );
    let customer;
    if (cust.length > 0) {
      customer = cust[0];
      console.log(`  Customer in DB: ${customer.full_name}`);
    } else {
      await new Promise(r => setTimeout(r, RATE_DELAY));
      const cr = await fetchJSON(`/customers/${sbDoc.customer_id}.json`);
      const sc = cr.customer || cr;
      const addr = [sc.billing_address_1, sc.billing_city, sc.billing_region, sc.billing_country].filter(Boolean).join(', ');
      customer = {
        id: sbDoc.customer_id,
        full_name: (sc.name || sbDoc.cache__customer_name || 'Unknown').trim(),
        email: sc.office_email?.trim() || 'noemail@gcgl.com',
        phone: sc.office_phone?.trim() || 'N/A',
        address: addr || 'N/A',
      };
      await seq.query(
        `INSERT INTO customers (id, full_name, email, phone, address, created_at, updated_at)
         VALUES (:id, :full_name, :email, :phone, :address, NOW(), NOW()) ON CONFLICT (id) DO NOTHING`,
        { replacements: customer, transaction: t }
      );
      console.log(`  Created customer: ${customer.full_name}`);
    }

    // Build line items
    const items = (sbDoc.document_items || []).filter(i => i.delete !== 1);
    let subtotal = 0;
    const liRows = [];
    for (let idx = 0; idx < items.length; idx++) {
      const li = items[idx];
      const qty = parseInt(li.quantity) || 1;
      const price = parseFloat(li.price) || 0;
      const finalPrice = qty * price;
      const dims = parseDimensions(li.description);
      subtotal += finalPrice;
      liRows.push({
        id: li.id, invoice_id: sbDoc.id, type: 'fixed',
        catalog_item_id: li.item_id || null, catalog_name: null,
        description: li.description || (price < 0 ? 'Adjustment' : null),
        quantity: qty, base_price: price,
        discount_type: null, discount_value: 0, pre_discount_total: Math.abs(finalPrice),
        discount_amount: null, final_price: finalPrice,
        dimensions_l: dims?.l || null, dimensions_w: dims?.w || null, dimensions_h: dims?.h || null,
        sort_order: idx,
        created_at: li.created || sbDoc.created || new Date().toISOString(),
        updated_at: li.modified || sbDoc.modified || new Date().toISOString(),
      });
    }

    const round2 = n => Math.round((Number(n) || 0) * 100) / 100;
    const inv = {
      id: sbDoc.id, invoice_number: 616,
      customer_id: customer.id || sbDoc.customer_id,
      customer_name: sbDoc.cache__customer_name || customer.full_name,
      customer_email: customer.email || 'noemail@gcgl.com',
      customer_address: customer.address || 'N/A',
      customer_phone: customer.phone || 'N/A',
      recipient_id: null,
      recipient_name: customer.full_name || sbDoc.cache__customer_name,
      recipient_phone: customer.phone || 'N/A',
      recipient_address: customer.address || 'N/A',
      subtotal: round2(subtotal), total_discount: 0,
      final_total: parseFloat(sbDoc.total_price) || round2(subtotal),
      original_item_count: items.length, added_item_count: 0,
      payment_status: parseFloat(sbDoc.total_transactions) >= parseFloat(sbDoc.total_price) - 0.01 ? 'paid' : parseFloat(sbDoc.total_transactions) > 0.01 ? 'partial' : 'unpaid',
      payment_method: null,
      amount_paid: parseFloat(sbDoc.total_transactions) || 0,
      shipment_id: null, status: 'completed', last_edited_at: sbDoc.modified || null,
      created_at: sbDoc.issue_date ? sbDoc.issue_date.split('T')[0] + 'T12:00:00Z' : sbDoc.created,
      updated_at: sbDoc.modified || new Date().toISOString(),
    };

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
      'quantity', 'base_price', 'discount_type', 'discount_value', 'pre_discount_total',
      'discount_amount', 'final_price', 'dimensions_l', 'dimensions_w', 'dimensions_h',
      'sort_order', 'created_at', 'updated_at'
    ];
    for (const li of liRows) {
      const liPh = LI_COLS.map((_, i) => `$${i + 1}`).join(', ');
      await seq.query(
        `INSERT INTO line_items (${LI_COLS.map(c => `"${c}"`).join(', ')}) VALUES (${liPh})`,
        { bind: LI_COLS.map(c => li[c]), transaction: t }
      );
    }
    console.log(`  ✓ Inserted #616 ${inv.customer_name} with ${liRows.length} items`);

    // Step 4: Sequence
    await seq.query(`UPDATE sequences SET value = 618 WHERE key = 'next_invoice_num'`, { transaction: t });
    console.log('Step 4: Sequence → 618');

    await t.commit();
    console.log('\n✓ Committed');
  } catch (e) {
    await t.rollback();
    console.error('\n✗ Rolled back:', e.message);
    throw e;
  }

  // Verify
  const [final] = await seq.query(
    `SELECT invoice_number, customer_name, final_total FROM invoices
     WHERE invoice_number BETWEEN 609 AND 618 ORDER BY invoice_number`
  );
  console.log('\nFinal #609-618:');
  for (const r of final) console.log(`  #${r.invoice_number} | $${r.final_total} | ${r.customer_name}`);
}

async function main() {
  try {
    await seq.authenticate();
    console.log('DB connected');
    await run();
  } catch (e) {
    console.error('Fatal:', e.message);
    process.exit(1);
  } finally {
    await seq.close();
  }
}

main();
