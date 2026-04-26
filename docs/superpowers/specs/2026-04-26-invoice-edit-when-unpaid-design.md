# Invoice Edits When Not Fully Paid — Design

**Date:** 2026-04-26
**Status:** Approved (pending implementation)
**Repo:** gcgl-admin

## Goal

Let users edit any aspect of an invoice's items and discounts as long as payment has not been fully made. Today the frontend partially permits this (line-item discounts, add-service-item, remove-item) but:

1. The backend has no payment-status guard — the API would accept edits even on fully-paid invoices.
2. Existing line items can't be edited at all (no UI or endpoint for changing quantity, unit price, description, or dimensions).
3. The "add item" flow on an existing invoice is service-only — users can't add catalog or custom volumetric items post-creation.
4. The lock rule is brittle (relies on `paymentStatus === 'paid'`) and can't represent the overpaid state that an edit-lower-than-paid scenario will create.

## Scope

### In scope
- **Lock rule:** an invoice is editable when `amountPaid < finalTotal - 0.01` OR `amountPaid > finalTotal + 0.01` (i.e. not fully paid). Cancelled invoices stay locked.
- **Edit existing line items:** quantity, unit price (`basePrice`), description, dimensions (custom items only). No photo edits.
- **Add line items:** full parity with the creation flow — service, catalog (`type: 'fixed'`), custom volumetric (`type: 'custom'`), manual (`type: 'manual'`). Photos supported on add.
- **Remove line items:** unchanged behavior, but with the new invariant that an invoice must keep at least one item (use the cancel flow to fully empty an invoice).
- **Backend enforcement:** every line-item / discount endpoint asserts the lock rule.
- **New `'overpaid'` payment status** for the case where edits drop the total below `amountPaid`.
- **Warn-and-proceed** UX when an edit would put the invoice in the overpaid state.

### Out of scope
- Customer / recipient / shipment edits stay always-editable (unchanged).
- Per-field edit history / audit log. Only `lastEditedAt` timestamp is wired.
- Bulk edits across multiple invoices.
- Photo edits on existing line items.
- Role-based gating. All authenticated users can edit, matching existing `authenticate`-only endpoints.

## Architecture

### Lock helper

`backend/utils/invoiceLock.js`:

```js
const { AppError } = require('../middleware/errorHandler');

function assertEditable(invoice) {
  if (invoice.status === 'cancelled') {
    throw new AppError('Cancelled invoices cannot be edited', 400, 'INVOICE_CANCELLED');
  }
  const total = parseFloat(invoice.finalTotal) || 0;
  const paid = parseFloat(invoice.amountPaid) || 0;
  if (paid >= total - 0.01 && paid <= total + 0.01) {
    throw new AppError(
      'Fully-paid invoices cannot be edited. Issue a refund to unlock.',
      403,
      'INVOICE_LOCKED'
    );
  }
}

module.exports = { assertEditable };
```

The lock gates on `amountPaid ≈ finalTotal` (not `paymentStatus === 'paid'`), which means an *overpaid* invoice (paid > total) stays editable — this is what makes the warn-and-proceed flow recoverable.

### `paymentStatus` values

Existing: `'unpaid'`, `'partial'`, `'paid'`. New: `'overpaid'`.

```
unpaid    paid = 0
partial   0 < paid < total - epsilon
paid      total - epsilon <= paid <= total + epsilon
overpaid  paid > total + epsilon
```

Where `epsilon = 0.01` (cents tolerance).

A new helper `recalculatePaymentStatus(invoice)` lives alongside `recalculateInvoiceTotals` in `transactionController.js` (or extracted to `backend/utils/invoicePaymentStatus.js`). Called from:
- `Invoice.recalculateTotals` (already runs after every line-item / discount mutation)
- `transactionController.recalculateInvoiceTotals` (already runs after payment / refund / void)

### Backend endpoint changes

| Endpoint | Action |
| --- | --- |
| `POST /pickups/:id/items` | Add `assertEditable`. Broaden payload to accept `type ∈ {service, fixed, custom, manual}`, `catalogItemId`, `dimensions`, `photos[]`. |
| `PATCH /pickups/:id/items/:itemId` | **NEW.** Update `quantity`, `basePrice`, `description`, `dimensionsL/W/H`. `assertEditable` + recalc + bump `lastEditedAt`. |
| `DELETE /pickups/:id/items/:itemId` | Add `assertEditable`. After delete, if zero items remain, return 400 `EMPTY_INVOICE`. |
| `PATCH /pickups/:id/discount` | Add `assertEditable`. |
| `PATCH /pickups/:id/items/:itemId/discount` | Add `assertEditable`. |
| `PUT /pickups/:id` | No change. Customer/recipient/shipment stay always-editable. |

