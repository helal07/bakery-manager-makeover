# Factory → Showroom transfer price (supply price) and true factory profit

## Goal

Each product gets a supply price used when the factory transfers goods to a showroom. Factory profit is then measured as supply price minus production cost, not retail price minus cost.

Example: cost (materials + overhead) 7, supply price 8, retail 10.
- Factory profit = 8 − 7 = 1 per unit
- Showroom profit = 10 − 8 = 2 (1 after a 1 discount)

## What changes

### 1. Default supply price per product
- New field `transfer_price` on products, editable in the product form next to cost and retail price ("Showroom supply price").
- Products list can show it as a column so it's easy to review/update.
- No need to type a price on every transfer — it is prefilled from here.

### 2. Price on each transfer line
- New `unit_price` on transfer items.
- In New Transfer, each added line shows an editable Unit price prefilled with the product's supply price (falls back to production cost if unset). A line total and a transfer grand total appear in the summary panel.
- Existing transfers without a price keep working: reports fall back to the product's supply price, then cost.

### 3. Factory Profit & Loss uses supply price
Current report values dispatched transfers at retail `products.price`, which overstates factory profit. It will instead value them at the transfer's own `unit_price` (with the fallbacks above), so:
- Revenue = total supply value of goods transferred out in the period
- Cost = raw material consumption + overheads + wastage
- Profit = the true factory margin (1 per unit in the example)

The Transfers table in the report gains a Supply price column, and the summary strip labels the figure "Supply value" instead of a retail figure.

### 4. Showroom side stays consistent
Showroom selling and price-group discounts are untouched. Where a showroom-side report needs a cost basis, the transfer supply price is the correct number to use; that is a follow-up if you want showroom-level gross profit reporting too.

## Technical notes

- Migration `sql/35_transfer_pricing.sql` (idempotent, additive, no deletes):
  - `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS transfer_price numeric NOT NULL DEFAULT 0`
  - `ALTER TABLE public.transfer_items ADD COLUMN IF NOT EXISTS unit_price numeric`
  - Backfill existing transfer items with `products.cost` so historical reports are not blank; no change to stock movement.
  - `NOTIFY pgrst, 'reload schema'` at the end. Also appended to `sql/99_master_update.sql` for the VPS.
- `commit_transfer_receive` and all stock RPCs stay unchanged — pricing is reporting metadata only, quantities and ledgers behave exactly as today.
- Frontend: `src/components/product-form.tsx`, `src/routes/_authenticated/products.index.tsx`, `src/routes/_authenticated/transfers.new.tsx` (price column + totals), `src/routes/_authenticated/production.profit-loss.tsx` (revenue source), and transfer detail/print views to show unit price and value.
- Damaged-return transfers keep valuing at cost; supply pricing applies to normal outbound transfers only.
- Verification: typecheck plus the existing test suite, with a unit test covering supply-price fallback order (line price → product transfer price → cost).

## Optional later
Per-showroom supply price overrides (different price for different outlets), if a single default per product is not enough.
