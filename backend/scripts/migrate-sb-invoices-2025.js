/**
 * SalesBinder → GCGL Invoice + LineItem + Payment Migration (2025 only)
 *
 * Fetches all 2025 invoices from GCGL SalesBinder, links to migrated
 * customers/recipients, creates invoices + line items + payment records.
 * Auto-assigns to shipments by date range.
 *
 * Fixes from 2026 migration: negative line items are included (as discounts
 * on the invoice total), and finalTotal always uses SalesBinder's total_price.
 *
 * Usage:
 *   node scripts/migrate-sb-invoices-2025.js              # dry run
 *   node scripts/migrate-sb-invoices-2025.js --execute     # insert into database
 */

const https = require('https');
const crypto = require('crypto');

// ---------- Config ----------
const API_HOST = 'gcgl.salesbinder.com';
const API_KEY = '1iKEo36mgvupBdceenaS5Q3wchdzXxOEYHUINRoJ';
const AUTH = Buffer.from(`${API_KEY}:x`).toString('base64');
const RATE_DELAY = 1600;

const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://postgres:mWTtqDSnqgCaksaawcrBNfxCUPaSAYsg@centerbeam.proxy.rlwy.net:38751/railway';

const mode = process.argv[2] || '--dry-run';
const isDryRun = mode !== '--execute';

const { Sequelize } = require('sequelize');
const seq = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

// ---------- Status Mapping ----------
const PAYMENT_STATUS_MAP = {
  'paid in full': 'paid',
  'unpaid':       'unpaid',
  'partially paid': 'partial',
  'open':         'unpaid',
  'draft':        'unpaid',
  'overdue':      'unpaid',
  'cancelled':    'unpaid',
  'void':         'unpaid',
};

function mapPaymentStatus(sbStatus) {
  const name = (sbStatus?.name || '').toLowerCase().trim();
  return PAYMENT_STATUS_MAP[name] || 'unpaid';
}

