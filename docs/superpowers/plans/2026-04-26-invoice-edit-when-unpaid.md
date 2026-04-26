# Invoice Edit When Not Fully Paid — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow line-item edits, additions, removals, and discount changes on any invoice that is not fully paid. Add backend lock enforcement, broaden the add-item endpoint to full creation parity, introduce an `'overpaid'` payment status, and unify all line-item drafts under the existing sticky-banner save flow.

**Architecture:** A new `assertEditable(invoice)` helper guards every line-item / discount endpoint. A new `recalculatePaymentStatus(invoice)` helper introduces the `'overpaid'` state and is wired into both `Invoice.recalculateTotals` and `transactionController.recalculateInvoiceTotals`. The `LineItemPicker` component is extracted from `CreateInvoice.jsx` and reused in `PickupDetail.jsx`. Line-item adds, edits, deletes, and discount changes all stage to drafts; the existing `saveDrafts()` commits them sequentially.

**Tech Stack:** Node 20 + Express 4 + Sequelize 6 + PostgreSQL (backend); React 19 + Vite + React Router 7 + Tailwind (frontend).

**Spec:** `docs/superpowers/specs/2026-04-26-invoice-edit-when-unpaid-design.md`

**Testing approach:** GCGL admin has no automated test framework — matching existing conventions. Each task includes a manual verification step using `curl` against a local backend (port 4100) or browser interaction against the dev frontend. The engineer must confirm each verification before committing. **Never claim a UI task is complete without exercising it in the browser.**

**Pre-flight:**
- Local dev DB has at least three invoices in known payment states: one `unpaid`, one `partial`, one `paid`. If not, create them via `/create-invoice` and the payment modal before starting.
- Backend dev server: `cd backend && npm run dev` (port 4100).
- Frontend dev server: `cd frontend && npm run dev` (port 5173).
- For curl: get a JWT first with `curl -X POST http://localhost:4100/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"...","password":"..."}'` and export `TOKEN=<jwt>`.

---

## File Structure

**New files:**
- `backend/utils/invoiceLock.js` — `assertEditable(invoice)`
- `backend/utils/invoicePaymentStatus.js` — `computePaymentStatus(paid, total)` and `recalculatePaymentStatus(invoice)`
- `backend/scripts/backfill-overpaid-status.js` — one-off backfill
- `frontend/src/components/LineItemPicker.jsx` — extracted catalog/custom/manual item picker

**Modified files:**
- `backend/controllers/pickupController.js` — lock guards on every edit endpoint, broadened `addLineItem`, new `updateLineItem`, EMPTY_INVOICE check on delete, `lastEditedAt` bumps
- `backend/controllers/transactionController.js` — use shared `computePaymentStatus`
- `backend/models/Invoice.js` — `recalculateTotals` calls `recalculatePaymentStatus`
- `backend/routes/pickupRoutes.js` — new `PATCH /:id/items/:itemId` route
- `frontend/src/pages/CreateInvoice.jsx` — refactored to use `LineItemPicker`
- `frontend/src/pages/PickupDetail.jsx` — new draft state, lock condition, overpaid badge, overpayment confirm, integrated `LineItemPicker`, inline edit on `LineItemRow`

---

## Task 1: Lock helper

**Files:**
- Create: `backend/utils/invoiceLock.js`

- [ ] **Step 1: Create the helper**

Create `backend/utils/invoiceLock.js`:

```js
const { AppError } = require('../middleware/errorHandler');

const EPSILON = 0.01;

/**
 * Throw if the invoice cannot be edited. Mirrors the frontend lock condition.
 *
 * Rules:
 *   - cancelled invoices are never editable
 *   - fully-paid invoices (paid ≈ finalTotal) are not editable
 *   - overpaid invoices (paid > finalTotal) ARE editable, so a refund can
 *     bring them back into a clean state
 */
function assertEditable(invoice) {
  if (invoice.status === 'cancelled') {
    throw new AppError('Cancelled invoices cannot be edited', 400, 'INVOICE_CANCELLED');
  }
  const total = parseFloat(invoice.finalTotal) || 0;
  const paid = parseFloat(invoice.amountPaid) || 0;
  if (paid >= total - EPSILON && paid <= total + EPSILON) {
    throw new AppError(
      'Fully-paid invoices cannot be edited. Issue a refund to unlock.',
      403,
      'INVOICE_LOCKED'
    );
  }
}

module.exports = { assertEditable, EPSILON };
```

- [ ] **Step 2: Manually verify by requiring it**

Run from `backend/`:
```bash
node -e "const {assertEditable} = require('./utils/invoiceLock'); \
  assertEditable({status:'completed', finalTotal:100, amountPaid:50}); \
  console.log('partial: editable OK'); \
  try{assertEditable({status:'completed', finalTotal:100, amountPaid:100})}catch(e){console.log('paid: locked OK ('+e.code+')')}; \
  try{assertEditable({status:'cancelled', finalTotal:100, amountPaid:0})}catch(e){console.log('cancelled: locked OK ('+e.code+')')}; \
  assertEditable({status:'completed', finalTotal:100, amountPaid:120}); \
  console.log('overpaid: editable OK');"
```

Expected output:
```
partial: editable OK
paid: locked OK (INVOICE_LOCKED)
cancelled: locked OK (INVOICE_CANCELLED)
overpaid: editable OK
```

- [ ] **Step 3: Commit**

```bash
git add backend/utils/invoiceLock.js
git commit -m "feat(backend): add assertEditable helper for invoice lock rule"
```

---

## Task 2: Payment status helper

**Files:**
- Create: `backend/utils/invoicePaymentStatus.js`

- [ ] **Step 1: Create the helper**

Create `backend/utils/invoicePaymentStatus.js`:

```js
const { EPSILON } = require('./invoiceLock');

/**
 * Pure function: determine paymentStatus from amounts.
 *
 *   unpaid    paid = 0
 *   partial   0 < paid < total - EPSILON
 *   paid      total - EPSILON <= paid <= total + EPSILON
 *   overpaid  paid > total + EPSILON
 */
function computePaymentStatus(paid, total) {
  const p = parseFloat(paid) || 0;
  const t = parseFloat(total) || 0;
  if (p <= EPSILON) return 'unpaid';
  if (p > t + EPSILON) return 'overpaid';
  if (p >= t - EPSILON) return 'paid';
  return 'partial';
}

/**
 * Update `invoice.paymentStatus` based on current amountPaid / finalTotal.
 * Caller is responsible for saving.
 */
function recalculatePaymentStatus(invoice) {
  invoice.paymentStatus = computePaymentStatus(invoice.amountPaid, invoice.finalTotal);
  return invoice;
}

module.exports = { computePaymentStatus, recalculatePaymentStatus };
```

- [ ] **Step 2: Manually verify**

Run from `backend/`:
```bash
node -e "const {computePaymentStatus} = require('./utils/invoicePaymentStatus'); \
  console.log('0/100:', computePaymentStatus(0, 100)); \
  console.log('50/100:', computePaymentStatus(50, 100)); \
  console.log('100/100:', computePaymentStatus(100, 100)); \
  console.log('99.995/100:', computePaymentStatus(99.995, 100)); \
  console.log('120/100:', computePaymentStatus(120, 100)); \
  console.log('0/0:', computePaymentStatus(0, 0));"
```

Expected:
```
0/100: unpaid
50/100: partial
100/100: paid
99.995/100: paid
120/100: overpaid
0/0: unpaid
```

(`0/0` returns `'unpaid'` because the `p <= EPSILON` early-return fires when `p === 0`. The EMPTY_INVOICE check in Task 7 ensures invoices never reach `total = 0` in normal operation anyway.)

- [ ] **Step 3: Commit**

```bash
git add backend/utils/invoicePaymentStatus.js
git commit -m "feat(backend): add computePaymentStatus with overpaid branch"
```

---

## Task 3: Wire payment status into Invoice model and transactionController

**Files:**
- Modify: `backend/models/Invoice.js` (the `recalculateTotals` method, lines 87-161)
- Modify: `backend/controllers/transactionController.js` (the `recalculateInvoiceTotals` function, lines 7-38)

- [ ] **Step 1: Update `Invoice.recalculateTotals`**

In `backend/models/Invoice.js`, find the line:
```js
this.subtotal = subtotal;
// totalDiscount captures the full discount the customer sees (line + invoice)
this.totalDiscount = round2(lineDiscountsTotal + invoiceDiscAmt);
this.finalTotal = finalTotal;

await this.save();
return this;
```

Change to:
```js
this.subtotal = subtotal;
// totalDiscount captures the full discount the customer sees (line + invoice)
this.totalDiscount = round2(lineDiscountsTotal + invoiceDiscAmt);
this.finalTotal = finalTotal;

// Re-derive paymentStatus from the new finalTotal vs current amountPaid.
// An edit that drops the total below paid will flip status to 'overpaid'.
const { recalculatePaymentStatus } = require('../utils/invoicePaymentStatus');
recalculatePaymentStatus(this);

await this.save();
return this;
```

- [ ] **Step 2: Update `transactionController.recalculateInvoiceTotals`**

In `backend/controllers/transactionController.js`, find:
```js
invoice.amountPaid = netPaid;

if (netPaid <= 0) {
  invoice.paymentStatus = 'unpaid';
} else if (netPaid >= totalAmount) {
  invoice.paymentStatus = 'paid';
} else {
  invoice.paymentStatus = 'partial';
}

await invoice.save(opts);
```

Change to:
```js
const { computePaymentStatus } = require('../utils/invoicePaymentStatus');

invoice.amountPaid = netPaid;
invoice.paymentStatus = computePaymentStatus(netPaid, totalAmount);

await invoice.save(opts);
```

- [ ] **Step 3: Manually verify in dev**

Restart the backend. Pick a partial-paid invoice in the dev DB. Force a recalculate by hitting the discount endpoint with the same value:

```bash
curl -X PATCH http://localhost:4100/api/v1/pickups/<INVOICE_ID>/discount \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"discount_type":"none","discount_value":0}'
```

Expected: response includes `"paymentStatus":"partial"` (unchanged for a partial invoice). No errors in the backend log.

Now temporarily simulate overpayment by reducing finalTotal directly in psql:
```sql
UPDATE invoices SET final_total = 1.00 WHERE id = '<PARTIAL_INVOICE_ID>';
```

Trigger recalculate via the same curl. Expected: `"paymentStatus":"overpaid"`.

Restore the original total:
```sql
UPDATE invoices SET final_total = <original> WHERE id = '<PARTIAL_INVOICE_ID>';
```

Trigger recalculate again, expect `"paymentStatus":"partial"` to come back.

