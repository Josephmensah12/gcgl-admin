# Packing List — "Do Not Deliver" Banner for Unpaid Invoices

## Problem

Drivers and warehouse staff use the printed packing list to release shipments to recipients. There is currently no visual indication on the packing list when the invoice still has an outstanding balance, so partially-paid or unpaid shipments can be delivered without the driver realising payment is still owed.

## Goal

Show a single, unmissable warning at the top of every printed packing list whose invoice is not paid in full. The dollar amount must NOT appear on the printed sheet (driver / recipient should not see balance details).

## Scope

- Affects the shared `PackingListSheet` component in `frontend/src/pages/PackingList.jsx`.
- Covers both routes that render it:
  - Single-invoice packing list — `/pickups/:id/packing-list` (`PackingList.jsx` default export)
  - Bulk shipment packing lists — `/shipments/:id/packing-lists` (`ShipmentPackingLists.jsx`, which imports `PackingListSheet`)
- No backend changes. Invoice already returns `finalTotal` and `amountPaid`.
- Out of scope: the invoice / receipt print view (`InvoicePrint.jsx`), any UI change to the in-app pickup detail screen, any change to `paymentStatus` semantics, any "paid in full" confirmation banner.

## Detection rule

```
balance = max(0, parseFloat(invoice.finalTotal || 0) - parseFloat(invoice.amountPaid || 0))
showBanner = balance > 0.01
```

This matches the convention already used in `backend/services/emailService.js` for outstanding-balance treatment. Driving off the live `finalTotal − amountPaid` math (rather than the `paymentStatus` string) keeps the banner correct even if `paymentStatus` drifts from the actual amounts.

## Visual design

A full-width banner inserted above the existing `.ps-header` block so it is the first content on the printed page.

- Background: `#DC2626` (saturated red)
- Text: `DO NOT DELIVER — BALANCE PENDING`
- Color: white
- Weight: 800, uppercase, letter-spacing ~0.08em
- Padding: 12px vertical, full sheet width (matches `.packing-sheet` content width)
- Centered horizontally
- No dollar amount, no invoice number, no other context — single line only

The banner must survive print:

```css
.ps-unpaid-banner {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
```

This is required because Chrome (and most browsers) strip background colors from prints by default; without the override the banner would print as black text on white and lose all urgency.

## Implementation outline

Two files change.

### 1. `frontend/src/pages/PackingList.jsx`

Inside `PackingListSheet`, compute the balance and render the banner conditionally as the first child of `.packing-sheet`:

```jsx
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
    {/* existing header, parties, table, signatures, footer unchanged */}
  </div>
);
```

### 2. `frontend/src/index.css`

Add `.ps-unpaid-banner` styles alongside the existing `.ps-*` packing-sheet rules.

## Edge cases

- **Cancelled invoices** — out of scope here. A cancelled invoice would not normally have a packing list printed; if it does, the banner condition still works (cancelled with no payment will show the banner, which is arguably correct — do not deliver a cancelled order).
- **Overpayment** (`amountPaid > finalTotal`) — `Math.max(0, ...)` returns 0, so no banner. Correct.
- **`finalTotal == 0`** (zero-value invoice) — balance is 0, no banner. Correct.
- **Bulk print** — each `PackingListSheet` evaluates its own invoice independently inside `ShipmentPackingLists.jsx`, so a mixed shipment will correctly stamp only the unpaid ones.