// ---------- API Helpers ----------
function fetchJSON(path, retries = 3) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: API_HOST,
      path: `/api/2.0${path}`,
      method: 'GET',
      headers: { 'Authorization': `Basic ${AUTH}`, 'Accept': 'application/json' },
      timeout: 15000
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', async () => {
        if (res.statusCode === 429 && retries > 0) {
          console.log(`  Rate limited. Waiting 10s (${retries} retries left)...`);
          await new Promise(r => setTimeout(r, 10000));
          try { resolve(await fetchJSON(path, retries - 1)); } catch (e) { reject(e); }
          return;
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: ${d.substring(0, 200)}`));
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.on('error', reject);
    req.end();
  });
}

// ---------- Fetch All Invoices ----------
async function fetchAllInvoices() {
  const all = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    process.stdout.write(`  Fetching page ${page}/${totalPages}...\r`);
    const response = await fetchJSON(`/documents.json?contextId=5&limit=100&page=${page}`);
    totalPages = parseInt(response.pages);
    if (page === 1) console.log(`  SalesBinder total: ${response.count} invoices, ${totalPages} pages`);
    all.push(...(response.documents[0] || response.documents || []).flat());
    page++;
    if (page <= totalPages) await new Promise(r => setTimeout(r, RATE_DELAY));
  }
  return all;
}

// ---------- Parse Dimensions ----------
function parseDimensions(desc) {
  if (!desc) return null;
  const match = desc.match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  return { l: parseFloat(match[1]), w: parseFloat(match[2]), h: parseFloat(match[3]) };
}

// ---------- Parse shipping address ----------
function parseShippingAddress(shipAddr) {
  if (!shipAddr) return null;
  const cleaned = shipAddr.replace(/\r\n/g, ', ').replace(/\n/g, ', ').trim();
  if (!cleaned) return null;

  let name = cleaned;
  let phone = null;

  const phoneMatch = cleaned.match(/(\+?\d[\d\s\-]{8,14}\d)/);
  if (phoneMatch) {
    phone = phoneMatch[1].trim();
    name = cleaned.replace(phoneMatch[0], '').trim();
  }

  name = name.replace(/[,.\s]+$/, '').trim();
  const parts = name.split(/[\s,]+/).filter(Boolean);
  const firstName = parts[0] || 'Unknown';
  const lastName = parts.slice(1).join(' ') || '';

  return { firstName, lastName, phone, fullAddress: cleaned };
}

// ---------- Shipment assignment by date ----------
function findShipmentForDate(dateStr, shipments) {
  const date = new Date(dateStr);
  for (const s of shipments) {
    const start = new Date(s.start_date);
    if (s.end_date) {
      const end = new Date(s.end_date);
      if (date >= start && date <= end) return s.id;
    } else {
      // Open-ended (collecting) — matches if date >= start
      if (date >= start) return s.id;
    }
  }
  return null;
}

// ---------- Main ----------
async function run() {
  console.log(isDryRun
    ? '=== DRY RUN — no data will be changed ==='
    : '=== EXECUTING INVOICE MIGRATION (2025) ===');
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  // Step 1: Build lookups
  console.log('Step 1: Building lookups from database...');
  const [customers] = await seq.query('SELECT id, full_name, email, phone, address FROM customers');
  const customerMap = new Map(customers.map(c => [c.id, c]));

  const [recipients] = await seq.query('SELECT id, customer_id, first_name, last_name, phone, city, country, address FROM recipients');
  const recipientByCustomer = new Map();
  for (const r of recipients) {
    if (!recipientByCustomer.has(r.customer_id)) {
      recipientByCustomer.set(r.customer_id, r);
    }
  }

  // Load existing invoice IDs to skip duplicates
  const [existingInvs] = await seq.query('SELECT id FROM invoices');
  const existingIds = new Set(existingInvs.map(r => r.id));

  // Load shipments for date-based assignment
  const [shipmentRows] = await seq.query('SELECT id, name, start_date, end_date, status FROM shipments ORDER BY start_date');
  console.log(`  ${customerMap.size} customers, ${recipientByCustomer.size} with recipients, ${existingIds.size} existing invoices, ${shipmentRows.length} shipments\n`);

  // Step 2: Fetch all invoices
  console.log('Step 2: Fetching invoices from SalesBinder...');
  const allDocs = await fetchAllInvoices();

  // Filter to 2025 only, exclude already imported
  const docs2025 = allDocs.filter(d => {
    if (existingIds.has(d.id)) return false;
    const issueYear = new Date(d.issue_date).getFullYear();
    return issueYear === 2025;
  });
  console.log(`\n  Total fetched: ${allDocs.length}, 2025 new invoices: ${docs2025.length}\n`);

  if (docs2025.length === 0) {
    console.log('Nothing to import.');
    return;
  }

  // Step 3: Map invoices + line items
  console.log('Step 3: Mapping invoices...');
  const invoices = [];
  const lineItems = [];
  const newRecipients = [];
  let unmatchedCustomers = 0;
  let negLineItems = 0;

  for (const sb of docs2025.sort((a, b) => a.document_number - b.document_number)) {
    let customer = customerMap.get(sb.customer_id);
    if (!customer) {
      try {
        await new Promise(r => setTimeout(r, RATE_DELAY));
        const custResponse = await fetchJSON(`/customers/${sb.customer_id}.json`);
        const sbCust = custResponse.customer || custResponse;
        const fullName = (sbCust.name || sb.cache__customer_name || 'Unknown').trim();
        const addrParts = [sbCust.billing_address_1, sbCust.billing_city, sbCust.billing_region, sbCust.billing_postal_code, sbCust.billing_country].filter(Boolean);

        customer = {
          id: sb.customer_id,
          full_name: fullName,
          email: sbCust.office_email?.trim() || 'noemail@gcgl.com',
          phone: sbCust.office_phone?.trim() || 'N/A',
          address: addrParts.length > 0 ? addrParts.join(', ') : 'N/A',
        };

        if (!isDryRun) {
          await seq.query(
            `INSERT INTO customers (id, full_name, email, phone, address, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) ON CONFLICT (id) DO NOTHING`,
            { bind: [customer.id, customer.full_name, customer.email, customer.phone, customer.address] }
          );
        }
        customerMap.set(sb.customer_id, customer);
        console.log(`  Created missing customer: ${fullName} (#${sb.document_number})`);
      } catch (e) {
        unmatchedCustomers++;
        console.log(`  WARNING: Could not fetch customer ${sb.customer_id} (${sb.cache__customer_name}) — skipping invoice #${sb.document_number}`);
        continue;
      }
    }

    // Resolve recipient
    let recipientId = null;
    let recipientName = null;
    let recipientPhone = null;
    let recipientAddress = null;

    const existingRecipient = recipientByCustomer.get(sb.customer_id);
    if (existingRecipient) {
      recipientId = existingRecipient.id;
      recipientName = `${existingRecipient.first_name} ${existingRecipient.last_name}`.trim();
      recipientPhone = existingRecipient.phone;
      recipientAddress = existingRecipient.address;
    } else if (sb.shipping_address) {
      const parsed = parseShippingAddress(sb.shipping_address);
      if (parsed) {
        const newRecipId = crypto.randomUUID();
        const newRecip = {
          id: newRecipId,
          customer_id: sb.customer_id,
          first_name: parsed.firstName,
          last_name: parsed.lastName || parsed.firstName,
          phone: parsed.phone || customer.phone || 'N/A',
          city: 'Unknown',
          country: 'Ghana',
          address: parsed.fullAddress,
          is_default: true,
          created_at: sb.created || new Date().toISOString(),
          updated_at: sb.modified || new Date().toISOString(),
        };
        newRecipients.push(newRecip);
        recipientByCustomer.set(sb.customer_id, newRecip);

        recipientId = newRecipId;
        recipientName = `${parsed.firstName} ${parsed.lastName}`.trim();
        recipientPhone = parsed.phone || customer.phone || 'N/A';
        recipientAddress = parsed.fullAddress;
      }
    }

    if (!recipientName) {
      recipientName = customer.full_name;
      recipientPhone = customer.phone;
      recipientAddress = customer.address;
    }

    // Map line items — include ALL items, even negative ones
    const items = (sb.document_items || []).filter(i => i.delete !== 1);
    let positiveSubtotal = 0;
    let negativeTotal = 0;

    for (let idx = 0; idx < items.length; idx++) {
      const li = items[idx];
      const qty = parseInt(li.quantity) || 1;
      const price = parseFloat(li.price) || 0;
      const discPct = parseFloat(li.discount_percent) || 0;
      const discAmt = discPct > 0 ? (price * qty * discPct / 100) : 0;
      const finalPrice = (price * qty) - discAmt;
      const dims = parseDimensions(li.description);

      if (price >= 0) {
        positiveSubtotal += price * qty;
      } else {
        negativeTotal += Math.abs(price * qty);
        negLineItems++;
      }

      lineItems.push({
        id: li.id,
        invoice_id: sb.id,
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
        created_at: li.created || sb.created || new Date().toISOString(),
        updated_at: li.modified || sb.modified || new Date().toISOString(),
      });
    }

    // Always use SalesBinder's total_price as the authoritative finalTotal
    const totalPrice = parseFloat(sb.total_price) || 0;
    const amountPaid = parseFloat(sb.total_transactions) || 0;
    const paymentStatus = mapPaymentStatus(sb.status);

    // Compute discount as difference between positive items and SB total
    const computedDiscount = Math.max(0, positiveSubtotal - totalPrice);

    // Auto-assign shipment by date
    const shipmentId = findShipmentForDate(sb.issue_date, shipmentRows);

    invoices.push({
      id: sb.id,
      invoice_number: sb.document_number,
      customer_id: sb.customer_id,
      customer_name: sb.cache__customer_name || customer.full_name,
      customer_email: customer.email,
      customer_address: customer.address,
      customer_phone: customer.phone,
      recipient_id: recipientId,
      recipient_name: recipientName,
      recipient_phone: recipientPhone,
      recipient_address: recipientAddress,
      subtotal: positiveSubtotal,
      total_discount: computedDiscount,
      final_total: totalPrice,
      original_item_count: items.length,
      added_item_count: 0,
      payment_status: paymentStatus,
      payment_method: null,
      amount_paid: amountPaid,
      shipment_id: shipmentId,
      status: 'completed',
      last_edited_at: sb.modified || null,
      created_at: sb.issue_date ? sb.issue_date.split('T')[0] + 'T12:00:00Z' : sb.created,
      updated_at: sb.modified || new Date().toISOString(),
      _sb_id: sb.id,
      _sb_status: paymentStatus,
      _sb_amount_paid: amountPaid,
      _sb_issue_date: sb.issue_date,
    });
  }

  console.log(`  Mapped ${invoices.length} invoices, ${lineItems.length} line items`);
  console.log(`  Negative line items (discounts): ${negLineItems}`);
  console.log(`  New recipients to create: ${newRecipients.length}`);
  console.log(`  Unmatched customers (skipped): ${unmatchedCustomers}\n`);

  // Status breakdown
  const statusCounts = {};
  invoices.forEach(inv => { statusCounts[inv.payment_status] = (statusCounts[inv.payment_status] || 0) + 1; });
  console.log('Status breakdown:', JSON.stringify(statusCounts));

  // Shipment assignment breakdown
  const shipCounts = {};
  invoices.forEach(inv => {
    const s = shipmentRows.find(r => r.id === inv.shipment_id);
    const label = s ? s.name : 'unassigned';
    shipCounts[label] = (shipCounts[label] || 0) + 1;
  });
  console.log('Shipment assignment:', JSON.stringify(shipCounts));

  // Preview
  console.log('\nSample invoices (first 10):');
  console.log('─'.repeat(130));
  for (const inv of invoices.slice(0, 10)) {
    const recip = inv.recipient_id ? 'linked' : 'none';
    const ship = shipmentRows.find(s => s.id === inv.shipment_id)?.name || 'none';
    console.log(`  #${String(inv.invoice_number).padEnd(4)} | ${inv.payment_status.padEnd(8)} | $${String(inv.final_total).padStart(10)} | paid: $${String(inv.amount_paid).padStart(10)} | ${(inv.customer_name||'?').substring(0,22).padEnd(22)} | ${ship.padEnd(16)} | ${inv.original_item_count} items`);
  }
  console.log('─'.repeat(130));

  if (isDryRun) {
    const totalValue = invoices.reduce((s, i) => s + i.final_total, 0);
    console.log(`\nDry run complete. Total value: $${totalValue.toFixed(2)}`);
    console.log(`Run with --execute to:`);
    console.log(`  1. Create ${newRecipients.length} new recipients`);
    console.log(`  2. Insert ${invoices.length} invoices + ${lineItems.length} line items`);
    console.log(`  3. Fetch & insert payment transactions`);
    console.log(`  4. Update shipment totals`);
    return;
  }

  // ========== EXECUTE ==========

  // Step 4: Insert new recipients
  if (newRecipients.length > 0) {
    console.log(`\nStep 4: Inserting ${newRecipients.length} new recipients...`);
    const RECIP_COLS = ['id', 'customer_id', 'first_name', 'last_name', 'phone', 'city', 'country', 'address', 'is_default', 'created_at', 'updated_at'];
    let insertedRecip = 0;
    for (const row of newRecipients) {
      try {
        const placeholders = RECIP_COLS.map((_, j) => `$${j + 1}`).join(', ');
        const values = RECIP_COLS.map(col => row[col]);
        await seq.query(
          `INSERT INTO recipients (${RECIP_COLS.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})
           ON CONFLICT (id) DO NOTHING`,
          { bind: values }
        );
        insertedRecip++;
      } catch (e) {
        console.log(`  FAILED recipient: ${row.first_name} ${row.last_name} — ${e.message.split('\n')[0]}`);
      }
    }
    console.log(`  Inserted ${insertedRecip} recipients`);
  }

  // Step 5: Insert invoices + line items
  console.log(`\nStep 5: Inserting ${invoices.length} invoices...`);
  const INV_COLS = [
    'id', 'invoice_number', 'customer_id', 'customer_name', 'customer_email',
    'customer_address', 'customer_phone', 'recipient_id', 'recipient_name',
    'recipient_phone', 'recipient_address', 'subtotal', 'total_discount',
    'final_total', 'original_item_count', 'added_item_count', 'payment_status',
    'payment_method', 'amount_paid', 'shipment_id', 'status', 'last_edited_at',
    'created_at', 'updated_at'
  ];

  const LI_COLS = [
    'id', 'invoice_id', 'type', 'catalog_item_id', 'catalog_name', 'description',
    'quantity', 'base_price', 'discount_type', 'discount_amount', 'final_price',
    'dimensions_l', 'dimensions_w', 'dimensions_h', 'sort_order',
    'created_at', 'updated_at'
  ];

  let insertedInv = 0;
  let failedInv = 0;

  for (const inv of invoices) {
    const t = await seq.transaction();
    try {
      const placeholders = INV_COLS.map((_, j) => `$${j + 1}`).join(', ');
      const values = INV_COLS.map(col => inv[col]);
      await seq.query(
        `INSERT INTO invoices (${INV_COLS.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})
         ON CONFLICT (id) DO NOTHING`,
        { bind: values, transaction: t }
      );

      const invLineItems = lineItems.filter(li => li.invoice_id === inv.id);
      for (const li of invLineItems) {
        const liPlaceholders = LI_COLS.map((_, j) => `$${j + 1}`).join(', ');
        const liValues = LI_COLS.map(col => li[col]);
        await seq.query(
          `INSERT INTO line_items (${LI_COLS.map(c => `"${c}"`).join(', ')}) VALUES (${liPlaceholders})
           ON CONFLICT (id) DO NOTHING`,
          { bind: liValues, transaction: t }
        );
      }

      await t.commit();
      insertedInv++;
      process.stdout.write(`  ${insertedInv}/${invoices.length} invoices inserted\r`);
    } catch (e) {
      await t.rollback();
      failedInv++;
      console.log(`\n  FAILED #${inv.invoice_number}: ${e.message.split('\n')[0]}`);
    }
  }
  console.log(`\n  Invoices: ${insertedInv} inserted, ${failedInv} failed`);

  // Step 6: Fetch and insert payment transactions
  const paidInvoices = invoices.filter(inv => inv._sb_amount_paid > 0);
  console.log(`\nStep 6: Fetching payment transactions for ${paidInvoices.length} invoices...`);

  const PAY_COLS = ['id', 'invoice_id', 'transaction_type', 'payment_date', 'amount', 'payment_method', 'comment', 'created_at', 'updated_at'];
  let insertedPay = 0;
  let payErrors = 0;

  for (const inv of paidInvoices) {
    await new Promise(r => setTimeout(r, RATE_DELAY));

    try {
      const docResponse = await fetchJSON(`/documents/${inv._sb_id}.json`);
      const doc = docResponse.document || docResponse;
      const transactions = doc.transactions || [];

      if (transactions.length === 0) {
        const payId = crypto.randomUUID();
        const payDate = inv._sb_issue_date ? inv._sb_issue_date.split('T')[0] : new Date().toISOString().split('T')[0];
        await seq.query(
          `INSERT INTO invoice_payments (id, invoice_id, transaction_type, payment_date, amount, payment_method, comment, created_at, updated_at)
           VALUES ($1, $2, 'PAYMENT', $3, $4, 'Cash', $5, NOW(), NOW())`,
          { bind: [payId, inv.id, payDate, inv._sb_amount_paid, 'Migrated from SalesBinder'] }
        );
        insertedPay++;
        console.log(`  #${inv.invoice_number}: synthetic $${inv._sb_amount_paid}`);
        continue;
      }

      for (const txn of transactions) {
        const amount = parseFloat(txn.amount || 0);
        if (amount === 0) continue;

        const txnDate = (txn.transaction_date || txn.created || '').split('T')[0] ||
                        (inv._sb_issue_date || '').split('T')[0] ||
                        new Date().toISOString().split('T')[0];
        const isRefund = amount < 0;

        const payment = {
          id: crypto.randomUUID(),
          invoice_id: inv.id,
          transaction_type: isRefund ? 'REFUND' : 'PAYMENT',
          payment_date: txnDate,
          amount: Math.abs(amount),
          payment_method: 'Cash',
          comment: txn.reference || 'Payment from SalesBinder',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        try {
          const placeholders = PAY_COLS.map((_, j) => `$${j + 1}`).join(', ');
          const values = PAY_COLS.map(col => payment[col]);
          await seq.query(
            `INSERT INTO invoice_payments (${PAY_COLS.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`,
            { bind: values }
          );
          insertedPay++;
          console.log(`  #${inv.invoice_number}: ${isRefund ? 'REFUND' : 'PAYMENT'} $${Math.abs(amount).toFixed(2)} | ${txn.reference || 'no ref'}`);
        } catch (e) {
          payErrors++;
          console.log(`  #${inv.invoice_number}: payment error — ${e.message.split('\n')[0]}`);
        }
      }
    } catch (e) {
      payErrors++;
      console.log(`  #${inv.invoice_number}: fetch error — ${e.message}`);
      try {
        const payId = crypto.randomUUID();
        const payDate = (inv._sb_issue_date || '').split('T')[0] || new Date().toISOString().split('T')[0];
        await seq.query(
          `INSERT INTO invoice_payments (id, invoice_id, transaction_type, payment_date, amount, payment_method, comment, created_at, updated_at)
           VALUES ($1, $2, 'PAYMENT', $3, $4, 'Cash', $5, NOW(), NOW())`,
          { bind: [payId, inv.id, payDate, inv._sb_amount_paid, 'Migrated from SalesBinder (fallback)'] }
        );
        insertedPay++;
      } catch (e2) {
        console.log(`  #${inv.invoice_number}: fallback also failed`);
      }
    }
  }
  console.log(`\n  Payments: ${insertedPay} inserted, ${payErrors} errors`);

  // Step 7: Recalculate shipment totals
  console.log('\nStep 7: Updating shipment totals...');
  await seq.query(`
    UPDATE shipments s SET total_value = COALESCE((
      SELECT SUM(final_total) FROM invoices WHERE shipment_id = s.id
    ), 0)
  `);
  const [updatedShipments] = await seq.query('SELECT name, total_value, (SELECT COUNT(*) FROM invoices WHERE shipment_id = shipments.id) as inv_count FROM shipments ORDER BY start_date');
  for (const s of updatedShipments) {
    console.log(`  ${s.name.padEnd(20)} | $${parseFloat(s.total_value).toFixed(2).padStart(12)} | ${s.inv_count} invoices`);
  }

  // Step 8: Summary
  console.log('\n=== MIGRATION COMPLETE ===');
  const [[invCount]] = await seq.query('SELECT COUNT(*) as count FROM invoices');
  const [[liCount]] = await seq.query('SELECT COUNT(*) as count FROM line_items');
  const [[payCount]] = await seq.query('SELECT COUNT(*) as count FROM invoice_payments');
  const [[recipCount]] = await seq.query('SELECT COUNT(*) as count FROM recipients');
  const [[custCount]] = await seq.query('SELECT COUNT(*) as count FROM customers');
  console.log(`  Customers:      ${custCount.count}`);
  console.log(`  Recipients:     ${recipCount.count}`);
  console.log(`  Invoices:       ${invCount.count}`);
  console.log(`  Line items:     ${liCount.count}`);
  console.log(`  Payments:       ${payCount.count}`);

  const [revSummary] = await seq.query(`
    SELECT payment_status, COUNT(*) as cnt, SUM(final_total) as total, SUM(amount_paid) as paid
    FROM invoices GROUP BY payment_status ORDER BY payment_status
  `);
  console.log('\nRevenue by status:');
  for (const r of revSummary) {
    console.log(`  ${r.payment_status.padEnd(10)} | ${String(r.cnt).padStart(3)} invoices | total: $${parseFloat(r.total).toFixed(2).padStart(12)} | paid: $${parseFloat(r.paid).toFixed(2).padStart(12)}`);
  }
}

async function main() {
  try {
    await seq.authenticate();
    console.log('Database connected.\n');
    await run();
  } catch (e) {
    console.error('Fatal error:', e.message);
    console.error(e.stack);
    process.exit(1);
  } finally {
    await seq.close();
  }
}

main();
