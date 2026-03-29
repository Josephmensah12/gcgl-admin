// Keyword patterns for auto-categorization
const KEYWORD_PATTERNS = [
  { pattern: /GHANA|CUSTOMS|CCVR|IDF|GPHA/i, category: 'Ghana Customs - Other' },
  { pattern: /PORT|TERMINAL|CONTAINER|MANIFEST/i, category: 'Port Fees - Terminal' },
  { pattern: /BILL OF LADING|DOCUMENTATION/i, category: 'Port Fees - Documentation' },
  { pattern: /SHELL|EXXON|CHEVRON|MOBIL|GAS|FUEL/i, category: 'Operations - Fuel' },
  { pattern: /PAYROLL|DRIVER PAY/i, category: 'Operations - Driver Pay' },
  { pattern: /PRINTER|LABEL|SUPPLIES/i, category: 'Operations - Supplies' },
  { pattern: /WAREHOUSE|STORAGE/i, category: 'Operations - Warehouse' },
  { pattern: /RENT|UTILITIES|PHONE|INTERNET|ELECTRIC/i, category: 'Office & Admin' },
  { pattern: /INSURANCE|REGISTRATION|REPAIR|MECHANIC/i, category: 'Equipment' },
  { pattern: /AIRLINE|HOTEL|UBER|LYFT|TAXI|FLIGHT/i, category: 'Other' },
  { pattern: /RESTAURANT|MEALS|FOOD/i, category: 'Other' },
  { pattern: /WEBSITE|MARKETING|ADVERTISING|GOOGLE|META/i, category: 'Office & Admin' },
  { pattern: /FREIGHT|SHIPPING|MAERSK|EVERGREEN|MSC/i, category: 'Shipping - Freight' },
  { pattern: /DHL|FEDEX|UPS|USPS/i, category: 'Shipping - Freight' },
];

function categorizeTransaction(description, amount) {
  const text = (description || '').toUpperCase();

  // Keyword matching
  for (const { pattern, category } of KEYWORD_PATTERNS) {
    if (pattern.test(text)) {
      return {
        category,
        confidence: 'keyword_match',
        reasoning: `Matched pattern: ${pattern.source}`,
      };
    }
  }

  // Amount-based patterns
  const absAmount = Math.abs(amount);
  if (absAmount >= 400 && absAmount <= 600) {
    return {
      category: 'Ghana Customs - Other',
      confidence: 'amount_pattern',
      reasoning: 'Amount typical for customs fees ($400-$600)',
    };
  }

  if (absAmount >= 2000 && absAmount <= 5000) {
    return {
      category: 'Shipping - Freight',
      confidence: 'amount_pattern',
      reasoning: 'Amount typical for freight charges ($2k-$5k)',
    };
  }

  return {
    category: 'Uncategorized',
    confidence: 'no_match',
    reasoning: 'No patterns matched - manual review required',
  };
}

module.exports = { categorizeTransaction, KEYWORD_PATTERNS };
