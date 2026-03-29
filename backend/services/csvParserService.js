/**
 * Parse CSV bank/credit card statement exports
 * Supports: Bank of America, Capital One, and generic CSV formats
 */

function parseCSV(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  // Find the actual data header row (skip summary sections)
  // Look for a line that contains "Date" and "Description" and "Amount"
  let headerIndex = 0;
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const line = lines[i].toLowerCase();
    if ((line.includes('date') && line.includes('description') && line.includes('amount')) ||
        (line.includes('date') && line.includes('description') && line.includes('running')) ||
        (line.includes('transaction date') && line.includes('debit'))) {
      headerIndex = i;
      break;
    }
  }

  const headerLine = lines[headerIndex];

  // Detect delimiter: tab, comma, or multi-space
  let delimiter = ',';
  if (headerLine.includes('\t')) delimiter = '\t';

  // Parse header
  const headers = parseLine(headerLine, delimiter)
    .map((h) => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'))
    .filter((h) => h.length > 0);

  if (headers.length < 2) return [];

  const rows = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines
    if (line.toLowerCase().includes('beginning balance')) continue; // Skip BoA balance rows
    if (line.toLowerCase().includes('ending balance')) continue;

    const values = parseLine(line, delimiter);
    if (values.length < 2) continue;

    const row = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim(); });

    // Skip rows without a valid date in the first column
    const firstVal = row[headers[0]] || '';
    if (!firstVal.match(/\d{1,4}[\/\-\.]\d{1,2}/)) continue;

    rows.push(row);
  }

  return rows;
}

function parseLine(line, delimiter) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/**
 * Normalize parsed rows into standard transaction format
 * Auto-detects Bank of America vs Capital One vs generic
 */
function normalizeTransactions(rows, accountLabel) {
  if (rows.length === 0) return [];

  const headers = Object.keys(rows[0]);

  // Detect format
  const format = detectFormat(headers);

  return rows.map((row, idx) => {
    let date, description, amount;

    // Find values by checking all keys for partial matches
    const findVal = (...keywords) => {
      for (const key of Object.keys(row)) {
        for (const kw of keywords) {
          if (key.includes(kw) && row[key]) return row[key];
        }
      }
      return '';
    };

    date = findVal('date', 'trans');
    description = findVal('description', 'memo', 'payee', 'merchant', 'name');

    switch (format) {
      case 'boa':
        amount = parseAmount(findVal('amount') || '0');
        break;

      case 'capital_one': {
        const debit = parseAmount(findVal('debit') || '0');
        const credit = parseAmount(findVal('credit') || '0');
        amount = debit > 0 ? debit : -credit;
        break;
      }

      default:
        amount = parseAmount(findVal('amount', 'debit', 'charge') || '0');
        if (!amount) amount = -parseAmount(findVal('credit') || '0');
        break;
    }

    // Parse date
    const parsedDate = parseDate(date);
    if (!parsedDate || !description) return null;

    return {
      date: parsedDate,
      description: description.trim(),
      amount: Math.abs(amount),
      isCredit: amount > 0, // BoA: positive = credit/deposit, negative = debit/expense
      accountLabel: accountLabel || (format === 'capital_one' ? 'Capital One Credit Card' : 'Bank of America'),
      rawRow: row,
    };
  }).filter(Boolean);
}

function detectFormat(headers) {
  const h = headers.join(' ').toLowerCase();

  if (h.includes('running_bal') || (h.includes('date') && h.includes('description') && h.includes('amount') && !h.includes('debit'))) {
    return 'boa';
  }

  if (h.includes('debit') && h.includes('credit') && (h.includes('card_no') || h.includes('posted_date'))) {
    return 'capital_one';
  }

  return 'generic';
}

function parseAmount(str) {
  if (!str) return 0;
  const cleaned = str.replace(/[$,\s]/g, '').replace(/[()]/g, '-');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseDate(str) {
  if (!str) return null;
  // Try common formats
  const d = new Date(str);
  if (!isNaN(d.getTime()) && d.getFullYear() > 2000) {
    return d.toISOString().split('T')[0];
  }

  // Try MM/DD/YYYY
  const parts = str.split(/[/\-\.]/);
  if (parts.length === 3) {
    let [a, b, c] = parts.map(Number);
    if (c < 100) c += 2000;
    if (a > 12) {
      // DD/MM/YYYY
      const d2 = new Date(c, b - 1, a);
      if (!isNaN(d2.getTime())) return d2.toISOString().split('T')[0];
    } else {
      // MM/DD/YYYY
      const d2 = new Date(c, a - 1, b);
      if (!isNaN(d2.getTime())) return d2.toISOString().split('T')[0];
    }
  }

  return null;
}

module.exports = { parseCSV, normalizeTransactions };
