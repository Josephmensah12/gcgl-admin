/**
 * SalesBinder → GCGL Customer + Recipient Migration
 *
 * Fetches all customers from GCGL SalesBinder account and inserts into
 * GCGL PostgreSQL database. Creates Recipients from shipping address data.
 *
 * Usage:
 *   node scripts/migrate-sb-customers.js              # dry run
 *   node scripts/migrate-sb-customers.js --execute     # insert into database
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

// ---------- Fetch All Customers ----------
async function fetchAllCustomers() {
  const all = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    process.stdout.write(`  Fetching page ${page}/${totalPages}...\r`);
    const response = await fetchJSON(`/customers.json?limit=100&page=${page}`);
    totalPages = parseInt(response.pages);
    if (page === 1) console.log(`  SalesBinder total: ${response.count} customers, ${totalPages} pages`);
    all.push(...response.customers.flat());
    page++;
    if (page <= totalPages) await new Promise(r => setTimeout(r, RATE_DELAY));
  }
  console.log(`  Fetched ${all.length} customers\n`);
  return all;
}

// ---------- Mapping ----------
function buildAddress(sb) {
  const parts = [
    sb.billing_address_1,
    sb.billing_address_2,
    sb.billing_city,
    sb.billing_region,
    sb.billing_postal_code,
    sb.billing_country
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'N/A';
}

function mapCustomer(sb) {
  return {
    id: sb.id,
    full_name: (sb.name || 'Unknown').trim(),
    email: sb.office_email?.trim() || 'noemail@gcgl.com',
    phone: sb.office_phone?.trim() || 'N/A',
    address: buildAddress(sb),
    created_at: sb.created || new Date().toISOString(),
    updated_at: sb.modified || new Date().toISOString(),
  };
}

/**
 * Parse shipping address into a Recipient.
 * SalesBinder shipping fields often contain recipient name + phone in address_1,
 * e.g. "FRED BART SIMPSON, Adenta. 0208111543" or just a name like "Winnifred and Elizabeth"
 */
function mapRecipient(sb, customerId) {
  const shipAddr = (sb.shipping_address_1 || '').trim();
  if (!shipAddr) return null;

  // Try to extract name and phone from shipping_address_1
  // Common patterns: "Name, City. Phone" or "Name Phone" or just "Name"
  let firstName = '';
  let lastName = '';
  let recipientPhone = sb.office_phone?.trim() || 'N/A';

  // Check if shipping_address_1 looks like a phone number only
  const phoneOnly = shipAddr.replace(/[\s\-\(\)]/g, '');
  if (/^\d{10,15}$/.test(phoneOnly)) {
    // It's just a phone number — use customer name
    const parts = (sb.name || 'Unknown').trim().split(/\s+/);
    firstName = parts[0] || 'Unknown';
    lastName = parts.slice(1).join(' ') || '';
    recipientPhone = shipAddr;
  } else {
    // Try to split name from the rest
    // Remove embedded phone numbers from the string for name extraction
    let nameStr = shipAddr;

    // Extract phone if embedded (e.g. "Name. 0208111543")
    const phoneMatch = nameStr.match(/[\.\,\s]+(\d{10,15})\s*$/);
    if (phoneMatch) {
      recipientPhone = phoneMatch[1];
      nameStr = nameStr.substring(0, phoneMatch.index).trim();
    }

    // Remove trailing city info after comma (e.g. "FRED SIMPSON, Adenta")
    const commaParts = nameStr.split(',');
    nameStr = commaParts[0].trim();

    const nameParts = nameStr.split(/\s+/);
    firstName = nameParts[0] || 'Unknown';
    lastName = nameParts.slice(1).join(' ') || '';
  }

  const addressParts = [
    sb.shipping_address_1,
    sb.shipping_address_2,
  ].filter(Boolean);

  return {
    id: crypto.randomUUID(),
    customer_id: customerId,
    first_name: firstName,
    last_name: lastName || firstName,
    phone: recipientPhone,
    city: sb.shipping_city?.trim() || 'Unknown',
    country: sb.shipping_country?.trim() || 'Ghana',
    address: addressParts.join(', ') || 'N/A',
    is_default: true,
    created_at: sb.created || new Date().toISOString(),
    updated_at: sb.modified || new Date().toISOString(),
  };
}

