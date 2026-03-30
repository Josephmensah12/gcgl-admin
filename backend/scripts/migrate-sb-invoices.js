/**
 * SalesBinder → GCGL Invoice + LineItem + Payment Migration (2026 only)
 *
 * Fetches all 2026 invoices from GCGL SalesBinder, links to migrated
 * customers/recipients, creates invoices + line items + payment records.
 *
 * Usage:
 *   node scripts/migrate-sb-invoices.js              # dry run
 *   node scripts/migrate-sb-invoices.js --execute     # insert into database
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

// ---------- Parse Dimensions from description ----------
// e.g. "14x7x6" → { l: 14, w: 7, h: 6 }
function parseDimensions(desc) {
  if (!desc) return null;
  const match = desc.match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  return { l: parseFloat(match[1]), w: parseFloat(match[2]), h: parseFloat(match[3]) };
}

// ---------- Parse recipient info from shipping_address ----------
// Common patterns:
//   "FRED BART SIMPSON, Adenta. 0208111543"
//   "Samuel Ofosu +233 26 964 7084 House no.8 Nsawam road"
//   "Kobie"
//   "Kanda 0244252564 Accra, Ghana"
function parseShippingAddress(shipAddr) {
  if (!shipAddr) return null;
  const cleaned = shipAddr.replace(/\r\n/g, ', ').replace(/\n/g, ', ').trim();
  if (!cleaned) return null;

  let name = cleaned;
  let phone = null;

  // Try to extract phone number
  const phoneMatch = cleaned.match(/(\+?\d[\d\s\-]{8,14}\d)/);
  if (phoneMatch) {
    phone = phoneMatch[1].trim();
    // Remove phone from name
    name = cleaned.replace(phoneMatch[0], '').trim();
  }

  // Clean up name: remove trailing punctuation, commas, city info
  name = name.replace(/[,.\s]+$/, '').trim();

  // Split into first/last
  const parts = name.split(/[\s,]+/).filter(Boolean);
  const firstName = parts[0] || 'Unknown';
  const lastName = parts.slice(1).join(' ') || '';

  return { firstName, lastName, phone, fullAddress: cleaned };
}

// ---------- Main ----------
async function run() {
  console.log(isDryRun
    ? '=== DRY RUN — no data will be changed ==='
    : '=== EXECUTING INVOICE MIGRATION (2026) ===');
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  // Step 1: Build customer + recipient lookups from DB
  console.log('Step 1: Building lookups from database...');
  const [customers] = await seq.query('SELECT id, full_name, email, phone, address FROM customers');
  const customerMap = new Map(customers.map(c => [c.id, c]));

  const [recipients] = await seq.query('SELECT id, customer_id, first_name, last_name, phone, city, country, address FROM recipients');
  // Map: customer_id → recipient (use first/default)
  const recipientByCustomer = new Map();
  for (const r of recipients) {
    if (!recipientByCustomer.has(r.customer_id)) {
      recipientByCustomer.set(r.customer_id, r);
    }
  }
  console.log(`  ${customerMap.size} customers, ${recipientByCustomer.size} customers with recipients\n`);

  // Step 2: Fetch all invoices from SalesBinder
  console.log('Step 2: Fetching invoices from SalesBinder...');
  const allDocs = await fetchAllInvoices();

  // Filter to 2026 only
  const docs2026 = allDocs.filter(d => {
    const issueYear = new Date(d.issue_date).getFullYear();
    const createdYear = new Date(d.created).getFullYear();
    return issueYear >= 2026 || createdYear >= 2026;
  });
  console.log(`\n  Total fetched: ${allDocs.length}, 2026 invoices: ${docs2026.length}\n`);

  // Step 3: Map invoices + line items
  console.log('Step 3: Mapping invoices...');
  const invoices = [];
  const lineItems = [];
  const newRecipients = []; // recipients to create for customers that don't have one
  let unmatchedCustomers = 0;

  for (const sb of docs2026.sort((a, b) => a.document_number - b.document_number)) {
    let customer = customerMap.get(sb.customer_id);
    if (!customer) {
      // Fetch missing customer from SalesBinder API and create in DB
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
      // Link to existing recipient
      recipientId = existingRecipient.id;
      recipientName = `${existingRecipient.first_name} ${existingRecipient.last_name}`.trim();
      recipientPhone = existingRecipient.phone;
      recipientAddress = existingRecipient.address;
    } else if (sb.shipping_address) {
      // Create new recipient from invoice shipping_address
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
        recipientByCustomer.set(sb.customer_id, newRecip); // cache for subsequent invoices

        recipientId = newRecipId;
        recipientName = `${parsed.firstName} ${parsed.lastName}`.trim();
        recipientPhone = parsed.phone || customer.phone || 'N/A';
        recipientAddress = parsed.fullAddress;
      }
    }

    // If still no recipient, use customer info as fallback
    if (!recipientName) {
      recipientName = customer.full_name;
      recipientPhone = customer.phone;
      recipientAddress = customer.address;
    }

    // Map line items for this invoice
    const items = (sb.document_items || []).filter(i => i.delete !== 1);
    let subtotal = 0;
    let totalDiscount = 0;

    for (let idx = 0; idx < items.length; idx++) {
      const li = items[idx];
      const qty = parseInt(li.quantity) || 1;
      const price = parseFloat(li.price) || 0;
      const discPct = parseFloat(li.discount_percent) || 0;
      const discAmt = discPct > 0 ? (price * qty * discPct / 100) : 0;
      const finalPrice = (price * qty) - discAmt;
      const dims = parseDimensions(li.description);

      subtotal += price * qty;
      totalDiscount += discAmt;

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

    const totalPrice = parseFloat(sb.total_price) || 0;
    const amountPaid = parseFloat(sb.total_transactions) || 0;
    const paymentStatus = mapPaymentStatus(sb.status);

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
      subtotal: subtotal,
      total_discount: totalDiscount,
      final_total: totalPrice,
      original_item_count: items.length,
      added_item_count: 0,
      payment_status: paymentStatus,
      payment_method: null,
      amount_paid: amountPaid,
      shipment_id: null,
      status: 'completed',
      last_edited_at: sb.modified || null,
      created_at: sb.issue_date ? sb.issue_date.split('T')[0] + 'T12:00:00Z' : sb.created,
      updated_at: sb.modified || new Date().toISOString(),
      // Keep for payment fetching later
      _sb_id: sb.id,
      _sb_status: paymentStatus,
      _sb_amount_paid: amountPaid,
      _sb_issue_date: sb.issue_date,
    });
  }

  console.log(`  Mapped ${invoices.length} invoices, ${lineItems.length} line items`);
  console.log(`  New recipients to create: ${newRecipients.length}`);
  console.log(`  Unmatched customers (skipped): ${unmatchedCustomers}\n`);

  // Status breakdown
  const statusCounts = {};
  invoices.forEach(inv => { statusCounts[inv.payment_status] = (statusCounts[inv.payment_status] || 0) + 1; });
  console.log('Status breakdown:', JSON.stringify(statusCounts));

  // Preview
  console.log('\nSample invoices:');
  console.log('─'.repeat(120));
  for (const inv of invoices.slice(0, 10)) {
    const recip = inv.recipient_id ? 'linked' : 'none';
    console.log(`  #${String(inv.invoice_number).padEnd(4)} | ${inv.payment_status.padEnd(8)} | $${String(inv.final_total).padStart(8)} | paid: $${String(inv.amount_paid).padStart(8)} | ${(inv.customer_name||'?').padEnd(25)} | recip: ${recip} | ${inv.original_item_count} items`);
  }
  console.log('─'.repeat(120));

  if (isDryRun) {
    console.log(`\nDry run complete. Run with --execute to:`);
    console.log(`  1. Create ${newRecipients.length} new recipients`);
    console.log(`  2. Insert ${invoices.length} invoices`);
    console.log(`  3. Insert ${lineItems.length} line items`);
    console.log(`  4. Fetch & insert payment transactions for paid/partial invoices`);
    console.log(`  5. Update invoice number sequence to ${Math.max(...invoices.map(i => i.invoice_number)) + 1}`);
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

  // Step 5: Insert invoices
  console.log(`\nStep 5: Inserting ${invoices.length} invoices...`);
  const INV_COLS = [
    'id', 'invoice_number', 'customer_id', 'customer_name', 'customer_email',
    'customer_address', 'customer_phone', 'recipient_id', 'recipient_name',
    'recipient_phone', 'recipient_address', 'subtotal', 'total_discount',
    'final_total', 'original_item_count', 'added_item_count', 'payment_status',
    'payment_method', 'amount_paid', 'shipment_id', 'status', 'last_edited_at',
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

      // Insert line items for this invoice
      const invLineItems = lineItems.filter(li => li.invoice_id === inv.id);
      const LI_COLS = [
        'id', 'invoice_id', 'type', 'catalog_item_id', 'catalog_name', 'description',
        'quantity', 'base_price', 'discount_type', 'discount_amount', 'final_price',
        'dimensions_l', 'dimensions_w', 'dimensions_h', 'sort_order',
        'created_at', 'updated_at'
      ];

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

  // Step 6: Fetch and insert payment transactions for paid/partial invoices
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
        // Synthetic payment
        const payId = crypto.randomUUID();
        const payDate = inv._sb_issue_date ? inv._sb_issue_date.split('T')[0] : new Date().toISOString().split('T')[0];
        await seq.query(
          `INSERT INTO invoice_payments (id, invoice_id, transaction_type, payment_date, amount, payment_method, comment, created_at, updated_at)
           VALUES ($1, $2, 'PAYMENT', $3, $4, 'Cash', $5, NOW(), NOW())`,
          { bind: [payId, inv.id, payDate, inv._sb_amount_paid, 'Migrated from SalesBinder'] }
        );
        insertedPay++;
        console.log(`  #${inv.invoice_number}: synthetic $${inv._sb_amount_paid} (no transactions found)`);
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
          payment_method: 'Cash', // SalesBinder doesn't have method detail
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
      // Fallback synthetic
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

  // Step 7: Update invoice number sequence
  const maxInvNum = Math.max(...invoices.map(i => i.invoice_number));
  const nextNum = maxInvNum + 1;
  await seq.query(`UPDATE sequences SET value = $1 WHERE key = 'next_invoice_num'`, { bind: [nextNum] });
  console.log(`\nStep 7: Updated invoice sequence to ${nextNum}`);

  // Step 8: Summary
  console.log('\n=== MIGRATION COMPLETE ===');
  const [[invCount]] = await seq.query('SELECT COUNT(*) as count FROM invoices');
  const [[liCount]] = await seq.query('SELECT COUNT(*) as count FROM line_items');
  const [[payCount]] = await seq.query('SELECT COUNT(*) as count FROM invoice_payments');
  const [[recipCount]] = await seq.query('SELECT COUNT(*) as count FROM recipients');
  const [[seqRow]] = await seq.query("SELECT value FROM sequences WHERE key = 'next_invoice_num'");
  console.log(`  Invoices:       ${invCount.count}`);
  console.log(`  Line items:     ${liCount.count}`);
  console.log(`  Payments:       ${payCount.count}`);
  console.log(`  Recipients:     ${recipCount.count}`);
  console.log(`  Next inv #:     ${seqRow.value}`);

  // Revenue summary
  const [revSummary] = await seq.query(`
    SELECT payment_status, COUNT(*) as cnt, SUM(final_total) as total, SUM(amount_paid) as paid
    FROM invoices GROUP BY payment_status ORDER BY payment_status
  `);
  console.log('\nRevenue by status:');
  for (const r of revSummary) {
    console.log(`  ${r.payment_status.padEnd(10)} | ${r.cnt} invoices | total: $${parseFloat(r.total).toFixed(2)} | paid: $${parseFloat(r.paid).toFixed(2)}`);
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