`Invoice.lastEditedAt` is bumped on every line-item or discount mutation. The field already exists on the model and is currently unused.

### Frontend changes

**Extract `LineItemPicker`** — `frontend/src/components/LineItemPicker.jsx`:
- Lifts the items-step UI from `CreateInvoice.jsx`: catalog / custom / manual sub-tabs plus photo capture.
- Self-contained: loads `/api/v1/create-invoice/catalog`, manages its own form state.
- Emits picked items via `onAdd(item)` callback. Item shape matches what `CreateInvoice` builds today: `{ type, catalogItemId?, catalogName?, description, quantity, basePrice, dimensions?, photos[] }`.
- `CUBIC_RATE = 0.0105` lives in this component (single source of truth, removes the duplicate constant in `CreateInvoice.jsx`).
- `CreateInvoice.jsx` refactored to use `<LineItemPicker onAdd={...} />`. No behavior change to the creation flow.

**`PickupDetail.jsx` integration:**
- Replace `AddServiceItem` with `<LineItemPicker onAdd={stageNewItem} />`. Collapsed behind an "+ Add Item" button.
- `LineItemRow` gets a new "Edit item" inline mode for quantity / unit price / description / dimensions (separate from the existing discount editor). Apply stages to draft. Cancel reverts.
- Lock condition flips from `pickup.paymentStatus === 'paid'` to:
  ```js
  const isLocked = pickup.status === 'cancelled' ||
    Math.abs(pickup.amountPaid - pickup.finalTotal) < 0.01;
  ```
  Mirrors backend `assertEditable` exactly. (A $0 / $0 invoice would lock by this rule, but the new `EMPTY_INVOICE` check prevents an invoice from ever reaching that state.)
- `onRemove` stages a delete instead of immediate `DELETE`.

**Unified draft state** — extends the existing pattern:

```js
const [draftLineDiscounts, setDraftLineDiscounts] = useState({});       // existing
const [draftInvoiceDiscount, setDraftInvoiceDiscount] = useState(null); // existing
const [draftLineEdits, setDraftLineEdits]    = useState({}); // NEW: { [lineId]: { quantity?, basePrice?, description?, dimensionsL?, dimensionsW?, dimensionsH? } }
const [draftLineDeletes, setDraftLineDeletes] = useState(new Set()); // NEW
const [draftLineAdds, setDraftLineAdds]      = useState([]); // NEW
```

`isDirty` extended to include all five. `computePreview()` extended to:
- skip items in `draftLineDeletes`
- apply field overrides from `draftLineEdits`
- append `draftLineAdds`

The sticky banner already exists. Its summary text expands: e.g. "3 edits · 1 new item · 2 discount changes".

**`saveDrafts()` order** (sequential; each result updates pickup):

1. Apply line edits — `PATCH /items/:itemId`
2. Apply line deletes — `DELETE /items/:itemId`
3. Apply line adds — `POST /items`
4. Apply line-item discounts — `PATCH /items/:itemId/discount`
5. Apply invoice-level discount — `PATCH /discount`

If any step fails, the banner stays dirty with what's left, and a toast surfaces the error. Same model as the existing discount-draft save path.

**Overpayment confirm flow:**

```js
const predictedFinal = computePreview().finalTotal;
const paid = parseFloat(pickup.amountPaid) || 0;
if (predictedFinal < paid - 0.01) {
  const overpayBy = paid - predictedFinal;
  const ok = window.confirm(
    `This will lower the total to $${predictedFinal.toFixed(2)}, which is ` +
    `$${overpayBy.toFixed(2)} less than the $${paid.toFixed(2)} already paid. ` +
    `The invoice will be marked OVERPAID until you record a refund. Continue?`
  );
  if (!ok) return; // banner stays dirty
}
// proceed with saveDrafts()
```

**`'overpaid'` UI:** red badge alongside the existing payment-status pill. "Receive Payment" button hides; "Record Refund" stays prominent so the next step is obvious.

## Data flow

### Happy path: edit qty on a partial-paid invoice

```
User clicks "Edit item" on a line
  → LineItemRow enters edit mode, fields populated from current values
User changes qty 2 → 3, clicks Apply
  → draftLineEdits[id] = { quantity: 3 }
  → Sticky banner appears: "1 edit"
  → computePreview() recalculates totals using draft values
  → UI shows new subtotal/total/balance live
User clicks "Save Changes"
  → PATCH /pickups/:id/items/:itemId { quantity: 3 }
  → Backend: assertEditable → ok (partial), update line,
    recalculateTotals (which updates paymentStatus), lastEditedAt = now
  → Response: full invoice with fresh totals + new paymentStatus
  → Frontend: setPickup(response), discardDrafts()
  → Banner disappears
```

