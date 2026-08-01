# Product save fix + Factory Profit & Loss report

## 1. Product edit: save happens before confirmation

Current behaviour (confirmed in `src/components/product-form.tsx` and `src/hooks/use-unsaved-changes.ts`):
pressing "Save changes" writes the product, then navigates to `/products`. The unsaved-changes guard
still sees the form as dirty at that moment (the "saved" flag is React state, not yet applied), so the
router blocker fires and shows the "Unsaved changes" dialog *after* the save already succeeded.
Pressing "Save" in that dialog runs the save a second time, which is where the duplicate error comes from.

Fix:
- Track the saved/clean state in a ref that is set synchronously right before navigating, so the guard
  is no longer active when the post-save navigation runs.
- Also treat the form as non-dirty while a save is in progress, so no dialog can appear mid-save.
- Make the guard's save path idempotent: if a save already completed, "Save" in the dialog just
  proceeds instead of re-submitting.

Result: nothing is written until the explicit final Save command, the confirmation dialog only appears
when leaving with real unsaved changes, and no duplicate-key error.

## 2. New submenu: Production → Profit & Loss

New route `src/routes/_authenticated/production.profit-loss.tsx`, added to the Production menu in
`src/components/app-shell.tsx` under permission `production.reports.view`.

Report content, for a chosen date range (with quick presets: Today, This week, This month, Custom):

- Summary cards: Materials consumed (cost), Production output (value), Transferred to showrooms (value),
  Overheads, Wastage loss, Net profit/loss with margin %.
- Materials consumed table: material, quantity with unit, cost.
- Production output table: product, quantity produced, unit cost, total cost, valuation.
- Transfers table: destination showroom, product, quantity, valuation.
- Wastage/damage table for the same range.

Data sources (all existing tables): `raw_stock_ledger` for consumption, `stock_ledger` (kind
`production`) for output, `transfers`/`transfer_items` for showroom dispatch, `production_overheads`
for overheads, `wastage_log`/`damaged_ledger` for losses, `recipes` + `raw_materials` for costing,
`products.price` for valuation.

Profit formula used: transferred/produced value (at product price) − material cost − overheads − wastage
cost. Both "produced" and "transferred" valuations are shown so the number matching your example
(6000 transferred − 5000 cost = 1000 profit) is visible.

## 3. Print and PDF export

- A print/PDF layout with a proper header: company name, address, phone, report title
  ("Factory Profit & Loss"), date range, generated timestamp — pulled from company settings the same way
  the invoice does.
- "Print" uses a print stylesheet sized for A4; "Export PDF" uses the same layout through the browser's
  print-to-PDF, so one layout serves both.
- Footer keeps the existing branding line.

## Technical notes

- The report is a client-side route that queries the backend directly, scoped to the factory showroom
  the same way the other production reports are.
- No database migration is needed; all required tables and columns already exist.
