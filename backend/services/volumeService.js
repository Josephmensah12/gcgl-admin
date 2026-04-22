const Anthropic = require('@anthropic-ai/sdk');
const { Op } = require('sequelize');
const db = require('../models');

/**
 * Volume analysis service for shipments.
 *
 * Resolves dimensions for every line item using a 4-step chain:
 *   1. Line item's own dimensions_l/w/h
 *   2. Regex extraction from description text (e.g. "18x18x24")
 *   3. Catalog item default dimensions
 *   4. Claude API batch estimate (cached in catalog or a lookup table)
 *
 * Env: ANTHROPIC_API_KEY (for step 4)
 */

const CUBIC_RATE = 0.0105; // $/cu.in.

const CONTAINER_SPECS = {
  '20ft':  { label: "20' Standard", cuFt: 1172, cuIn: 2025216 },
  '40ft':  { label: "40' Standard", cuFt: 2390, cuIn: 4130880 },
  '40hc':  { label: "40' High Cube", cuFt: 2694, cuIn: 4655232 },
};

/**
 * Try to extract LxWxH from a text string.
 * Matches patterns like "18x18x24", "40×23×17", "24.5x24.5x27.5", "68×14×7""
 */
function parseDimsFromText(text) {
  if (!text) return null;
  const m = text.match(/(\d+(?:\.\d+)?)\s*[x×X]\s*(\d+(?:\.\d+)?)\s*[x×X]\s*(\d+(?:\.\d+)?)/);
  if (m) {
    const l = parseFloat(m[1]);
    const w = parseFloat(m[2]);
    const h = parseFloat(m[3]);
    if (l > 0 && w > 0 && h > 0) return { l, w, h };
  }
  return null;
}

/**
 * Batch-estimate dimensions for a list of item descriptions using Claude.
 *
 * @param {Array<{key: string, description: string}>} items
 * @returns {Object} key → { l, w, h } or null
 */
async function estimateWithLLM(items) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || items.length === 0) return {};

  const client = new Anthropic();

  const itemList = items.map((it, i) => `${i + 1}. ${it.description}`).join('\n');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `You are a shipping logistics expert. For each item below, estimate the typical SHIPPING BOX dimensions (Length × Width × Height) in inches. These are the outer carton/box dimensions, not the product itself.

Items:
${itemList}

Return ONLY a JSON array with one object per item, in order:
[{"l": 30, "w": 20, "h": 16}, ...]

If you truly cannot estimate (e.g. "Adjustment", "Misc fee"), return null for that item.
Return ONLY the JSON array, no explanation.`,
    }],
  });

  try {
    const text = response.content[0].text.trim();
    // Extract JSON array from response (handle potential markdown wrapping)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return {};

    const estimates = JSON.parse(jsonMatch[0]);
    const result = {};
    items.forEach((it, i) => {
      const est = estimates[i];
      if (est && est.l > 0 && est.w > 0 && est.h > 0) {
        result[it.key] = { l: est.l, w: est.w, h: est.h };
      }
    });
    return result;
  } catch (e) {
    console.error('LLM dimension parse error:', e.message);
    return {};
  }
}

/**
 * Analyze volume for a shipment.
 *
 * @param {string} shipmentId
 * @param {object} options - { useLLM: true, containerType: '40hc' }
 * @returns {object} analysis result
 */
