# Fix purchase editing + negative raw material / factory stock

## What I found (verified against the database and code)

**1. Purchase "Edit" is not implemented.**
In the purchase list, the Edit action is a plain link to `/purchasing/new` with no purchase id attached, and the Add Purchase page never loads an existing purchase. So Edit always opens a blank form — nothing is broken in your data, the feature simply doesn't exist yet.

**2. Raw materials are deducted twice — once at production, again at every sale.**
The POS checkout (and the dashboard quick-sale path) looks up each product's recipe and subtracts all of its ingredients from raw material stock on top of subtracting the finished product. But raw materials were already consumed when the batch was produced. The ledger shows both patterns in your data: `production_consume / production` rows (correct) and `production_consume / sale` rows (double deduction). This is the main reason raw material and factory stock drift down into negative numbers, and why production/consumption history shows negative values.

**3. Manual raw stock adjustments can be written to the wrong location.**
Raw material stock is factory-only (`showroom_id IS NULL`) — that is how purchases write it and how every raw stock report reads it. The Raw Material Stock page's Adjust dialog passes the currently selected showroom instead of the factory. When a showroom is selected, the adjustment creates/decrements a separate showroom-scoped row that no report reads, so the factory number looks unchanged or goes negative on the VPS.

## Fix plan

### A. Stop the double deduction (data correctness — do this first)
- Remove the raw material consumption loop from POS checkout (`pos.tsx`) and from the dashboard sale path (`dashboard.tsx`). Selling a finished product only decrements finished-product stock; raw materials are consumed only by a production batch.
- Provide a one-time correction SQL script (`sql/24_fix_sale_raw_consume.sql`) that reverses every existing `production_consume` ledger row with `ref_type = 'sale'`: insert compensating positive ledger rows (kind `correction`) and add the same amount back to `raw_material_stock`, so balances match reality without deleting history. You run it once on the VPS.

### B. Always keep raw stock at the factory
- Change the Raw Material Stock adjust flow to pass factory scope (`null`) like the Raw Materials page already does, and show "Factory" in the dialog so it is unambiguous.
- The correction script also folds any stray showroom-scoped `raw_material_stock` rows back into the factory row.

### C. Make purchase Edit work
- Add an edit route `/purchasing/edit/$id` that reuses the existing full-page purchase form, loading the purchase, its supplier/date/reference and its item lines.
- Saving an edit updates the purchase and its items, and adjusts raw stock by the **difference** per material through the existing ledger RPC (kind `purchase_edit`), so stock stays consistent and auditable. Deleting still reverses the full quantity as it does today.
- Point the Edit action in the purchase list at this route.

### D. Guard against silent negatives
- Add a small negative-stock warning badge on Factory Stock and Raw Material Stock so any future imbalance is visible immediately instead of hiding in a report.

## Technical notes
- Files: `src/routes/_authenticated/pos.tsx`, `dashboard.tsx`, `raw-material-stock.tsx`, `purchasing.list.tsx`, `purchasing.new.tsx` (extracted into a shared purchase form used by both new and edit), `src/lib/purchase-store.ts` (add `loadPurchase(id)` and `updatePurchase`).
- New SQL: `sql/24_fix_sale_raw_consume.sql` — idempotent, reversal-by-ledger only, no destructive deletes.
- No schema changes are required.