- [ ] **Step 4: Commit**

```bash
git add backend/models/Invoice.js backend/controllers/transactionController.js
git commit -m "feat(backend): wire computePaymentStatus into Invoice and transaction recalcs"
```

---

## Task 4: Add lock guards to existing pickup endpoints

**Files:**
- Modify: `backend/controllers/pickupController.js` (lines 306-340 `addLineItem`, 384-400 `removeLineItem`, 407-435 `updateInvoiceDiscount`, 442-476 `updateLineItemDiscount`)

- [ ] **Step 1: Import the helper**

At the top of `backend/controllers/pickupController.js`, after the existing requires (around line 7), add:
```js
const { assertEditable } = require('../utils/invoiceLock');
```

- [ ] **Step 2: Guard `addLineItem`**

In `exports.addLineItem`, after the `if (!invoice) throw new AppError('Invoice not found', ...)` line, add:
```js
assertEditable(invoice);
```

- [ ] **Step 3: Guard `removeLineItem`**

Same pattern in `exports.removeLineItem`. After the `if (!invoice)` check, before the `db.LineItem.findOne` call, add:
```js
assertEditable(invoice);
```

- [ ] **Step 4: Guard `updateInvoiceDiscount`**

Same pattern in `exports.updateInvoiceDiscount`. After `if (!invoice)`:
```js
assertEditable(invoice);
```

- [ ] **Step 5: Guard `updateLineItemDiscount`**

Same pattern in `exports.updateLineItemDiscount`. After `if (!invoice)`:
```js
assertEditable(invoice);
```

- [ ] **Step 6: Manually verify lock fires on paid invoice**

Restart backend. Find a fully-paid invoice ID:
```bash
curl -s http://localhost:4100/api/v1/pickups -H "Authorization: Bearer $TOKEN" | \
  node -e "let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s); const p=r.data.pickups.find(p=>p.paymentStatus==='paid'); console.log(p?.id || 'NONE');})"
```

Save the ID as `$PAID_ID` and try to remove an item:
```bash
curl -X DELETE http://localhost:4100/api/v1/pickups/$PAID_ID/items/<ANY_ITEM_ID> \
  -H "Authorization: Bearer $TOKEN" -i
```

Expected: HTTP 403 with body containing `"code":"INVOICE_LOCKED"`.

Try the same with a partial invoice ID — expected 200 (or 404 for a fake item ID, but NOT 403).

- [ ] **Step 7: Commit**

```bash
git add backend/controllers/pickupController.js
git commit -m "feat(backend): guard line-item and discount endpoints with assertEditable"
```

---

## Task 5: Broaden POST /pickups/:id/items to accept catalog/custom/manual + photos

**Files:**
- Modify: `backend/controllers/pickupController.js` (the `addLineItem` function, lines 306-340)

- [ ] **Step 1: Replace `addLineItem` body**

Replace the entire `exports.addLineItem` function with:

```js
/**
 * POST /api/v1/pickups/:id/items
 * Add a line item to an existing invoice. Accepts service / catalog / custom /
 * manual types — full parity with the creation flow.
 *
 * Body:
 *   type:           'service' | 'fixed' | 'custom' | 'manual' (default 'service')
 *   description:    string (required for service/custom/manual; optional for fixed)
 *   quantity:       int (default 1)
 *   base_price:     number (required unless type='fixed' with catalogItemId — then derived)
 *   catalogItemId:  uuid (required when type='fixed')
 *   catalogName:    string (auto-filled from catalog item if omitted)
 *   dimensions:     { length, width, height } (required when type='custom')
 *   photos:         array of base64 dataURLs (max 3)
 */
exports.addLineItem = asyncHandler(async (req, res) => {
  const invoice = await db.Invoice.findByPk(req.params.id);
  if (!invoice) throw new AppError('Invoice not found', 404, 'NOT_FOUND');
  assertEditable(invoice);

  const { type = 'service', description, quantity, base_price, catalogItemId, catalogName, dimensions, photos } = req.body;

  if (!['service', 'fixed', 'custom', 'manual'].includes(type)) {
    throw new AppError("type must be one of 'service', 'fixed', 'custom', 'manual'", 400, 'INVALID_TYPE');
  }

  const qty = parseInt(quantity) || 1;
  if (qty < 1) throw new AppError('quantity must be >= 1', 400, 'VALIDATION_ERROR');

  // Resolve price + catalog name + capacity weight + final description per type
  let price = parseFloat(base_price) || 0;
  let resolvedCatalogName = catalogName || null;
  let capacityWeight = 1.0;
  let resolvedDescription = description ? String(description).trim() : null;
  let dimsL = null, dimsW = null, dimsH = null;

  if (type === 'fixed') {
    if (!catalogItemId) throw new AppError('catalogItemId is required for type=fixed', 400, 'MISSING_FIELD');
    const cat = await db.CatalogItem.findByPk(catalogItemId);
    if (!cat) throw new AppError('Catalog item not found', 404, 'NOT_FOUND');
    if (!base_price && base_price !== 0) price = parseFloat(cat.price) || 0;
    if (!resolvedCatalogName) resolvedCatalogName = cat.name;
    capacityWeight = parseFloat(cat.capacityWeight) || 1.0;
    if (!resolvedDescription) resolvedDescription = cat.description || null;
  } else if (type === 'custom') {
    if (!dimensions || !dimensions.length || !dimensions.width || !dimensions.height) {
      throw new AppError('dimensions { length, width, height } required for type=custom', 400, 'MISSING_FIELD');
    }
    dimsL = parseFloat(dimensions.length);
    dimsW = parseFloat(dimensions.width);
    dimsH = parseFloat(dimensions.height);
    if (!(dimsL > 0 && dimsW > 0 && dimsH > 0)) {
      throw new AppError('dimensions must be positive numbers', 400, 'VALIDATION_ERROR');
    }
    // Frontend sends the computed price; trust it but require it > 0
    if (!(price > 0)) throw new AppError('base_price required for custom item', 400, 'MISSING_FIELD');
    if (!resolvedDescription) resolvedDescription = `${dimsL}×${dimsW}×${dimsH}"`;
  } else {
    // service or manual: description + price required
    if (!resolvedDescription) throw new AppError('description is required', 400, 'MISSING_FIELD');
    if (!(price > 0)) throw new AppError('base_price must be > 0', 400, 'MISSING_FIELD');
  }

  const crypto = require('crypto');
  const result = await db.sequelize.transaction(async (t) => {
    const item = await db.LineItem.create({
      id: crypto.randomUUID(),
      invoiceId: invoice.id,
      type,
      catalogItemId: type === 'fixed' ? catalogItemId : null,
      catalogName: resolvedCatalogName,
      description: resolvedDescription,
      quantity: qty,
      basePrice: price,
      discountType: 'none',
      discountValue: 0,
      preDiscountTotal: Math.round(qty * price * 100) / 100,
      discountAmount: 0,
      finalPrice: Math.round(qty * price * 100) / 100,
      dimensionsL: dimsL,
      dimensionsW: dimsW,
      dimensionsH: dimsH,
      capacityWeight,
      sortOrder: 999,
    }, { transaction: t });

    if (Array.isArray(photos) && photos.length > 0) {
      const trimmed = photos.slice(0, 3);
      await db.Photo.bulkCreate(
        trimmed.map((data, i) => ({ lineItemId: item.id, data, sortOrder: i })),
        { transaction: t }
      );
    }

    return item;
  });

  invoice.addedItemCount = (invoice.addedItemCount || 0) + 1;
  invoice.lastEditedAt = new Date();
  await invoice.recalculateTotals(); // implicitly saves the dirty fields above

  const fresh = await db.Invoice.findByPk(invoice.id, {
    include: [
      { model: db.LineItem, as: 'lineItems', include: [{ model: db.Photo, as: 'photos', attributes: ['id', 'data', 'sortOrder'] }] },
      { model: db.Shipment },
    ],
  });
  res.status(201).json({ success: true, data: fresh });
});
```

- [ ] **Step 2: Manually verify each type**

Pick a partial-paid invoice ID. Save as `$PARTIAL_ID`.

Add a service item:
```bash
curl -X POST http://localhost:4100/api/v1/pickups/$PARTIAL_ID/items \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"type":"service","description":"Test packing fee","quantity":1,"base_price":15}' | head -c 500
```

Expected: 201 + invoice JSON with new line item appended; finalTotal increased by $15.

Add a custom item with photos:
```bash
curl -X POST http://localhost:4100/api/v1/pickups/$PARTIAL_ID/items \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"type":"custom","description":"Test crate","quantity":1,"base_price":12.6,"dimensions":{"length":20,"width":20,"height":3},"photos":["data:image/jpeg;base64,/9j/4AAQ"]}' | head -c 500
```

Expected: 201; line item has `dimensionsL/W/H` populated; one Photo row created.

Get a real `catalogItemId`:
```bash
curl -s http://localhost:4100/api/v1/create-invoice/catalog -H "Authorization: Bearer $TOKEN" | head -c 500
```

Add a catalog item:
```bash
curl -X POST http://localhost:4100/api/v1/pickups/$PARTIAL_ID/items \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"type":"fixed","catalogItemId":"<UUID>","quantity":2}' | head -c 500
```

Expected: 201; line item populated with catalog name/price.

Try a missing-field error:
```bash
curl -X POST http://localhost:4100/api/v1/pickups/$PARTIAL_ID/items \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"type":"custom","quantity":1,"base_price":5}' -i
```

Expected: 400 with `"code":"MISSING_FIELD"`.

- [ ] **Step 3: Commit**

```bash
git add backend/controllers/pickupController.js
git commit -m "feat(backend): broaden POST /pickups/:id/items to support all item types + photos"
```

---

## Task 6: Add new PATCH /pickups/:id/items/:itemId endpoint

**Files:**
- Modify: `backend/controllers/pickupController.js` (add new export)
- Modify: `backend/routes/pickupRoutes.js`

- [ ] **Step 1: Add `updateLineItem` export**

In `backend/controllers/pickupController.js`, add after `addLineItem` (before `cancelInvoice`):

```js
/**
 * PATCH /api/v1/pickups/:id/items/:itemId
 * Update an existing line item's quantity / unit price / description / dimensions.
 * Discount fields are NOT updated here — use the dedicated discount endpoint.
 */
