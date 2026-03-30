const { Op } = require('sequelize');
const db = require('../models');

/**
 * Learn from previously approved transactions.
 * Builds patterns from merchant_name -> category mappings.
 * Returns the best match for a new transaction description.
 */
async function suggestFromHistory(description, amount) {
  if (!description) return null;

  const descUpper = description.toUpperCase().trim();

  // Get all approved transactions with their categories
  const approved = await db.ImportedTransaction.findAll({
    where: {
      status: 'approved',
      is_business_expense: true,
      gcgl_category: { [Op.ne]: null },
      merchant_name: { [Op.ne]: null },
    },
    attributes: ['merchant_name', 'gcgl_category', 'is_fixed_cost', 'shipment_id'],
    raw: true,
  });

  if (approved.length === 0) return null;

  // Build merchant -> category mapping with confidence
  const patterns = {};
  for (const tx of approved) {
    const merchant = (tx.merchant_name || '').toUpperCase().trim();
    if (!merchant) continue;

    if (!patterns[merchant]) {
      patterns[merchant] = {};
    }
    const cat = tx.gcgl_category;
    if (!patterns[merchant][cat]) {
      patterns[merchant][cat] = { count: 0, isFixed: tx.is_fixed_cost };
    }
    patterns[merchant][cat].count++;
  }

  // Try exact merchant match first
  if (patterns[descUpper]) {
    return pickBestCategory(patterns[descUpper], 'exact_merchant');
  }

  // Try partial match — check if description contains a known merchant
  let bestMatch = null;
  let bestMatchLen = 0;

  for (const merchant of Object.keys(patterns)) {
    // Check if the new description contains a known merchant name
    if (descUpper.includes(merchant) && merchant.length > bestMatchLen) {
      bestMatch = { merchant, categories: patterns[merchant] };
      bestMatchLen = merchant.length;
    }
    // Check if a known merchant name contains the new description
    if (merchant.includes(descUpper) && descUpper.length > 3 && descUpper.length > bestMatchLen) {
      bestMatch = { merchant, categories: patterns[merchant] };
      bestMatchLen = descUpper.length;
    }
  }

  if (bestMatch) {
    return pickBestCategory(bestMatch.categories, 'partial_match');
  }

  // Try word-level matching (at least 2 significant words match)
  const descWords = descUpper.split(/\s+/).filter((w) => w.length > 3);
  let bestWordMatch = null;
  let bestWordCount = 0;

  for (const merchant of Object.keys(patterns)) {
    const merchantWords = merchant.split(/\s+/).filter((w) => w.length > 3);
    const matchingWords = descWords.filter((w) => merchantWords.some((mw) => mw.includes(w) || w.includes(mw)));

    if (matchingWords.length >= 2 && matchingWords.length > bestWordCount) {
      bestWordMatch = { merchant, categories: patterns[merchant] };
      bestWordCount = matchingWords.length;
    }
  }

  if (bestWordMatch) {
    return pickBestCategory(bestWordMatch.categories, 'word_match');
  }

  return null;
}

function pickBestCategory(categoryMap, matchType) {
  // Pick the category with the most occurrences
  let bestCat = null;
  let bestCount = 0;
  let isFixed = false;

  for (const [cat, data] of Object.entries(categoryMap)) {
    if (data.count > bestCount) {
      bestCat = cat;
      bestCount = data.count;
      isFixed = data.isFixed;
    }
  }

  if (!bestCat) return null;

  const total = Object.values(categoryMap).reduce((s, d) => s + d.count, 0);
  const accuracy = Math.round((bestCount / total) * 100);

  return {
    category: bestCat,
    confidence: matchType,
    reasoning: `Matched from ${bestCount} previous transaction(s) (${accuracy}% accuracy)`,
    isFixed,
    accuracy,
  };
}

module.exports = { suggestFromHistory };
