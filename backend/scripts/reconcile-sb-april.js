/**
 * Reconcile SalesBinder vs GCGL Admin DB invoice numbers for a given month.
 *
 * Usage:
 *   node scripts/reconcile-sb-april.js                # defaults to 2026-04
 *   node scripts/reconcile-sb-april.js 2025-04        # any YYYY-MM
 *
 * Read-only — does not modify either system.
 */

const https = require('https');
const { Sequelize } = require('sequelize');

// ---------- Config ----------
const API_HOST = 'gcgl.salesbinder.com';
const API_KEY = '1iKEo36mgvupBdceenaS5Q3wchdzXxOEYHUINRoJ';
const AUTH = Buffer.from(`${API_KEY}:x`).toString('base64');
const RATE_DELAY = 1600;

const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://postgres:mWTtqDSnqgCaksaawcrBNfxCUPaSAYsg@centerbeam.proxy.rlwy.net:38751/railway';

const targetMonth = process.argv[2] || '2026-04';
const [yearStr, monthStr] = targetMonth.split('-');
const year = parseInt(yearStr);
const month = parseInt(monthStr);
if (!year || !month || month < 1 || month > 12) {
  console.error(`Invalid month "${targetMonth}" — expected YYYY-MM`);
  process.exit(1);
}
const monthStart = new Date(Date.UTC(year, month - 1, 1));
const monthEnd = new Date(Date.UTC(year, month, 1));

const seq = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

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

function inMonth(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= monthStart && d < monthEnd;
}

async function run() {
  console.log(`=== RECONCILE SalesBinder vs GCGL Admin — ${targetMonth} ===\n`);

  console.log('Step 1: Fetching all invoices from SalesBinder...');
  const allDocs = await fetchAllInvoices();
  const sbMonth = allDocs.filter(d => inMonth(d.issue_date));
  console.log(`\n  Total SB invoices: ${allDocs.length}, in ${targetMonth} (issue_date): ${sbMonth.length}\n`);

  console.log('Step 2: Querying GCGL Admin DB for invoices in month...');
  const [dbRows] = await seq.query(`
    SELECT invoice_number, final_total, amount_paid, payment_status,
           customer_name, created_at
    FROM invoices
    WHERE created_at >= :start AND created_at < :end
    ORDER BY invoice_number ASC
  `, { replacements: { start: monthStart.toISOString(), end: monthEnd.toISOString() } });
  console.log(`  DB invoices in ${targetMonth} (created_at): ${dbRows.length}\n`);

  // Build maps keyed by invoice_number
  const sbMap = new Map();
  for (const sb of sbMonth) {
    sbMap.set(Number(sb.document_number), {
      number: Number(sb.document_number),
      total: parseFloat(sb.total_price) || 0,
      paid: parseFloat(sb.total_transactions) || 0,
      issue_date: (sb.issue_date || '').split('T')[0],
      customer: sb.cache__customer_name || '',
      status: sb.status?.name || '',
    });
  }
  const dbMap = new Map();
  for (const r of dbRows) {
    dbMap.set(Number(r.invoice_number), {
      number: Number(r.invoice_number),
      total: parseFloat(r.final_total) || 0,
      paid: parseFloat(r.amount_paid) || 0,
      created: r.created_at?.toISOString?.().split('T')[0] || String(r.created_at).split('T')[0],
      customer: r.customer_name || '',
      status: r.payment_status || '',
    });
  }

  const sbNums = new Set(sbMap.keys());
  const dbNums = new Set(dbMap.keys());

  const onlyInSb = [...sbNums].filter(n => !dbNums.has(n)).sort((a, b) => a - b);
  const onlyInDb = [...dbNums].filter(n => !sbNums.has(n)).sort((a, b) => a - b);
  const inBoth = [...sbNums].filter(n => dbNums.has(n)).sort((a, b) => a - b);

  console.log('─'.repeat(100));
  console.log(`SUMMARY for ${targetMonth}`);
  console.log('─'.repeat(100));
  console.log(`  SalesBinder: ${sbNums.size} invoices`);
  console.log(`  GCGL Admin:  ${dbNums.size} invoices`);
  console.log(`  In both:     ${inBoth.length}`);
  console.log(`  Only in SB:  ${onlyInSb.length}`);
  console.log(`  Only in DB:  ${onlyInDb.length}`);

  if (sbNums.size > 0) {
    const sbMin = Math.min(...sbNums);
    const sbMax = Math.max(...sbNums);
    console.log(`  SB range: #${sbMin} – #${sbMax}`);
  }
  if (dbNums.size > 0) {
    const dbMin = Math.min(...dbNums);
    const dbMax = Math.max(...dbNums);
    console.log(`  DB range: #${dbMin} – #${dbMax}`);
  }

  if (onlyInSb.length > 0) {
    console.log('\n=== Invoices in SalesBinder but NOT in GCGL Admin DB ===');
    for (const n of onlyInSb) {
      const s = sbMap.get(n);
      console.log(`  #${String(n).padEnd(5)} | ${s.issue_date} | $${s.total.toFixed(2).padStart(9)} | paid $${s.paid.toFixed(2).padStart(9)} | ${s.status.padEnd(15)} | ${s.customer}`);
    }
  }

  if (onlyInDb.length > 0) {
    console.log('\n=== Invoices in GCGL Admin DB but NOT in SalesBinder ===');
    for (const n of onlyInDb) {
      const d = dbMap.get(n);
      console.log(`  #${String(n).padEnd(5)} | ${d.created} | $${d.total.toFixed(2).padStart(9)} | paid $${d.paid.toFixed(2).padStart(9)} | ${d.status.padEnd(15)} | ${d.customer}`);
    }
  }

  // Check for total mismatches on shared numbers
  const mismatches = [];
  for (const n of inBoth) {
    const s = sbMap.get(n);
    const d = dbMap.get(n);
    const totalDiff = Math.abs(s.total - d.total);
    const paidDiff = Math.abs(s.paid - d.paid);
    if (totalDiff > 0.01 || paidDiff > 0.01) {
      mismatches.push({ n, s, d, totalDiff, paidDiff });
    }
  }
  if (mismatches.length > 0) {
    console.log(`\n=== Amount mismatches on shared invoice numbers (${mismatches.length}) ===`);
    for (const m of mismatches) {
      console.log(`  #${m.n}`);
      console.log(`    SB: total $${m.s.total.toFixed(2)} paid $${m.s.paid.toFixed(2)} | ${m.s.customer}`);
      console.log(`    DB: total $${m.d.total.toFixed(2)} paid $${m.d.paid.toFixed(2)} | ${m.d.customer}`);
    }
  }

  // Gap detection in DB invoice number sequence (within month)
  if (dbNums.size > 1) {
    const sortedDb = [...dbNums].sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < sortedDb.length; i++) {
      if (sortedDb[i] - sortedDb[i - 1] > 1) {
        gaps.push([sortedDb[i - 1] + 1, sortedDb[i] - 1]);
      }
    }
    if (gaps.length > 0) {
      console.log(`\n=== Gaps in DB invoice number sequence within ${targetMonth} ===`);
      for (const [from, to] of gaps) {
        const range = from === to ? `#${from}` : `#${from} – #${to}`;
        console.log(`  ${range}`);
      }
    }
  }

  console.log('\n=== Done ===');
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