exports.updateLineItem = asyncHandler(async (req, res) => {
  const invoice = await db.Invoice.findByPk(req.params.id);
  if (!invoice) throw new AppError('Invoice not found', 404, 'NOT_FOUND');
  assertEditable(invoice);

  const item = await db.LineItem.findOne({
    where: { id: req.params.itemId, invoiceId: invoice.id },
  });
  if (!item) throw new AppError('Line item not found on this invoice', 404, 'NOT_FOUND');

  const { quantity, base_price, description, dimensions } = req.body;

  if (quantity !== undefined) {
    const qty = parseInt(quantity);
    if (!(qty >= 1)) throw new AppError('quantity must be >= 1', 400, 'VALIDATION_ERROR');
    item.quantity = qty;
  }

  if (base_price !== undefined) {
    const price = parseFloat(base_price);
    if (!(price >= 0)) throw new AppError('base_price must be >= 0', 400, 'VALIDATION_ERROR');
    item.basePrice = price;
  }

  if (description !== undefined) {
    item.description = description ? String(description).trim() : null;
  }

  if (dimensions !== undefined) {
    if (item.type !== 'custom') {
      throw new AppError('dimensions can only be set on custom items', 400, 'INVALID_FIELD');
    }
    const l = parseFloat(dimensions.length);
    const w = parseFloat(dimensions.width);
    const h = parseFloat(dimensions.height);
    if (!(l > 0 && w > 0 && h > 0)) throw new AppError('dimensions must be positive numbers', 400, 'VALIDATION_ERROR');
    item.dimensionsL = l;
    item.dimensionsW = w;
    item.dimensionsH = h;
  }

  await item.save(); // beforeSave hook recomputes finalPrice from qty * basePrice
  invoice.lastEditedAt = new Date();
  await invoice.recalculateTotals(); // implicitly saves lastEditedAt

  const fresh = await db.Invoice.findByPk(invoice.id, {
    include: [
      { model: db.LineItem, as: 'lineItems', include: [{ model: db.Photo, as: 'photos', attributes: ['id', 'data', 'sortOrder'] }] },
      { model: db.Shipment },
    ],
  });
  res.json({ success: true, data: fresh });
});
```

- [ ] **Step 2: Wire up the route**

In `backend/routes/pickupRoutes.js`, after the existing line:
```js
router.delete('/:id/items/:itemId', pickupController.removeLineItem);
```

Add:
```js
router.patch('/:id/items/:itemId', pickupController.updateLineItem);
```

- [ ] **Step 3: Manually verify**

Restart backend. Pick a partial-paid invoice and one of its line item IDs.

Update the quantity:
```bash
curl -X PATCH http://localhost:4100/api/v1/pickups/$PARTIAL_ID/items/<ITEM_ID> \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"quantity":5}' | head -c 500
```

Expected: 200; the item's `quantity` is 5; invoice `subtotal`/`finalTotal` recomputed; `lastEditedAt` updated.

Update base price:
```bash
curl -X PATCH http://localhost:4100/api/v1/pickups/$PARTIAL_ID/items/<ITEM_ID> \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"base_price":99}'
```

Try setting dimensions on a non-custom item:
```bash
curl -X PATCH http://localhost:4100/api/v1/pickups/$PARTIAL_ID/items/<NON_CUSTOM_ITEM_ID> \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"dimensions":{"length":10,"width":10,"height":10}}' -i
```

Expected: 400 with `"code":"INVALID_FIELD"`.

Try on a paid invoice — expect 403 `INVOICE_LOCKED`.

- [ ] **Step 4: Commit**

```bash
git add backend/controllers/pickupController.js backend/routes/pickupRoutes.js
git commit -m "feat(backend): add PATCH /pickups/:id/items/:itemId for editing existing line items"
```

---

## Task 7: EMPTY_INVOICE check on DELETE + lastEditedAt bump

**Files:**
- Modify: `backend/controllers/pickupController.js` (the `removeLineItem` function)

- [ ] **Step 1: Update `removeLineItem`**

Find `exports.removeLineItem`. Replace the body with:

```js
exports.removeLineItem = asyncHandler(async (req, res) => {
  const invoice = await db.Invoice.findByPk(req.params.id);
  if (!invoice) throw new AppError('Invoice not found', 404, 'NOT_FOUND');
  assertEditable(invoice);

  const item = await db.LineItem.findOne({
    where: { id: req.params.itemId, invoiceId: invoice.id },
  });
  if (!item) throw new AppError('Line item not found', 404, 'NOT_FOUND');

  // Block removal of the last item — force users through the cancel flow
  // when they want to fully empty an invoice.
  const remaining = await db.LineItem.count({ where: { invoiceId: invoice.id } });
  if (remaining <= 1) {
    throw new AppError(
      'An invoice must keep at least one item. To remove all items, cancel the invoice instead.',
      400,
      'EMPTY_INVOICE'
    );
  }

  await item.destroy();
  invoice.lastEditedAt = new Date();
  await invoice.recalculateTotals(); // implicitly saves lastEditedAt

  const fresh = await db.Invoice.findByPk(invoice.id, {
    include: [
      { model: db.LineItem, as: 'lineItems', include: [{ model: db.Photo, as: 'photos', attributes: ['id', 'data', 'sortOrder'] }] },
      { model: db.Shipment },
    ],
  });
  res.json({ success: true, data: fresh });
});
```

- [ ] **Step 2: Manually verify**

Pick a partial-paid invoice with multiple items. Delete one — expect 200.
Now if only one item remains, try to delete it:
```bash
curl -X DELETE http://localhost:4100/api/v1/pickups/$PARTIAL_ID/items/<LAST_ITEM_ID> \
  -H "Authorization: Bearer $TOKEN" -i
```

Expected: 400 with `"code":"EMPTY_INVOICE"`.

- [ ] **Step 3: Commit**

```bash
git add backend/controllers/pickupController.js
git commit -m "feat(backend): block deletion of last line item; add EMPTY_INVOICE error"
```

---

## Task 8: Add lastEditedAt bumps to discount endpoints

**Files:**
- Modify: `backend/controllers/pickupController.js` (the `updateInvoiceDiscount` and `updateLineItemDiscount` functions)

- [ ] **Step 1: Bump `lastEditedAt` in `updateInvoiceDiscount`**

Find `exports.updateInvoiceDiscount`. Before the line `await invoice.recalculateTotals();`, add:
```js
invoice.lastEditedAt = new Date();
```

- [ ] **Step 2: Bump `lastEditedAt` in `updateLineItemDiscount`**

Find `exports.updateLineItemDiscount`. Before the line `await invoice.recalculateTotals();`, add:
```js
invoice.lastEditedAt = new Date();
```

`recalculateTotals` calls `await this.save()` internally, so the dirty `lastEditedAt` flushes with the recomputed totals in a single write.

- [ ] **Step 3: Manually verify**

Apply a discount to a partial invoice and check `lastEditedAt`:
```bash
curl -X PATCH http://localhost:4100/api/v1/pickups/$PARTIAL_ID/discount \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"discount_type":"percentage","discount_value":5}' | head -c 600
```

Expected: response includes a recent `lastEditedAt` timestamp.

- [ ] **Step 4: Commit**

```bash
git add backend/controllers/pickupController.js
git commit -m "feat(backend): bump lastEditedAt on discount edits"
```

---

## Task 9: Backfill script for overpaid status

**Files:**
- Create: `backend/scripts/backfill-overpaid-status.js`

- [ ] **Step 1: Create the script**

Create `backend/scripts/backfill-overpaid-status.js`:

```js
/**
 * One-off backfill: any invoice with amountPaid > finalTotal + 0.01
 * gets paymentStatus = 'overpaid'. Idempotent — safe to re-run.
 *
 * Usage:  node backend/scripts/backfill-overpaid-status.js
 */
require('dotenv').config();
const db = require('../models');
const { computePaymentStatus } = require('../utils/invoicePaymentStatus');

(async () => {
  try {
    const all = await db.Invoice.findAll({
      where: { status: 'completed' },
      attributes: ['id', 'invoiceNumber', 'amountPaid', 'finalTotal', 'paymentStatus'],
    });

    let changed = 0;
    let scanned = 0;
    for (const inv of all) {
      scanned += 1;
      const correct = computePaymentStatus(inv.amountPaid, inv.finalTotal);
      if (correct !== inv.paymentStatus) {
        console.log(`Invoice #${inv.invoiceNumber}: ${inv.paymentStatus} → ${correct} ` +
                    `(paid=${inv.amountPaid}, total=${inv.finalTotal})`);
        await inv.update({ paymentStatus: correct });
        changed += 1;
      }
    }

    console.log(`\nScanned ${scanned} invoices, updated ${changed}.`);
    process.exit(0);
  } catch (err) {
    console.error('Backfill failed:', err);
    process.exit(1);
  }
})();
```

- [ ] **Step 2: Run against local dev DB**

```bash
cd backend && node scripts/backfill-overpaid-status.js
```

Expected: prints scanned/updated counts. On a clean local DB, `updated` should be 0 (no overpaid invoices).

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/backfill-overpaid-status.js
git commit -m "feat(backend): backfill script to recompute paymentStatus including overpaid"
```

---

## Task 10: Extract LineItemPicker component

**Files:**
- Create: `frontend/src/components/LineItemPicker.jsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/LineItemPicker.jsx`:

```jsx
import { useState, useEffect } from 'react';
import axios from 'axios';

export const CUBIC_RATE = 0.0105;

const fmt = (n) => `$${(parseFloat(n) || 0).toFixed(2)}`;

/**
 * Three-tab picker for adding line items: catalog (fixed price), custom
 * (volumetric — L×W×H × CUBIC_RATE), or manual (free description + price).
 *
 * Photo capture is supported on every type (max 3 per item).
 *
 * Emits the picked item via `onAdd(item)` where `item` matches the shape
 * the backend's POST /pickups/:id/items endpoint expects:
 *   { type, description, quantity, base_price, catalogItemId?, catalogName?,
 *     dimensions?, photos[] }
 *
 * The picker manages its own catalog fetch and form state. It does not
 * persist anything; the parent decides whether to commit immediately or
 * stage to a draft.
 */
export default function LineItemPicker({ onAdd }) {
  const [catalog, setCatalog] = useState([]);
  const [itemType, setItemType] = useState('fixed');
  const [catFilter, setCatFilter] = useState('');
  const [customForm, setCustomForm] = useState({ length: '', width: '', height: '', quantity: '1', description: '' });
  const [manualForm, setManualForm] = useState({ description: '', price: '', quantity: '1' });
  const [photos, setPhotos] = useState([]); // staged photos for the next add
  const [flash, setFlash] = useState('');

  useEffect(() => {
    axios.get('/api/v1/create-invoice/catalog').then((res) => setCatalog(res.data.data)).catch(() => {});
  }, []);

  const showFlash = (msg) => {
    setFlash(msg);
    setTimeout(() => setFlash(''), 1500);
  };

  const addPhoto = (file) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW = 600;
        const scale = Math.min(1, maxW / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL('image/jpeg', 0.7);
        setPhotos((prev) => [...prev, compressed].slice(0, 3));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const removePhoto = (idx) => setPhotos((prev) => prev.filter((_, i) => i !== idx));

  const handleAddCatalog = (catItem) => {
    onAdd({
      type: 'fixed',
      catalogItemId: catItem.id,
      catalogName: catItem.name,
      description: catItem.description || null,
      quantity: 1,
      base_price: parseFloat(catItem.price),
      photos: [...photos],
    });
    setPhotos([]);
    showFlash(`${catItem.name} added`);
  };

  const handleAddCustom = () => {
    const l = parseFloat(customForm.length) || 0;
    const w = parseFloat(customForm.width) || 0;
    const h = parseFloat(customForm.height) || 0;
    const qty = parseInt(customForm.quantity) || 1;
    if (!(l > 0 && w > 0 && h > 0)) return;
    const price = Math.round(l * w * h * CUBIC_RATE * 100) / 100;
    onAdd({
      type: 'custom',
      description: customForm.description || `${l}×${w}×${h}"`,
      quantity: qty,
      base_price: price,
      dimensions: { length: l, width: w, height: h },
      photos: [...photos],
    });
    setCustomForm({ length: '', width: '', height: '', quantity: '1', description: '' });
    setPhotos([]);
    showFlash('Custom item added');
  };

  const handleAddManual = () => {
    const price = parseFloat(manualForm.price) || 0;
    const qty = parseInt(manualForm.quantity) || 1;
    if (!(price > 0) || !manualForm.description.trim()) return;
    onAdd({
      type: 'manual',
      description: manualForm.description.trim(),
      quantity: qty,
      base_price: price,
      photos: [...photos],
    });
    setManualForm({ description: '', price: '', quantity: '1' });
    setPhotos([]);
    showFlash('Item added');
  };

  const categories = [...new Set(catalog.map((c) => c.category))];

  return (
    <div className="space-y-4">
      {flash && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-6 py-2.5 rounded-lg text-sm font-semibold shadow-lg">
          {flash}
        </div>
      )}

      {/* Type toggle */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {[['fixed', 'Catalog'], ['custom', 'Dimensions'], ['manual', 'Manual Price']].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setItemType(key)}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium ${itemType === key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Photo staging — applies to whichever item is added next */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-gray-500 font-medium">Photos for next item:</span>
        {photos.map((p, i) => (
          <div key={i} className="relative w-12 h-12">
            <img src={p} alt="" className="w-12 h-12 rounded-md object-cover border border-gray-200" />
            <button
              type="button"
              onClick={() => removePhoto(i)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center leading-none"
            >
              x
            </button>
          </div>
        ))}
        {photos.length < 3 && (
          <label className="w-12 h-12 rounded-md border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-primary-400 text-gray-400 hover:text-primary-500">
            <span className="text-xl">+</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { if (e.target.files[0]) addPhoto(e.target.files[0]); e.target.value = ''; }}
            />
          </label>
        )}
      </div>

      {itemType === 'fixed' && (
        <>
          <div className="flex gap-2 overflow-x-auto pb-2">
            <button
              type="button"
              onClick={() => setCatFilter('')}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${!catFilter ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCatFilter(c)}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${catFilter === c ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {catalog.filter((c) => !catFilter || c.category === catFilter).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleAddCatalog(item)}
                className="text-left rounded-lg border border-gray-200 hover:border-primary-400 hover:bg-primary-50 transition-colors overflow-hidden"
              >
                {item.image ? (
                  <div className="w-full h-24 bg-gray-100">
                    <img src={item.image} alt={item.name} className="w-full h-full object-contain p-1" />
                  </div>
                ) : (
                  <div className="w-full h-24 bg-gray-100" />
                )}
                <div className="p-2">
                  <p className="font-medium text-sm text-gray-900 leading-tight">{item.name}</p>
                  <p className="text-xs text-gray-500">{item.category}</p>
                  <p className="font-bold text-green-600 mt-0.5">{fmt(parseFloat(item.price))}</p>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {itemType === 'custom' && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {['length', 'width', 'height'].map((k) => (
              <div key={k}>
                <label className="block text-xs text-gray-500 mb-1">{k.charAt(0).toUpperCase() + k.slice(1)} (in)</label>
                <input
                  type="number"
                  value={customForm[k]}
                  onChange={(e) => setCustomForm((p) => ({ ...p, [k]: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Quantity</label>
              <input
                type="number"
                min="1"
                value={customForm.quantity}
                onChange={(e) => setCustomForm((p) => ({ ...p, quantity: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Description (optional)</label>
              <input
                type="text"
                value={customForm.description}
                onChange={(e) => setCustomForm((p) => ({ ...p, description: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>
          {customForm.length && customForm.width && customForm.height && (
            <p className="text-sm text-gray-600">
              Price:{' '}
              <span className="font-bold text-green-600">
                {fmt((parseFloat(customForm.length) || 0) * (parseFloat(customForm.width) || 0) * (parseFloat(customForm.height) || 0) * CUBIC_RATE)}
              </span>{' '}
              per unit
            </p>
          )}
          <button
            type="button"
            onClick={handleAddCustom}
            className="w-full px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
          >
            + Add Custom Item
          </button>
        </div>
      )}

      {itemType === 'manual' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">For items that don't fit a catalog or standard dimensions — describe it and set your price.</p>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Description</label>
            <input
              type="text"
              placeholder="e.g. Oversized barrel, Assorted goods"
              value={manualForm.description}
              onChange={(e) => setManualForm((p) => ({ ...p, description: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Price ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={manualForm.price}
                onChange={(e) => setManualForm((p) => ({ ...p, price: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Quantity</label>
              <input
                type="number"
                min="1"
                value={manualForm.quantity}
                onChange={(e) => setManualForm((p) => ({ ...p, quantity: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleAddManual}
            disabled={!manualForm.description.trim() || !(parseFloat(manualForm.price) > 0)}
            className="w-full px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Add Item
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify component imports cleanly**

Run from `frontend/`:
```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds (the component is exported but unused — that's fine, the next task wires it up).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/LineItemPicker.jsx
git commit -m "feat(frontend): extract LineItemPicker component for reuse across creation and edit flows"
```

---

## Task 11: Refactor CreateInvoice to use LineItemPicker

**Files:**
- Modify: `frontend/src/pages/CreateInvoice.jsx`

- [ ] **Step 1: Replace the items step**

In `frontend/src/pages/CreateInvoice.jsx`:

At the top of the file, after the existing imports, add:
```jsx
import LineItemPicker from '../components/LineItemPicker';
```

Remove the line `const CUBIC_RATE = 0.0105;` (now lives in `LineItemPicker.jsx`).

Remove the local item-add state: `itemType`, `customForm`, `manualForm`, `catFilter`, `catalog` and their setters; the catalog `useEffect` that fetches `/api/v1/create-invoice/catalog`; the helpers `addCatalogItem`, `addCustomItem`, `addManualItem`, `addPhotoToItem`, `removePhoto`. (Keep `lineItems`, `setLineItems`, `updateQty`, `removeItem` — those manage the staged-items list.)

Replace the entire `{itemType === 'fixed' && (...)}{itemType === 'custom' && (...)}{itemType === 'manual' && (...)}` block plus the surrounding "Type toggle" inside `{step === 3 && (...)}` with:

```jsx
<div className="gc-card p-6">
  <h2 className="text-lg font-bold text-gray-900 mb-4">Add Items</h2>
  <LineItemPicker
    onAdd={(item) => {
      // Match the existing local lineItems shape used by handleSubmit
      const local = {
        id: crypto.randomUUID(),
        type: item.type,
        catalogItemId: item.catalogItemId || null,
        catalogName: item.catalogName || null,
        description: item.description || '',
        quantity: item.quantity,
        basePrice: item.base_price,
        finalPrice: item.base_price,
        dimensions: item.dimensions || null,
        photos: item.photos || [],
      };
      // Catalog items merge by catalogItemId (matches old addCatalogItem behavior)
      if (local.catalogItemId) {
        const idx = lineItems.findIndex((li) => li.catalogItemId === local.catalogItemId);
        if (idx !== -1) {
          setLineItems((prev) => prev.map((li, i) => i === idx ? { ...li, quantity: li.quantity + 1 } : li));
          return;
        }
      }
      setLineItems((prev) => [...prev, local]);
    }}
  />
</div>
```

- [ ] **Step 2: Verify CreateInvoice still builds**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

Expected: build succeeds.

- [ ] **Step 3: Manually verify the creation flow end-to-end in the browser**

Start the frontend (`npm run dev`). In the browser:
1. Go to "Create Invoice".
2. Pick (or create) a customer + recipient.
3. On step 3 (Items), verify the three sub-tabs render: Catalog, Dimensions, Manual Price.
4. Add one of each type:
   - Catalog: click any catalog tile — it appears in "Added Items".
   - Dimensions: enter `20 × 20 × 3`, qty 1, click "Add Custom Item" — it appears with auto-computed price.
   - Manual: enter description, price, qty, click "+ Add Item".
5. Click the photo "+" button before adding a manual item, attach a JPG, then add the item — the item should have the photo.
6. Adjust quantity with `−` / `+` buttons on each row.
7. Remove an item with the `x` button.
8. Proceed to Review → Submit.
9. Confirm the new invoice appears with all items + photos at `/pickups/<id>`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/CreateInvoice.jsx
git commit -m "refactor(frontend): use LineItemPicker in CreateInvoice items step"
```

---

## Task 12: Add new draft state to PickupDetail

**Files:**
- Modify: `frontend/src/pages/PickupDetail.jsx`

- [ ] **Step 1: Add the new draft state hooks**

In `PickupDetail.jsx`, find the existing draft state block (around line 38-44):
```jsx
const [draftInvoiceDiscount, setDraftInvoiceDiscount] = useState(null);
const [draftLineDiscounts, setDraftLineDiscounts] = useState({});
const [savingDrafts, setSavingDrafts] = useState(false);

const isDirty = draftInvoiceDiscount !== null || Object.keys(draftLineDiscounts).length > 0;
```

Replace with:
```jsx
const [draftInvoiceDiscount, setDraftInvoiceDiscount] = useState(null);
const [draftLineDiscounts, setDraftLineDiscounts] = useState({});
const [draftLineEdits, setDraftLineEdits] = useState({});      // { [lineId]: { quantity?, basePrice?, description?, dimensionsL?, dimensionsW?, dimensionsH? } }
const [draftLineDeletes, setDraftLineDeletes] = useState(new Set());
const [draftLineAdds, setDraftLineAdds] = useState([]);         // array of items shaped like LineItemPicker output
const [savingDrafts, setSavingDrafts] = useState(false);

const isDirty =
  draftInvoiceDiscount !== null ||
  Object.keys(draftLineDiscounts).length > 0 ||
  Object.keys(draftLineEdits).length > 0 ||
  draftLineDeletes.size > 0 ||
  draftLineAdds.length > 0;
```

- [ ] **Step 2: Update `discardDrafts`**

Find:
```jsx
const discardDrafts = () => {
  setDraftInvoiceDiscount(null);
  setDraftLineDiscounts({});
};
```

Replace with:
```jsx
const discardDrafts = () => {
  setDraftInvoiceDiscount(null);
  setDraftLineDiscounts({});
  setDraftLineEdits({});
  setDraftLineDeletes(new Set());
  setDraftLineAdds([]);
};
```

- [ ] **Step 3: Update the banner summary**

Find the banner's summary text (around line 257):
```jsx
<p className="text-[11.5px] text-white/75">
  {Object.keys(draftLineDiscounts).length > 0 && `${Object.keys(draftLineDiscounts).length} line discount${Object.keys(draftLineDiscounts).length === 1 ? '' : 's'}`}
  {Object.keys(draftLineDiscounts).length > 0 && draftInvoiceDiscount && ' · '}
  {draftInvoiceDiscount && 'invoice discount'}
</p>
```

Replace with:
```jsx
<p className="text-[11.5px] text-white/75">
  {(() => {
    const parts = [];
    if (Object.keys(draftLineEdits).length > 0) parts.push(`${Object.keys(draftLineEdits).length} edit${Object.keys(draftLineEdits).length === 1 ? '' : 's'}`);
    if (draftLineDeletes.size > 0) parts.push(`${draftLineDeletes.size} removal${draftLineDeletes.size === 1 ? '' : 's'}`);
    if (draftLineAdds.length > 0) parts.push(`${draftLineAdds.length} new item${draftLineAdds.length === 1 ? '' : 's'}`);
    if (Object.keys(draftLineDiscounts).length > 0) parts.push(`${Object.keys(draftLineDiscounts).length} line discount${Object.keys(draftLineDiscounts).length === 1 ? '' : 's'}`);
    if (draftInvoiceDiscount) parts.push('invoice discount');
    return parts.join(' · ');
  })()}
</p>
```

- [ ] **Step 4: Verify build**

```bash
cd frontend && npm run build 2>&1 | tail -5
```

Expected: build succeeds. (No behavioral change yet — drafts are wired but nothing produces them.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/PickupDetail.jsx
git commit -m "feat(frontend): add draft state for line edits, deletes, and adds"
```

---

## Task 13: Update lock condition + computePreview to handle new drafts

**Files:**
- Modify: `frontend/src/pages/PickupDetail.jsx`

- [ ] **Step 1: Add the lock helper**

In `PickupDetail.jsx`, find the line `if (!pickup) return <p className="text-center py-12 text-gray-500">Invoice not found</p>;` (around line 224). Immediately after that line — where `pickup` is guaranteed non-null for the rest of the render — add:
```jsx
// Mirrors backend assertEditable: locked iff cancelled or paid ≈ total
const isLocked =
  pickup.status === 'cancelled' ||
  Math.abs((parseFloat(pickup.amountPaid) || 0) - (parseFloat(pickup.finalTotal) || 0)) < 0.01;
```

- [ ] **Step 2: Update `computePreview` to apply edits, skip deletes, and append adds**

Find `const computePreview = () => {` (around line 80). Replace the entire function body with:

```jsx
const computePreview = () => {
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

  // Existing items, with edits applied and deletes skipped
  const baseLines = (pickup.lineItems || [])
    .filter((li) => !draftLineDeletes.has(li.id))
    .map((li) => {
      const edit = draftLineEdits[li.id] || {};
      const merged = {
        ...li,
        quantity: edit.quantity !== undefined ? edit.quantity : li.quantity,
        basePrice: edit.basePrice !== undefined ? edit.basePrice : li.basePrice,
        description: edit.description !== undefined ? edit.description : li.description,
        dimensionsL: edit.dimensionsL !== undefined ? edit.dimensionsL : li.dimensionsL,
        dimensionsW: edit.dimensionsW !== undefined ? edit.dimensionsW : li.dimensionsW,
        dimensionsH: edit.dimensionsH !== undefined ? edit.dimensionsH : li.dimensionsH,
      };
      const draft = draftLineDiscounts[li.id];
      const dt = draft?.discount_type ?? merged.discountType ?? 'none';
      const dv = parseFloat(draft?.discount_value ?? merged.discountValue ?? 0) || 0;
      const qty = parseInt(merged.quantity) || 0;
      const unit = parseFloat(merged.basePrice) || 0;
      const pre = round2(qty * unit);
      let da = 0;
      if (dt === 'percentage' && dv > 0) da = round2(pre * (dv / 100));
      else if (dt === 'fixed' && dv > 0) da = round2(Math.min(dv, pre));
      return { ...merged, _pre: pre, _da: da, _final: round2(pre - da), _dt: dt, _dv: dv, _isNew: false };
    });

  // Pending new items — synthesize fake line objects matching the preview shape
  const newLines = draftLineAdds.map((it) => {
    const qty = parseInt(it.quantity) || 0;
    const unit = parseFloat(it.base_price) || 0;
    const pre = round2(qty * unit);
    return {
      id: it._draftId,
      type: it.type,
      catalogName: it.catalogName,
      description: it.description,
      quantity: qty,
      basePrice: unit,
      dimensionsL: it.dimensions?.length ?? null,
      dimensionsW: it.dimensions?.width ?? null,
      dimensionsH: it.dimensions?.height ?? null,
      photos: (it.photos || []).map((data, i) => ({ id: `draft-${i}`, data })),
      _pre: pre,
      _da: 0,
      _final: pre,
      _dt: 'none',
      _dv: 0,
      _isNew: true,
    };
  });

  const lines = [...baseLines, ...newLines];

  const subtotal = round2(lines.reduce((s, l) => s + l._final, 0));
  const lineDiscSum = round2(lines.reduce((s, l) => s + l._da, 0));
  const invDisc = draftInvoiceDiscount ?? { discount_type: pickup.discountType, discount_value: pickup.discountValue };
  const idt = invDisc?.discount_type || 'none';
  const idv = parseFloat(invDisc?.discount_value || 0) || 0;
  let invDiscAmt = 0;
  if (idt === 'percentage' && idv > 0) invDiscAmt = round2(subtotal * (idv / 100));
  else if (idt === 'fixed' && idv > 0) invDiscAmt = round2(Math.min(idv, subtotal));
  const finalTotal = round2(subtotal - invDiscAmt);
  return {
    subtotal,
    totalDiscount: round2(lineDiscSum + invDiscAmt),
    finalTotal,
    lines,
    invDiscAmt,
    invDiscType: idt,
    invDiscValue: idv,
  };
};
```

- [ ] **Step 3: Update existing lock checks to use `isLocked`**

Find these usages and replace `pickup.paymentStatus === 'paid'` with `isLocked`:

- Line ~485 in the `LineItemRow` props: `locked={pickup.paymentStatus === 'paid'}` → `locked={isLocked}`
- Line ~497 `onRemove={pickup.paymentStatus !== 'paid' ? ...}` → `onRemove={!isLocked ? ...}`
- Line ~512 `<AddServiceItem locked={pickup.paymentStatus === 'paid'} ...>` → will be replaced in Task 14, leave for now.
- Line ~556 `<InvoiceDiscountEditor ... locked={pickup.paymentStatus === 'paid'} ...>` → `locked={isLocked}`

- [ ] **Step 4: Verify build**

```bash
cd frontend && npm run build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/PickupDetail.jsx
git commit -m "feat(frontend): mirror backend lock rule and apply line drafts to preview"
```

---

## Task 14: Replace AddServiceItem with LineItemPicker integration

**Files:**
- Modify: `frontend/src/pages/PickupDetail.jsx`

- [ ] **Step 1: Add LineItemPicker import**

At the top of `PickupDetail.jsx`, after the existing imports, add:
```jsx
import LineItemPicker from '../components/LineItemPicker';
```

- [ ] **Step 2: Add the stage-on-add and remove-pending-add helpers**

In the `PickupDetail` component, alongside the existing draft mutators, add:
```jsx
const stageNewItem = (item) => {
  setDraftLineAdds((prev) => [
    ...prev,
    { ...item, _draftId: `draft-add-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
  ]);
};

const removePendingAdd = (draftId) => {
  setDraftLineAdds((prev) => prev.filter((it) => it._draftId !== draftId));
};
```

- [ ] **Step 3: Add a collapsible Add-Item disclosure component**

Inside the same file (just below the existing `AddServiceItem` definition, or replace `AddServiceItem` entirely since it's no longer used), add:
```jsx
function AddItemDisclosure({ locked, onAdd }) {
  const [open, setOpen] = useState(false);
  if (locked) return null;
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-2 text-[12.5px] font-semibold text-[#6366F1] hover:text-[#4F46E5]"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        Add item (catalog, dimensions, or manual)
      </button>
    );
  }
  return (
    <div className="mt-3 p-4 rounded-[10px] bg-[#F4F6FA] border border-black/[0.04]">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-[13px] font-bold text-[#1A1D2B]">Add Item</h4>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-7 px-2 rounded-md text-[#9CA3C0] text-[12px] hover:text-[#1A1D2B]"
        >
          Close
        </button>
      </div>
      <LineItemPicker onAdd={onAdd} />
    </div>
  );
}
```

- [ ] **Step 4: Replace `<AddServiceItem ...>` usage**

In `PickupDetail`'s JSX, find:
```jsx
<AddServiceItem
  locked={pickup.paymentStatus === 'paid'}
  onAdd={async (payload) => {
    try {
      const res = await axios.post(`/api/v1/pickups/${id}/items`, payload);
      setPickup((prev) => ({ ...prev, ...res.data.data }));
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to add item');
    }
  }}
/>
```

Replace with:
```jsx
<AddItemDisclosure locked={isLocked} onAdd={stageNewItem} />
```

- [ ] **Step 5: Render pending-add chips inside the line items list**

The preview already includes `_isNew` lines. The existing render loop needs to handle them. Find:
```jsx
{preview.lines.map((item) => (
  <LineItemRow
    key={item.id}
    ...
  />
))}
```

The `LineItemRow` component will need to know it's a pending add (no API actions allowed; just a Cancel button). Modify the render to pass an `isNew` flag and a `onCancelPending` callback:

```jsx
{preview.lines.map((item) => (
  <LineItemRow
    key={item.id}
    item={item}
    locked={isLocked}
    isNew={item._isNew}
    onCancelPending={item._isNew ? () => removePendingAdd(item.id) : null}
    onStage={(payload) => {
      if (item._isNew) return; // can't add discounts to a not-yet-saved line
      setDraftLineDiscounts((prev) => ({ ...prev, [item.id]: payload }));
    }}
    onClearDraft={() => {
      setDraftLineDiscounts((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    }}
    hasDraft={Boolean(draftLineDiscounts[item.id])}
    onRemove={!isLocked && !item._isNew ? () => {
      setDraftLineDeletes((prev) => {
        const next = new Set(prev);
        next.add(item.id);
        return next;
      });
    } : null}
  />
))}
```

- [ ] **Step 6: Update LineItemRow to render the pending-add UI variant**

Find `function LineItemRow({ item, onStage, onClearDraft, locked, hasDraft, onRemove }) {` and update the signature:
```jsx
function LineItemRow({ item, onStage, onClearDraft, locked, hasDraft, onRemove, isNew, onCancelPending }) {
```

Then in the bottom action row (the `{!editing ? (...)}` branch), prepend a special-case for `isNew`:
```jsx
{isNew ? (
  <div className="mt-2 flex items-center gap-3">
    <span className="text-[10px] font-semibold text-[#10B981] uppercase tracking-wide">· new (unsaved)</span>
    {onCancelPending && (
      <button
        type="button"
        onClick={onCancelPending}
        className="text-[11px] font-semibold text-[#EF4444] hover:text-[#DC2626]"
      >
        Cancel add
      </button>
    )}
  </div>
) : !editing ? (
  /* ... existing not-editing branch ... */
) : (
  /* ... existing editing branch ... */
)}
```

(Wrap the existing `!editing ?` and editing branches into the third arm of a chained ternary, or refactor into separate if-blocks for readability.)

Also: when `isNew`, hide the "Add discount" / "Edit discount" / "Remove" buttons, since these only apply to persisted items. The simplest is the `isNew` ternary above replacing the entire bottom-row.

- [ ] **Step 7: Verify in browser**

Restart the frontend. Navigate to a partial-paid invoice's detail page.
1. Click "+ Add item (catalog, dimensions, or manual)" — picker should expand.
2. Pick a catalog item — it appears in the line items list with a green "new (unsaved)" tag and a "Cancel add" button.
3. Banner shows "1 new item".
4. Click "Cancel add" — the line disappears, banner clears.
5. Add another item, leave it, the banner persists.

Do NOT click Save yet — that's Task 17.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/PickupDetail.jsx
git commit -m "feat(frontend): replace AddServiceItem with LineItemPicker, stage adds to drafts"
```

---

## Task 15: Add inline edit mode to LineItemRow for qty / price / description / dimensions

**Files:**
- Modify: `frontend/src/pages/PickupDetail.jsx`

- [ ] **Step 1: Add edit-item callbacks in PickupDetail**

In the `PickupDetail` component, add alongside the other staging helpers:
```jsx
const stageLineEdit = (lineId, fieldDelta) => {
  setDraftLineEdits((prev) => {
    const merged = { ...(prev[lineId] || {}), ...fieldDelta };
    return { ...prev, [lineId]: merged };
  });
};

const clearLineEdit = (lineId) => {
  setDraftLineEdits((prev) => {
    const next = { ...prev };
    delete next[lineId];
    return next;
  });
};

const undoDelete = (lineId) => {
  setDraftLineDeletes((prev) => {
    const next = new Set(prev);
    next.delete(lineId);
    return next;
  });
};
```

- [ ] **Step 2: Show pending-delete items as struck-through with "Undo"**

The preview filters deleted items out. To still display them as struck-through with "Undo", change `computePreview` to NOT filter them and instead mark them. Find in `computePreview`:
```jsx
const baseLines = (pickup.lineItems || [])
  .filter((li) => !draftLineDeletes.has(li.id))
  .map((li) => {
```

Replace with:
```jsx
const baseLines = (pickup.lineItems || [])
  .map((li) => {
```

And inside the `.map`, after computing `_final`, append `_isPendingDelete: draftLineDeletes.has(li.id)` to the returned line object.

Then in the subtotal sum, exclude pending-delete lines:
```jsx
const subtotal = round2(lines.reduce((s, l) => s + (l._isPendingDelete ? 0 : l._final), 0));
const lineDiscSum = round2(lines.reduce((s, l) => s + (l._isPendingDelete ? 0 : l._da), 0));
```

- [ ] **Step 3: Pass `_isPendingDelete` and `onUndoDelete` to LineItemRow**

Update the `LineItemRow` JSX in the render loop:
```jsx
<LineItemRow
  key={item.id}
  item={item}
  locked={isLocked}
  isNew={item._isNew}
  isPendingDelete={item._isPendingDelete}
  onUndoDelete={item._isPendingDelete ? () => undoDelete(item.id) : null}
  onCancelPending={item._isNew ? () => removePendingAdd(item.id) : null}
  onStageEdit={(delta) => stageLineEdit(item.id, delta)}
  hasEditDraft={Boolean(draftLineEdits[item.id])}
  onClearEdit={() => clearLineEdit(item.id)}
  onStage={(payload) => {
    if (item._isNew) return;
    setDraftLineDiscounts((prev) => ({ ...prev, [item.id]: payload }));
  }}
  onClearDraft={() => {
    setDraftLineDiscounts((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
  }}
  hasDraft={Boolean(draftLineDiscounts[item.id])}
  onRemove={!isLocked && !item._isNew && !item._isPendingDelete ? () => {
    setDraftLineDeletes((prev) => {
      const next = new Set(prev);
      next.add(item.id);
      return next;
    });
  } : null}
/>
```

- [ ] **Step 4: Update LineItemRow with new props + edit-fields mode**

Replace the `LineItemRow` function with this expanded version:

```jsx
function LineItemRow({
  item, onStage, onClearDraft, locked, hasDraft, onRemove,
  isNew, onCancelPending,
  isPendingDelete, onUndoDelete,
  onStageEdit, hasEditDraft, onClearEdit,
}) {
  const [discEditing, setDiscEditing] = useState(false);
  const [fieldEditing, setFieldEditing] = useState(false);
  const [type, setType] = useState(item._dt || 'none');
  const [value, setValue] = useState(item._dv != null ? String(item._dv) : '0');

  // Inline-edit local state for qty / price / description / dimensions
  const [editQty, setEditQty] = useState(String(item.quantity ?? 1));
  const [editPrice, setEditPrice] = useState(String(item.basePrice ?? 0));
  const [editDesc, setEditDesc] = useState(item.description ?? '');
  const [editDimL, setEditDimL] = useState(item.dimensionsL != null ? String(item.dimensionsL) : '');
  const [editDimW, setEditDimW] = useState(item.dimensionsW != null ? String(item.dimensionsW) : '');
  const [editDimH, setEditDimH] = useState(item.dimensionsH != null ? String(item.dimensionsH) : '');

  useEffect(() => {
    setType(item._dt || 'none');
    setValue(item._dv != null ? String(item._dv) : '0');
  }, [item._dt, item._dv]);

  useEffect(() => {
    setEditQty(String(item.quantity ?? 1));
    setEditPrice(String(item.basePrice ?? 0));
    setEditDesc(item.description ?? '');
    setEditDimL(item.dimensionsL != null ? String(item.dimensionsL) : '');
    setEditDimW(item.dimensionsW != null ? String(item.dimensionsW) : '');
    setEditDimH(item.dimensionsH != null ? String(item.dimensionsH) : '');
  }, [item.quantity, item.basePrice, item.description, item.dimensionsL, item.dimensionsW, item.dimensionsH]);

  const fmt = (n) => `$${(parseFloat(n) || 0).toFixed(2)}`;
  const preDiscount = item._pre || 0;
  const discountAmt = item._da || 0;
  const finalPrice = item._final || 0;
  const hasDiscount = discountAmt > 0.01;
  const isCustom = item.type === 'custom';

  const stageDisc = () => {
    onStage({ discount_type: type, discount_value: parseFloat(value) || 0 });
    setDiscEditing(false);
  };

  const clearDisc = () => {
    setType('none');
    setValue('0');
    onStage({ discount_type: 'none', discount_value: 0 });
    setDiscEditing(false);
  };

  const revertDisc = () => {
    onClearDraft();
    setDiscEditing(false);
  };

  const applyFieldEdit = () => {
    const delta = {};
    const qtyN = parseInt(editQty);
    const priceN = parseFloat(editPrice);
    if (qtyN >= 1 && qtyN !== item.quantity) delta.quantity = qtyN;
    if (priceN >= 0 && priceN !== parseFloat(item.basePrice)) delta.basePrice = priceN;
    if (editDesc !== (item.description ?? '')) delta.description = editDesc;
    if (isCustom) {
      const lN = parseFloat(editDimL);
      const wN = parseFloat(editDimW);
      const hN = parseFloat(editDimH);
      if (lN > 0 && lN !== parseFloat(item.dimensionsL)) delta.dimensionsL = lN;
      if (wN > 0 && wN !== parseFloat(item.dimensionsW)) delta.dimensionsW = wN;
      if (hN > 0 && hN !== parseFloat(item.dimensionsH)) delta.dimensionsH = hN;
    }
    if (Object.keys(delta).length > 0) onStageEdit(delta);
    setFieldEditing(false);
  };

  const revertFieldEdit = () => {
    onClearEdit();
    setFieldEditing(false);
  };

  return (
    <div className={`p-3 rounded-lg ${isPendingDelete ? 'bg-red-50' : 'bg-gray-50'}`}>
      <div className="flex items-start gap-4">
        {item.photos?.length > 0 && (
          <img src={item.photos[0].data} alt="" className={`w-16 h-16 rounded-lg object-cover shrink-0 ${isPendingDelete ? 'opacity-50' : ''}`} />
        )}
        <div className="flex-1 min-w-0">
          <p className={`font-medium text-gray-900 ${isPendingDelete ? 'line-through opacity-60' : ''}`}>
            {item.catalogName || item.description || 'Custom Item'}
          </p>
          <p className={`text-xs text-gray-500 ${isPendingDelete ? 'line-through opacity-60' : ''}`}>
            {item.type === 'custom' && item.dimensionsL
              ? `${item.dimensionsL}" × ${item.dimensionsW}" × ${item.dimensionsH}"`
              : item.type}
            {' · '}Qty: {item.quantity}
            {' · '}@ {fmt(item.basePrice)}
          </p>
        </div>
        <div className={`text-right shrink-0 ${isPendingDelete ? 'line-through opacity-60' : ''}`}>
          {hasDiscount && (
            <p className="text-[11px] text-gray-400 line-through tabular-nums">{fmt(preDiscount)}</p>
          )}
          <p className="font-semibold tabular-nums">{fmt(finalPrice)}</p>
          {hasDiscount && (
            <p className="text-[10px] text-red-500 font-medium">−{fmt(discountAmt)}</p>
          )}
        </div>
      </div>

      {/* New (unsaved) item: simplified action row */}
      {isNew ? (
        <div className="mt-2 flex items-center gap-3">
          <span className="text-[10px] font-semibold text-[#10B981] uppercase tracking-wide">· new (unsaved)</span>
          {onCancelPending && (
            <button type="button" onClick={onCancelPending} className="text-[11px] font-semibold text-[#EF4444] hover:text-[#DC2626]">
              Cancel add
            </button>
          )}
        </div>
      ) : isPendingDelete ? (
        <div className="mt-2 flex items-center gap-3">
          <span className="text-[10px] font-semibold text-[#EF4444] uppercase tracking-wide">· will be removed</span>
          {onUndoDelete && (
            <button type="button" onClick={onUndoDelete} className="text-[11px] font-semibold text-[#6366F1] hover:text-[#4F46E5]">
              Undo
            </button>
          )}
        </div>
      ) : !discEditing && !fieldEditing ? (
        <div className="mt-2 flex items-center gap-3 flex-wrap">
          <button
            type="button"
            disabled={locked}
            onClick={() => setFieldEditing(true)}
            className="text-[11px] font-semibold text-[#6366F1] hover:text-[#4F46E5] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Edit item
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => setDiscEditing(true)}
            className="text-[11px] font-semibold text-[#6366F1] hover:text-[#4F46E5] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {hasDiscount ? 'Edit discount' : 'Add discount'}
          </button>
          {onRemove && (
            <button type="button" onClick={onRemove} className="text-[11px] font-semibold text-[#EF4444] hover:text-[#DC2626]">
              Remove
            </button>
          )}
          {hasEditDraft && (
            <>
              <span className="text-[10px] font-semibold text-[#F59E0B] uppercase tracking-wide">· edited (unsaved)</span>
              <button type="button" onClick={revertFieldEdit} className="text-[11px] text-[#9CA3C0] hover:text-[#1A1D2B]">
                Revert
              </button>
            </>
          )}
          {hasDraft && (
            <>
              <span className="text-[10px] font-semibold text-[#F59E0B] uppercase tracking-wide">· discount unsaved</span>
              <button type="button" onClick={revertDisc} className="text-[11px] text-[#9CA3C0] hover:text-[#1A1D2B]">
                Revert
              </button>
            </>
          )}
        </div>
      ) : fieldEditing ? (
        <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-wide">
              Quantity
              <input type="number" min="1" value={editQty} onChange={(e) => setEditQty(e.target.value)}
                className="w-full mt-1 h-8 px-2 rounded-[8px] border border-black/[0.06] bg-white text-[12px] text-[#1A1D2B] focus:border-[#6366F1] outline-none tabular-nums normal-case font-normal text-gray-900" />
            </label>
            <label className="text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-wide">
              Unit price ($)
              <input type="number" min="0" step="0.01" value={editPrice} onChange={(e) => setEditPrice(e.target.value)}
                className="w-full mt-1 h-8 px-2 rounded-[8px] border border-black/[0.06] bg-white text-[12px] text-[#1A1D2B] focus:border-[#6366F1] outline-none tabular-nums normal-case font-normal text-gray-900" />
            </label>
          </div>
          <label className="block text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-wide">
            Description
            <input type="text" value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
              className="w-full mt-1 h-8 px-2 rounded-[8px] border border-black/[0.06] bg-white text-[12px] text-[#1A1D2B] focus:border-[#6366F1] outline-none normal-case font-normal text-gray-900" />
          </label>
          {isCustom && (
            <div className="grid grid-cols-3 gap-2">
              <label className="text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-wide">
                Length (in)
                <input type="number" min="0" step="0.01" value={editDimL} onChange={(e) => setEditDimL(e.target.value)}
                  className="w-full mt-1 h-8 px-2 rounded-[8px] border border-black/[0.06] bg-white text-[12px] tabular-nums normal-case font-normal text-gray-900" />
              </label>
              <label className="text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-wide">
                Width (in)
                <input type="number" min="0" step="0.01" value={editDimW} onChange={(e) => setEditDimW(e.target.value)}
                  className="w-full mt-1 h-8 px-2 rounded-[8px] border border-black/[0.06] bg-white text-[12px] tabular-nums normal-case font-normal text-gray-900" />
              </label>
              <label className="text-[11px] font-semibold text-[#9CA3C0] uppercase tracking-wide">
                Height (in)
                <input type="number" min="0" step="0.01" value={editDimH} onChange={(e) => setEditDimH(e.target.value)}
                  className="w-full mt-1 h-8 px-2 rounded-[8px] border border-black/[0.06] bg-white text-[12px] tabular-nums normal-case font-normal text-gray-900" />
              </label>
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={applyFieldEdit}
              className="h-8 px-3 rounded-[8px] bg-[#6366F1] text-white text-[12px] font-semibold hover:bg-[#4F46E5]">
              Apply
            </button>
            <button type="button" onClick={() => setFieldEditing(false)}
              className="h-8 px-3 rounded-[8px] text-[#9CA3C0] text-[12px] font-medium hover:text-[#1A1D2B]">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2 pt-3 border-t border-gray-200">
          <select value={type} onChange={(e) => setType(e.target.value)}
            className="h-8 px-2 rounded-[8px] border border-black/[0.06] bg-white text-[12px] text-[#1A1D2B] focus:border-[#6366F1] outline-none">
            <option value="none">No discount</option>
            <option value="percentage">% off</option>
            <option value="fixed">$ off</option>
          </select>
          {type !== 'none' && (
            <input type="number" value={value} onChange={(e) => setValue(e.target.value)} min="0" step="0.01"
              className="h-8 w-24 px-2 rounded-[8px] border border-black/[0.06] bg-white text-[12px] text-[#1A1D2B] focus:border-[#6366F1] outline-none tabular-nums"
              placeholder={type === 'percentage' ? '%' : '$'} />
          )}
          <button type="button" onClick={stageDisc}
            className="h-8 px-3 rounded-[8px] bg-[#6366F1] text-white text-[12px] font-semibold hover:bg-[#4F46E5]">
            Apply
          </button>
          {hasDiscount && (
            <button type="button" onClick={clearDisc}
              className="h-8 px-3 rounded-[8px] bg-[#F4F6FA] text-[#6B7194] text-[12px] font-medium hover:bg-[#E9EBF2]">
              Clear
            </button>
          )}
          <button type="button"
            onClick={() => { setDiscEditing(false); setType(item._dt || 'none'); setValue(item._dv != null ? String(item._dv) : '0'); }}
            className="h-8 px-3 rounded-[8px] text-[#9CA3C0] text-[12px] font-medium hover:text-[#1A1D2B]">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify in browser**

Reload the partial-paid invoice page.
1. Click "Edit item" on a custom item — fields appear (qty, price, description, L/W/H).
2. Change qty 1 → 3, click Apply. Banner shows "1 edit". Live total updates.
3. Click "Revert" next to "edited (unsaved)" — fields snap back, banner clears.
4. Click "Remove" on a different item — line goes red with "will be removed" + "Undo".
5. Click "Undo" — row returns to normal.
6. Click "Edit item" on a fixed/manual item — only qty/price/description appear (no dimensions).
7. Try clicking "Edit item" on a fully-paid invoice — button is disabled.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/PickupDetail.jsx
git commit -m "feat(frontend): inline edit mode for line items (qty/price/description/dimensions)"
```

---

## Task 16: Add overpaid badge + hide Receive Payment when overpaid

**Files:**
- Modify: `frontend/src/pages/PickupDetail.jsx`

- [ ] **Step 1: Update the status badge**

Find the status pill (around line 465):
```jsx
<span className={`px-3 py-1 rounded-full text-xs font-medium
  ${pickup.status === 'cancelled' ? 'bg-red-100 text-red-700'
    : pickup.paymentStatus === 'paid' ? 'bg-green-100 text-green-700'
    : pickup.paymentStatus === 'partial' ? 'bg-blue-100 text-blue-700'
    : 'bg-amber-100 text-amber-700'}`}>
  {pickup.status === 'cancelled' ? 'cancelled' : pickup.paymentStatus}
</span>
```

Replace with:
```jsx
<span className={`px-3 py-1 rounded-full text-xs font-medium
  ${pickup.status === 'cancelled' ? 'bg-red-100 text-red-700'
    : pickup.paymentStatus === 'overpaid' ? 'bg-red-100 text-red-700'
    : pickup.paymentStatus === 'paid' ? 'bg-green-100 text-green-700'
    : pickup.paymentStatus === 'partial' ? 'bg-blue-100 text-blue-700'
    : 'bg-amber-100 text-amber-700'}`}>
  {pickup.status === 'cancelled' ? 'cancelled' : pickup.paymentStatus}
</span>
```

- [ ] **Step 2: Hide "Receive Payment" when overpaid**

Find the payment-actions section:
```jsx
{balanceDue > 0 && (
  <button onClick={() => setModal('PAYMENT')}
    className="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors">
    Receive Payment
  </button>
)}
{balanceDue > 0 && (
  <SquarePayButton invoiceId={id} balanceDue={balanceDue} />
)}
```

The `balanceDue = max(0, finalTotal - amountPaid)`, which is already 0 when overpaid — so Receive Payment hides automatically. **Verify**, no change needed. But add an Overpaid notice:

After the existing `{parseFloat(pickup.amountPaid) > 0 && (... Record Refund ...)}` block, add:
```jsx
{pickup.paymentStatus === 'overpaid' && (
  <div className="w-full px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
    <strong>Overpaid by ${(parseFloat(pickup.amountPaid) - parseFloat(pickup.finalTotal)).toFixed(2)}.</strong>{' '}
    Issue a refund to bring this invoice back to a clean state.
  </div>
)}
```

- [ ] **Step 3: Verify in browser**

Pick a partial-paid invoice with no remaining balance unrelated. Stage line edits that drop the total below `amountPaid`. The banner now shows the predicted total — but the actual badge won't change until save (Task 17 wires that up).

For now manually inject overpaid state via psql:
```sql
UPDATE invoices SET payment_status = 'overpaid' WHERE id = '<PARTIAL_ID>';
```

Reload. Expected: red "overpaid" badge, red overpaid notice in payment-actions, "Receive Payment" hidden, "Record Refund" visible.

Restore:
```sql
UPDATE invoices SET payment_status = 'partial' WHERE id = '<PARTIAL_ID>';
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/PickupDetail.jsx
git commit -m "feat(frontend): overpaid badge + notice on PickupDetail"
```

---

## Task 17: Wire up saveDrafts to apply all draft types + overpayment confirm

**Files:**
- Modify: `frontend/src/pages/PickupDetail.jsx`

- [ ] **Step 1: Replace `saveDrafts`**

Find `const saveDrafts = async () => {` (around line 51). Replace with:

```jsx
const saveDrafts = async () => {
  // Overpayment guard: if predicted final total drops below current amountPaid,
  // require explicit confirmation before saving.
  const preview = computePreview();
  const predictedFinal = preview.finalTotal;
  const paid = parseFloat(pickup.amountPaid) || 0;
  if (predictedFinal < paid - 0.01) {
    const overpayBy = paid - predictedFinal;
    const ok = window.confirm(
      `This will lower the total to $${predictedFinal.toFixed(2)}, which is ` +
      `$${overpayBy.toFixed(2)} less than the $${paid.toFixed(2)} already paid. ` +
      `The invoice will be marked OVERPAID until you record a refund. Continue?`
    );
    if (!ok) return;
  }

  setSavingDrafts(true);
  try {
    let lastPickup = null;

    // 1. Apply line edits
    for (const [lineId, delta] of Object.entries(draftLineEdits)) {
      const payload = {};
      if (delta.quantity !== undefined) payload.quantity = delta.quantity;
      if (delta.basePrice !== undefined) payload.base_price = delta.basePrice;
      if (delta.description !== undefined) payload.description = delta.description;
      if (delta.dimensionsL !== undefined || delta.dimensionsW !== undefined || delta.dimensionsH !== undefined) {
        payload.dimensions = {
          length: delta.dimensionsL,
          width: delta.dimensionsW,
          height: delta.dimensionsH,
        };
      }
      const res = await axios.patch(`/api/v1/pickups/${id}/items/${lineId}`, payload);
      lastPickup = res.data.data;
    }

    // 2. Apply line deletes
    for (const lineId of draftLineDeletes) {
      const res = await axios.delete(`/api/v1/pickups/${id}/items/${lineId}`);
      lastPickup = res.data.data;
    }

    // 3. Apply line adds
    for (const item of draftLineAdds) {
      const payload = {
        type: item.type,
        description: item.description,
        quantity: item.quantity,
        base_price: item.base_price,
        catalogItemId: item.catalogItemId,
        catalogName: item.catalogName,
        dimensions: item.dimensions,
        photos: item.photos,
      };
      const res = await axios.post(`/api/v1/pickups/${id}/items`, payload);
      lastPickup = res.data.data;
    }

    // 4. Apply line-item discount drafts
    for (const [liId, payload] of Object.entries(draftLineDiscounts)) {
      const res = await axios.patch(`/api/v1/pickups/${id}/items/${liId}/discount`, payload);
      lastPickup = res.data.data;
    }

    // 5. Apply invoice-level discount draft
    if (draftInvoiceDiscount) {
      const res = await axios.patch(`/api/v1/pickups/${id}/discount`, draftInvoiceDiscount);
      lastPickup = res.data.data;
    }

    if (lastPickup) setPickup(lastPickup);
    discardDrafts();
  } catch (err) {
    console.error('Save drafts error:', err);
    const status = err.response?.status;
    const code = err.response?.data?.error?.code;
    const msg = err.response?.data?.error?.message || err.message || 'Unknown error';
    if (code === 'INVOICE_LOCKED') {
      toast.error('Invoice was paid in full while you were editing. Refresh to see latest state.');
    } else if (code === 'INVOICE_CANCELLED') {
      toast.error('Invoice was cancelled while you were editing. Reloading...');
      await loadPickup();
    } else if (code === 'EMPTY_INVOICE') {
      toast.error('An invoice must keep at least one item. To remove all items, cancel the invoice instead.');
    } else {
      toast.error(`Failed to save changes (HTTP ${status || 'net-err'}): ${msg}`);
    }
  } finally {
    setSavingDrafts(false);
  }
};
```

(Note: the prior code uses `toast.success` for errors — that was a bug. This version uses `toast.error`.)

- [ ] **Step 2: Verify build**

```bash
cd frontend && npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Manual end-to-end browser test**

Run through the full test plan (matching the spec's "Frontend manual test plan"):

1. **Unpaid invoice** — open `/pickups/<unpaid-id>`. Edit qty on an existing item, edit price on another, change a description, add a catalog item, add a custom item with one photo, mark another item for delete. Banner should show "3 edits · 1 removal · 2 new items" (or whatever). Click Save Changes. Expect: invoice reloads with all changes applied, banner gone, no toasts.

2. **Partial-paid invoice** — same flow. Verify lock NOT applied (Edit / Remove buttons enabled).

3. **Overpayment confirm** — on a partial invoice where `amountPaid > 0`, edit qty / price down so the predicted total is less than `amountPaid`. Click Save Changes. Expect: confirm dialog appears with the overpayment amount. Cancel → banner stays dirty, no save. Save → invoice saves, status shows "overpaid", red badge, red notice.

4. **Record refund on overpaid** — click Record Refund, refund the overpayment delta. Expect: paymentStatus returns to "paid" or "partial".

5. **Fully-paid invoice** — open. "Edit item" / "Add item" / "Remove" / "Edit discount" all disabled or hidden. Direct API call returns 403:
   ```bash
   curl -X PATCH http://localhost:4100/api/v1/pickups/<PAID_ID>/items/<ITEM_ID> \
     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d '{"quantity":99}' -i
   ```
   Expect: 403 INVOICE_LOCKED.

6. **Cancelled invoice** — same lock applies (test by making an invoice cancelled if you have one).

7. **Last-item delete** — on an invoice with one item, mark for delete + try save. Expect: toast "An invoice must keep at least one item..." and banner stays dirty.

8. **Concurrency test** — open the same invoice in two tabs.
   - Tab A: receive a full payment via the payment modal.
   - Tab B: stage a line edit, click Save Changes. Expect: 403 toast "Invoice was paid in full while you were editing...", banner preserved.

9. **CreateInvoice still works** — go through the create-invoice flow end to end (catalog + custom + manual + photo + submit). New invoice should appear correctly with all items.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/PickupDetail.jsx
git commit -m "feat(frontend): unified saveDrafts handles edits/deletes/adds/discounts; warn on overpayment"
```

---

## Task 18: Add lastEditedAt display to sidebar

**Files:**
- Modify: `frontend/src/pages/PickupDetail.jsx`

- [ ] **Step 1: Add Last edited line in the Details card**

Find the Details card (around line 711):
```jsx
<div className="space-y-2 text-sm">
  <div className="flex justify-between"><span className="text-gray-500">Date</span><span>{new Date(pickup.createdAt).toLocaleDateString()}</span></div>
  <div className="flex justify-between"><span className="text-gray-500">Items</span><span>{pickup.originalItemCount}{pickup.addedItemCount > 0 ? `+${pickup.addedItemCount}` : ''}</span></div>
  <div className="flex justify-between"><span className="text-gray-500">Last Method</span><span>{pickup.paymentMethod || 'N/A'}</span></div>
</div>
```

Insert below "Date":
```jsx
{pickup.lastEditedAt && new Date(pickup.lastEditedAt) > new Date(pickup.createdAt) && (
  <div className="flex justify-between"><span className="text-gray-500">Last edited</span><span>{new Date(pickup.lastEditedAt).toLocaleDateString()}</span></div>
)}
```

- [ ] **Step 2: Manually verify**

Reload a recently-edited invoice — the "Last edited" row should show. Reload an untouched invoice — no row.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/PickupDetail.jsx
git commit -m "feat(frontend): show lastEditedAt in invoice details card"
```

---

## Task 19: Run backfill on prod & deploy

**Files:**
- (none — this is a deployment task)

- [ ] **Step 1: Verify all commits are on main locally**

```bash
git log --oneline origin/main..HEAD
```

Expected: a clean stack of the commits from this plan (Tasks 1-18).

- [ ] **Step 2: Push to GitHub**

```bash
git push origin main
```

Railway auto-deploys both `gcgl-admin-backend` and `gcgl-admin-frontend` from `main`.

- [ ] **Step 3: Watch Railway logs for both services**

Open Railway dashboard. Confirm both services build cleanly and become healthy. Look for any startup errors mentioning `invoiceLock` or `invoicePaymentStatus`.

- [ ] **Step 4: Run backfill on prod**

In the Railway dashboard, open a shell on `gcgl-admin-backend`:
```bash
node scripts/backfill-overpaid-status.js
```

Expected: scanned count + updated count. On a healthy prod DB, updated should be 0 (no overpaid invoices yet). If non-zero, the script logs which invoices were corrected.

- [ ] **Step 5: Manual smoke test on prod**

Open the prod admin URL, log in, walk through the partial-paid edit flow once with a low-stakes invoice. Don't actually save destructive changes — discard from the banner.

- [ ] **Step 6: Update memory**

Update the GCGL admin memory entry to note the new editable-when-not-fully-paid behavior. (Hand off to the user — this is a chat-driven memory update, not a code change.)

---

## Self-Review Checklist (run before handing off)

- [ ] Every spec section has at least one task implementing it (lock helper, payment status enum + recalc, broadened add endpoint, new patch endpoint, EMPTY_INVOICE invariant, lastEditedAt, frontend picker extraction, draft state, lock condition, overpaid UI, confirm dialog, unified save, backfill).
- [ ] No "TBD", "TODO", or "implement later" anywhere in the plan.
- [ ] Type / function name consistency: `assertEditable`, `computePaymentStatus`, `recalculatePaymentStatus`, `EPSILON`, `LineItemPicker`, `stageNewItem`, `stageLineEdit`, `clearLineEdit`, `removePendingAdd`, `undoDelete`. Every reference matches its definition task.
- [ ] Every code-changing step shows the actual code, not a description of what the code should do.
- [ ] Every backend task has a `curl` or `node -e` verification.
- [ ] Every frontend task involving UI has a browser verification step.
- [ ] Frequent commits — one per task minimum.
