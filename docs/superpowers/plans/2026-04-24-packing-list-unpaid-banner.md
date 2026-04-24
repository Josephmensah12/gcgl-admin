# Packing List "Do Not Deliver" Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a full-width red `DO NOT DELIVER — BALANCE PENDING` banner at the top of every printed packing list whose invoice still has an outstanding balance (`finalTotal − amountPaid > 0.01`). No dollar amount on the printed sheet.

**Architecture:** Single shared component change. `PackingListSheet` in `frontend/src/pages/PackingList.jsx` is reused by both the single-invoice route and the bulk shipment route, so one conditional + one CSS rule covers both. Detection is a pure derivation from `invoice.finalTotal` and `invoice.amountPaid` already on the response — no backend, API, or model change.

**Tech Stack:** React 19, Vite, plain CSS (no Tailwind for the print stylesheet — `.ps-*` classes live in `src/index.css`).

**On testing:** `gcgl-admin/frontend` has no test framework configured (no Vitest, no React Testing Library, no `tests/` dir). Adding one to verify a conditional `<div>` would be scope creep and is explicitly out of scope. Verification is via the dev server + browser print preview, per the project's UI-change workflow. The verification steps below are not optional — they are how this change is signed off.

**Spec:** `docs/superpowers/specs/2026-04-24-packing-list-unpaid-banner-design.md`

---

## File Map

- **Modify:** `frontend/src/pages/PackingList.jsx` — add `balance` derivation + conditional `<div className="ps-unpaid-banner">` as first child of `.packing-sheet` inside `PackingListSheet`.
- **Modify:** `frontend/src/index.css` — add `.ps-unpaid-banner` rule next to the existing `.packing-sheet` / `.ps-header` rules (around line 335).

No new files. No backend. No package changes.

---

## Task 1: Add the banner

**Files:**
- Modify: `frontend/src/pages/PackingList.jsx` (function `PackingListSheet`, currently lines 10–133)
- Modify: `frontend/src/index.css` (add rule after `.packing-sheet` block, currently around line 334)

- [ ] **Step 1: Add the CSS rule**

In `frontend/src/index.css`, immediately after the closing `}` of the `.packing-sheet` block (currently line 334) and before the `.ps-header` block (currently line 336), insert:

```css
.ps-unpaid-banner {
  background: #DC2626;
  color: #FFFFFF;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  text-align: center;
  padding: 12px 16px;
  margin: -18mm -16mm 16px -16mm; /* bleed to the sheet edges, then re-pad above the header */
  font-size: 13pt;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
```

The negative margins extend the banner to the full sheet width by undoing `.packing-sheet`'s `padding: 18mm 16mm`. The `print-color-adjust: exact` pair forces the red background to print on Chrome/Edge/Safari, which strip backgrounds by default.

- [ ] **Step 2: Add the conditional banner in `PackingListSheet`**

In `frontend/src/pages/PackingList.jsx`, replace the current opening of `PackingListSheet` (lines 10–14):

```jsx
export function PackingListSheet({ invoice, shipmentName, company }) {
  const totalItems = (invoice.lineItems || []).reduce((sum, li) => sum + (parseInt(li.quantity) || 1), 0);

  return (
    <div className="packing-sheet">
```

with:

```jsx
export function PackingListSheet({ invoice, shipmentName, company }) {
  const totalItems = (invoice.lineItems || []).reduce((sum, li) => sum + (parseInt(li.quantity) || 1), 0);
  const balance = Math.max(
    0,
    (parseFloat(invoice.finalTotal) || 0) - (parseFloat(invoice.amountPaid) || 0)
  );
  const isUnpaid = balance > 0.01;

  return (
    <div className="packing-sheet">
      {isUnpaid && (
        <div className="ps-unpaid-banner">DO NOT DELIVER — BALANCE PENDING</div>
      )}
```

Nothing else in the file changes. The closing `</div>` of `.packing-sheet` is already at line 131 — leave it alone.

- [ ] **Step 3: Start the dev server**

Run from `gcgl-admin/frontend`:

```bash
npm run dev
```

Expected: Vite serves on `http://localhost:5173`. Open the app and log in.

- [ ] **Step 4: Verify the banner appears for an unpaid invoice (in-app)**

Find an invoice with an outstanding balance. The Pickups list shows payment status — pick any pickup whose status is `unpaid` or `partial`, OR open the DB and run:

```sql
SELECT invoice_number, final_total, amount_paid, payment_status
  FROM invoices
 WHERE (final_total - amount_paid) > 0.01
 ORDER BY created_at DESC
 LIMIT 5;
```

Pick one of those `invoice_number` values. Navigate to:

```
http://localhost:5173/pickups/<invoice-id>/packing-list
```

Expected: The packing sheet renders with a red full-width banner at the very top reading `DO NOT DELIVER — BALANCE PENDING` in white uppercase bold. The banner sits above the `Gold Coast Global Logistics / Packing List` header. **No dollar amount visible anywhere.**

- [ ] **Step 5: Verify the banner does NOT appear for a paid invoice (in-app)**

Find a paid invoice (`payment_status = 'paid'` and `amount_paid >= final_total`). Navigate to its packing list at the same URL pattern.

Expected: NO red banner. The packing sheet header is the first content on the page, exactly as it was before this change.

- [ ] **Step 6: Verify in print preview (the actual deliverable)**

This is the critical check — the banner must survive print rendering, which strips background colors by default.

Still on the unpaid packing list page: press `Ctrl+P` (Cmd+P on macOS) to open the browser print dialog.

Expected: The print preview shows the red banner with white text. If the banner appears as black text on white, the `print-color-adjust: exact` rule is missing or wrong — return to Step 1.

Then open the paid packing list, `Ctrl+P` again. Expected: no banner in print preview.

- [ ] **Step 7: Verify the bulk shipment view**

Find a shipment that has at least one unpaid invoice and at least one paid invoice assigned to it. Find a shipment id (e.g. via the Shipments page) and navigate to:

```
http://localhost:5173/shipments/<shipment-id>/packing-lists
```

Expected: Each invoice's sheet is paginated as before. Sheets for unpaid invoices show the red banner; sheets for paid invoices do not. Open print preview and confirm the same.

- [ ] **Step 8: Edge case — overpayment / zero invoice**

In the DB, briefly check for any invoice where `amount_paid > final_total` (refund pending) or `final_total = 0`. If any exist, navigate to its packing list. Expected: no banner (the `Math.max(0, ...)` clamp handles overpayment; `final_total = 0` produces balance 0).

If no such invoice exists, skip — the math is provably correct without a live row to test against.

- [ ] **Step 9: Commit**

From `gcgl-admin/`:

```bash
git add frontend/src/pages/PackingList.jsx frontend/src/index.css
git commit -m "feat: 'do not deliver' banner on unpaid packing lists

Adds a full-width red 'DO NOT DELIVER - BALANCE PENDING' banner at the
top of any packing list whose invoice has an outstanding balance
(finalTotal - amountPaid > 0.01). Banner uses print-color-adjust:exact
so the red background survives Chrome's default print settings. No
dollar amount is shown on the printed sheet.

Single shared PackingListSheet component covers both the per-invoice
route and the bulk shipment route."
```

- [ ] **Step 10: Push when ready**

`gcgl-admin` auto-deploys from `main` on Railway. Once you (the human reviewer) are satisfied with the in-browser checks above, run `git push origin main` to ship. **Do not push automatically** — the user pushes when they're ready.

---

## Done

Single feature, single commit, verified in browser + print preview on both routes (paid + unpaid + bulk).