### Edit that drops total below `amountPaid`

```
User edits item, clicks Save Changes
  → predictedFinal < amountPaid → confirm dialog
  → User accepts → saveDrafts() proceeds
  → Backend: PATCH succeeds, recalculateTotals →
    finalTotal = $30, amountPaid = $50, paymentStatus = 'overpaid'
  → Frontend: red "Overpaid by $20" badge, Record Refund prominent
User clicks Record Refund, refunds $20
  → POST /invoices/:id/transactions { transaction_type: 'REFUND', amount: 20 }
  → Backend: amountPaid = $30, paymentStatus = 'paid' (now exactly equal)
  → Invoice now locked again (paid ≈ total). Further edits require another refund.
```

### Concurrency: payment lands while user is editing

```
User has unsaved drafts on a partial invoice
Square webhook fires → invoice flips to 'paid'
User clicks Save Changes
  → PATCH /items/:itemId
  → Backend: assertEditable → throws 403 INVOICE_LOCKED
  → Frontend: toast "Invoice was paid in full while you were editing.
    Refresh to see latest state." Banner stays dirty so drafts aren't lost.
```

## Error surfaces

| Backend code | HTTP | Frontend behavior |
| --- | --- | --- |
| `INVOICE_LOCKED` | 403 | Toast: "Invoice was paid in full while you were editing. Refresh to see latest state." Banner stays dirty so drafts aren't lost. |
| `INVOICE_CANCELLED` | 400 | Toast + reload pickup. |
| `EMPTY_INVOICE` | 400 | Toast: "An invoice must keep at least one item. To remove all items, cancel the invoice instead." |
| `VALIDATION_ERROR` | 400 | Toast with field message. |
| Network / 5xx | — | Generic toast, banner stays dirty for retry. |

## Testing

### Backend — `backend/tests/invoiceEdit.test.js` (new)
- `assertEditable` rejects on cancelled, rejects on paid (paid ≈ total), allows on unpaid / partial / overpaid.
- `recalculatePaymentStatus`: covers all four branches (unpaid / partial / paid / overpaid) including floating-point tolerance.
- `POST /pickups/:id/items` with `type: 'fixed'` + `catalogItemId` — creates correct line + recomputes totals.
- `POST /pickups/:id/items` with `type: 'custom'` + dimensions + photos — creates line and `Photo` rows.
- `PATCH /pickups/:id/items/:itemId` — quantity change recomputes totals; price change recomputes; description-only change leaves totals unchanged.
- `DELETE /pickups/:id/items/:itemId` — last-item delete returns 400 `EMPTY_INVOICE`.
- Lock guard: each edit endpoint returns 403 `INVOICE_LOCKED` when invoice is fully paid.
- Edit lowering total below `amountPaid` — succeeds, transitions paymentStatus to `'overpaid'`.
- Refund issued on overpaid invoice — paymentStatus returns to `'paid'` or `'partial'` correctly.

### Frontend — manual browser test plan
1. Unpaid invoice — edit qty / price / description on existing item, add catalog item, add custom item with photos, remove an item; save batched. Verify totals + DB.
2. Partial-paid invoice — same flows. Verify lock NOT applied.
3. Edit partial-paid so total drops below paid → confirm dialog appears; accept → invoice shows "Overpaid" red badge, Receive Payment hidden, Record Refund prominent.
4. Issue refund on overpaid invoice → badge returns to "Partial" or "Paid".
5. Fully-paid invoice — Edit / Add / Remove buttons disabled or hidden; direct API call returns 403.
6. Cancelled invoice — same lock applies.
7. Try to delete the last line item → toast tells user to cancel the invoice.
8. Overlap test: open invoice in two tabs, fully pay in tab A, save edit from tab B → 403 toast, banner preserved.
9. Verify `CreateInvoice.jsx` post-refactor still works end-to-end (catalog / custom / manual + photos + submit).

## Migration / rollout

- **No schema changes.** `paymentStatus` is a string field — `'overpaid'` is just a new value.
- **Backfill:** any existing invoice with `amountPaid > finalTotal + 0.01` should get `paymentStatus = 'overpaid'`. One-off script `backend/scripts/backfill-overpaid-status.js`. Best-effort, idempotent — none expected today, safe to run.
- **Single PR, single deploy.** No feature flag.
- The new lock rule is strictly more permissive than today (today: locked at `paymentStatus === 'paid'`; new: locked only when `amountPaid ≈ finalTotal`). Existing fully-paid invoices stay locked; partial-paid invoices gain editability they did not have backend-enforced before (frontend already permitted some of this).

## Open questions

None at design time. Implementation will surface decisions about the inline-edit field layout (mobile responsiveness, dimensions field grouping for custom items), but those are tactical and don't affect the design.