// ---------- Main ----------
async function run() {
  console.log(isDryRun
    ? '=== DRY RUN — no data will be changed ==='
    : '=== EXECUTING CUSTOMER MIGRATION ===');
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  // Step 1: Fetch all customers from SalesBinder
  console.log('Step 1: Fetching customers from SalesBinder...');
  const sbCustomers = await fetchAllCustomers();

  // Step 2: Map data
  console.log('Step 2: Mapping data...');
  const customers = [];
  const recipients = [];

  for (const sb of sbCustomers) {
    customers.push(mapCustomer(sb));
    const recipient = mapRecipient(sb, sb.id);
    if (recipient) recipients.push(recipient);
  }

  console.log(`  Mapped ${customers.length} customers`);
  console.log(`  Mapped ${recipients.length} recipients (from shipping addresses)\n`);

  // Preview
  console.log('Sample customers (first 5):');
  console.log('─'.repeat(100));
  for (const c of customers.slice(0, 5)) {
    console.log(`  ${c.full_name.padEnd(30)} | ${c.phone.padEnd(15)} | ${c.email.padEnd(25)} | ${c.address.substring(0, 40)}`);
  }
  console.log('');

  console.log('Sample recipients (first 5):');
  console.log('─'.repeat(100));
  for (const r of recipients.slice(0, 5)) {
    console.log(`  ${(r.first_name + ' ' + r.last_name).padEnd(30)} | ${r.phone.padEnd(15)} | ${r.city.padEnd(15)} | ${r.country} | ${r.address.substring(0, 40)}`);
  }
  console.log('');

  if (isDryRun) {
    console.log(`Dry run complete. Run with --execute to:`);
    console.log(`  1. Delete existing test data (customers, recipients)`);
    console.log(`  2. Insert ${customers.length} customers`);
    console.log(`  3. Insert ${recipients.length} recipients`);
    return;
  }

  // Step 3: Clear test data (cascade through all dependent tables)
  console.log('Step 3: Clearing existing test data...');
  const counts = {};
  for (const tbl of ['invoice_payments', 'photos', 'line_items', 'invoices', 'recipients', 'customers', 'shipments']) {
    const [[row]] = await seq.query(`SELECT COUNT(*) as count FROM "${tbl}"`);
    counts[tbl] = parseInt(row.count);
  }
  // Delete in FK order
  for (const tbl of ['invoice_payments', 'photos', 'line_items', 'invoices', 'recipients', 'customers', 'shipments']) {
    if (counts[tbl] > 0) {
      await seq.query(`DELETE FROM "${tbl}"`);
      console.log(`  Deleted ${counts[tbl]} from ${tbl}`);
    }
  }
  // Reset invoice number sequence
  await seq.query(`UPDATE sequences SET value = 10001 WHERE key = 'next_invoice_num'`);
  console.log(`  Reset invoice sequence to 10001\n`);

  // Step 4: Insert customers in batches
  console.log('Step 4: Inserting customers...');
  const CUST_COLS = ['id', 'full_name', 'email', 'phone', 'address', 'created_at', 'updated_at'];
  let insertedCust = 0;
  let failedCust = 0;

  const BATCH = 50;
  for (let i = 0; i < customers.length; i += BATCH) {
    const batch = customers.slice(i, i + BATCH);
    const t = await seq.transaction();
    try {
      for (const row of batch) {
        const placeholders = CUST_COLS.map((_, j) => `$${j + 1}`).join(', ');
        const values = CUST_COLS.map(col => row[col]);
        await seq.query(
          `INSERT INTO customers (${CUST_COLS.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})
           ON CONFLICT (id) DO NOTHING`,
          { bind: values, transaction: t }
        );
        insertedCust++;
      }
      await t.commit();
      process.stdout.write(`  ${insertedCust}/${customers.length} customers inserted\r`);
    } catch (e) {
      await t.rollback();
      console.log(`\n  Batch error: ${e.message.split('\n')[0]}`);
      // Fall back to individual inserts
      for (const row of batch) {
        try {
          const placeholders = CUST_COLS.map((_, j) => `$${j + 1}`).join(', ');
          const values = CUST_COLS.map(col => row[col]);
          await seq.query(
            `INSERT INTO customers (${CUST_COLS.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})
             ON CONFLICT (id) DO NOTHING`,
            { bind: values }
          );
          insertedCust++;
        } catch (e2) {
          failedCust++;
          console.log(`  FAILED: ${row.full_name} — ${e2.message.split('\n')[0]}`);
        }
      }
    }
  }
  console.log(`\n  Customers: ${insertedCust} inserted, ${failedCust} failed\n`);

  // Step 5: Insert recipients
  console.log('Step 5: Inserting recipients...');
  const RECIP_COLS = ['id', 'customer_id', 'first_name', 'last_name', 'phone', 'city', 'country', 'address', 'is_default', 'created_at', 'updated_at'];
  let insertedRecip = 0;
  let failedRecip = 0;

  for (const row of recipients) {
    try {
      const placeholders = RECIP_COLS.map((_, j) => `$${j + 1}`).join(', ');
      const values = RECIP_COLS.map(col => row[col]);
      await seq.query(
        `INSERT INTO recipients (${RECIP_COLS.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`,
        { bind: values }
      );
      insertedRecip++;
    } catch (e) {
      failedRecip++;
      console.log(`  FAILED recipient for ${row.first_name} ${row.last_name}: ${e.message.split('\n')[0]}`);
    }
  }
  console.log(`  Recipients: ${insertedRecip} inserted, ${failedRecip} failed\n`);

  // Step 6: Summary
  console.log('=== MIGRATION COMPLETE ===');
  const [[custCount]] = await seq.query('SELECT COUNT(*) as count FROM customers');
  const [[recipCount]] = await seq.query('SELECT COUNT(*) as count FROM recipients');
  console.log(`  Total customers in DB:   ${custCount.count}`);
  console.log(`  Total recipients in DB:  ${recipCount.count}`);

  // Verify sample
  const [sample] = await seq.query(
    `SELECT c.id, c.full_name, c.phone, c.email,
            (SELECT COUNT(*) FROM recipients r WHERE r.customer_id = c.id) as recipient_count
     FROM customers c ORDER BY c.created_at DESC LIMIT 5`
  );
  console.log('\nRecent customers:');
  for (const c of sample) {
    console.log(`  ${c.full_name.padEnd(30)} | ${c.phone.padEnd(15)} | ${c.email.padEnd(25)} | ${c.recipient_count} recipients`);
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