async function analyzeVolume(shipmentId, options = {}) {
  const { useLLM = true, containerType = '40hc', packingEfficiency = 0.75 } = options;

  const shipment = await db.Shipment.findByPk(shipmentId);
  if (!shipment) throw new Error('Shipment not found');

  // Load invoices with line items
  const invoices = await db.Invoice.findAll({
    where: { shipmentId, status: { [Op.ne]: 'cancelled' } },
    include: [{
      model: db.LineItem,
      as: 'lineItems',
      attributes: ['id', 'catalogName', 'description', 'type', 'quantity',
        'dimensionsL', 'dimensionsW', 'dimensionsH', 'basePrice'],
    }],
    attributes: ['id', 'invoiceNumber', 'customerName'],
  });

  // Load catalog items with dimensions (for step 3)
  const catalogItems = await db.CatalogItem.findAll({
    where: { active: true },
    attributes: ['id', 'name', 'dimensionsL', 'dimensionsW', 'dimensionsH'],
  });
  const catalogByName = {};
  for (const ci of catalogItems) {
    catalogByName[ci.name.toLowerCase().trim()] = {
      l: parseFloat(ci.dimensionsL) || 0,
      w: parseFloat(ci.dimensionsW) || 0,
      h: parseFloat(ci.dimensionsH) || 0,
    };
  }

  // Load cached LLM estimates
  const cachedEstimates = await loadCachedEstimates();

  // Process each line item
  const items = [];
  const needsLLM = [];

  for (const inv of invoices) {
    for (const li of inv.lineItems) {
      if (li.type === 'service') continue; // skip service items (packing, handling)

      const qty = parseInt(li.quantity) || 1;
      const itemName = li.catalogName || li.description || 'Unknown';
      const item = {
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customerName,
        name: itemName,
        quantity: qty,
        dims: null,
        source: 'unmeasured',
        volumeCuIn: 0,
      };

      // Step 1: Line item's own dimensions
      const L = parseFloat(li.dimensionsL) || 0;
      const W = parseFloat(li.dimensionsW) || 0;
      const H = parseFloat(li.dimensionsH) || 0;
      if (L > 0 && W > 0 && H > 0) {
        item.dims = { l: L, w: W, h: H };
        item.source = 'measured';
        item.volumeCuIn = L * W * H * qty;
        items.push(item);
        continue;
      }

      // Step 2: Regex from description or catalog name
      const parsed = parseDimsFromText(li.description) || parseDimsFromText(li.catalogName);
      if (parsed) {
        item.dims = parsed;
        item.source = 'parsed';
        item.volumeCuIn = parsed.l * parsed.w * parsed.h * qty;
        items.push(item);
        continue;
      }

      // Step 3: Catalog item defaults
      const catKey = (li.catalogName || '').toLowerCase().trim();
      const catDims = catalogByName[catKey];
      if (catDims && catDims.l > 0 && catDims.w > 0 && catDims.h > 0) {
        item.dims = catDims;
        item.source = 'catalog';
        item.volumeCuIn = catDims.l * catDims.w * catDims.h * qty;
        items.push(item);
        continue;
      }

      // Step 3.5: Check cached LLM estimates
      const cacheKey = itemName.toLowerCase().trim();
      if (cachedEstimates[cacheKey]) {
        const cached = cachedEstimates[cacheKey];
        item.dims = cached;
        item.source = 'llm-cached';
        item.volumeCuIn = cached.l * cached.w * cached.h * qty;
        items.push(item);
        continue;
      }

      // Step 4: Queue for LLM estimation
      item._llmKey = cacheKey;
      items.push(item);
      // Deduplicate LLM requests by description
      if (!needsLLM.find(n => n.key === cacheKey)) {
        needsLLM.push({ key: cacheKey, description: itemName });
      }
    }
  }

  // Step 4: Batch LLM estimation
  if (useLLM && needsLLM.length > 0) {
    try {
      const estimates = await estimateWithLLM(needsLLM);

      // Cache the results
      await saveCachedEstimates(estimates);

      // Apply to items
      for (const item of items) {
        if (item.source === 'unmeasured' && item._llmKey && estimates[item._llmKey]) {
          const est = estimates[item._llmKey];
          item.dims = est;
          item.source = 'llm';
          item.volumeCuIn = est.l * est.w * est.h * item.quantity;
        }
      }
    } catch (e) {
      console.error('LLM volume estimation error:', e.message);
    }
  }

  // Clean up internal keys
  items.forEach(it => delete it._llmKey);

  // Aggregate
  const measured = items.filter(i => i.source === 'measured');
  const parsed = items.filter(i => i.source === 'parsed');
  const catalog = items.filter(i => i.source === 'catalog');
  const llmItems = items.filter(i => i.source === 'llm' || i.source === 'llm-cached');
  const unmeasured = items.filter(i => i.source === 'unmeasured');

  const totalMeasuredCuIn = measured.reduce((s, i) => s + i.volumeCuIn, 0);
  const totalParsedCuIn = parsed.reduce((s, i) => s + i.volumeCuIn, 0);
  const totalCatalogCuIn = catalog.reduce((s, i) => s + i.volumeCuIn, 0);
  const totalLLMCuIn = llmItems.reduce((s, i) => s + i.volumeCuIn, 0);
  const totalKnownCuIn = totalMeasuredCuIn + totalParsedCuIn + totalCatalogCuIn + totalLLMCuIn;

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const measuredQty = measured.reduce((s, i) => s + i.quantity, 0);
  const estimatedQty = (parsed.reduce((s, i) => s + i.quantity, 0)
    + catalog.reduce((s, i) => s + i.quantity, 0)
    + llmItems.reduce((s, i) => s + i.quantity, 0));
  const unmeasuredQty = unmeasured.reduce((s, i) => s + i.quantity, 0);

  const container = CONTAINER_SPECS[containerType] || CONTAINER_SPECS['40hc'];
  const rawCuFt = totalKnownCuIn / 1728;

  // Apply packing efficiency — dead space from irregular items, gaps, stacking inefficiency
  const effPct = Math.max(0.5, Math.min(1, packingEfficiency));
  const usableCuFt = Math.round(container.cuFt * effPct * 10) / 10;
  const usedCuFt = rawCuFt;
  const containerCuFt = container.cuFt;
  const remainingCuFt = Math.max(0, Math.round((usableCuFt - usedCuFt) * 10) / 10);
  const remainingCuIn = remainingCuFt * 1728;
  const usedPct = Math.min(100, Math.round((usedCuFt / usableCuFt) * 1000) / 10);
  const remainingRevenue = Math.round(remainingCuIn * CUBIC_RATE * 100) / 100;

  return {
    shipmentName: shipment.name,
    shipmentStatus: shipment.status,
    containerType,
    containerLabel: container.label,
    containerCuFt,
    usableCuFt,
    packingEfficiency: effPct,
    summary: {
      totalItems: items.length,
      totalQty,
      measuredQty,
      estimatedQty,
      unmeasuredQty,
      totalCuIn: Math.round(totalKnownCuIn),
      totalCuFt: Math.round(usedCuFt * 10) / 10,
      usedPct,
      remainingCuFt: Math.round(remainingCuFt * 10) / 10,
      remainingRevenue,
    },
    breakdown: {
      measured:  { qty: measuredQty,  cuIn: Math.round(totalMeasuredCuIn), cuFt: Math.round(totalMeasuredCuIn / 1728 * 10) / 10 },
      parsed:   { qty: parsed.reduce((s, i) => s + i.quantity, 0), cuIn: Math.round(totalParsedCuIn), cuFt: Math.round(totalParsedCuIn / 1728 * 10) / 10 },
      catalog:  { qty: catalog.reduce((s, i) => s + i.quantity, 0), cuIn: Math.round(totalCatalogCuIn), cuFt: Math.round(totalCatalogCuIn / 1728 * 10) / 10 },
      llm:      { qty: llmItems.reduce((s, i) => s + i.quantity, 0), cuIn: Math.round(totalLLMCuIn), cuFt: Math.round(totalLLMCuIn / 1728 * 10) / 10 },
      unmeasured: { qty: unmeasuredQty, items: unmeasured.map(i => ({ name: i.name, qty: i.quantity, invoice: i.invoiceNumber })) },
    },
    items,
  };
}

/**
 * Load cached LLM dimension estimates from the database.
 * Stored in the settings table under key 'dimension_estimates'.
 */
async function loadCachedEstimates() {
  try {
    const setting = await db.Setting.findOne({ where: { id: 1 } });
    return setting?.data?.dimensionEstimates || {};
  } catch {
    return {};
  }
}

/**
 * Save LLM dimension estimates to the cache.
 */
async function saveCachedEstimates(newEstimates) {
  if (!newEstimates || Object.keys(newEstimates).length === 0) return;
  try {
    const setting = await db.Setting.findOne({ where: { id: 1 } });
    if (!setting) return;
    const existing = setting.data?.dimensionEstimates || {};
    const merged = { ...existing, ...newEstimates };
    await setting.update({
      data: { ...setting.data, dimensionEstimates: merged },
    });
  } catch (e) {
    console.error('Failed to cache dimension estimates:', e.message);
  }
}

module.exports = {
  analyzeVolume,
  parseDimsFromText,
  CONTAINER_SPECS,
  CUBIC_RATE,
};
