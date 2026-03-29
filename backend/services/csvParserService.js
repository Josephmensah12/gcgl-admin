/**
 * Parse CSV bank/credit card statement exports
 * Supports: Bank of America, Capital One, and generic CSV formats
 */

function parseCSV(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  // Detect delimiter
  const headerLine = lines[0];
  const delimiter = headerLine.includes('\t') ? '\t' : ',';

  // Parse header
  const headers = parseLine(headerLine, delimiter).map((h) => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i], delimiter);
    if (values.length < 2) continue; // Skip empty lines

    const row = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim(); });
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

    switch (format) {
      case 'boa':
        // Bank of America: Date, Description, Amount, Running Bal
        date = row.date || row.date_ || '';
        description = row.description || row.description_ || '';
        amount = parseAmount(row.amount || row.amount_ || '0');
        break;

      case 'capital_one':
        // Capital One: Transaction Date, Posted Date, Card No., Description, Category, Debit, Credit
        date = row.transaction_date || row.posted_date || row.date || '';
        description = row.description || row.payee || '';
        const debit = parseAmount(row.debit || '0');
        const credit = parseAmount(row.credit || '0');
        amount = debit > 0 ? debit : -credit; // Debits are expenses
        break;

      default:
        // Generic: try common field names
        date = row.date || row.transaction_date || row.posted_date || row.trans_date || '';
        description = row.description || row.memo || row.payee || row.merchant || row.name || '';
        amount = parseAmount(row.amount || row.debit || row.charge || '0');
        if (!amount && row.credit) amount = -parseAmount(row.credit);
        break;
    }

    // Parse date
    const parsedDate = parseDate(date);
    if (!parsedDate || !description) return null;

    return {
      date: parsedDate,
      description: description.trim(),
      amount: Math.abs(amount),
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
