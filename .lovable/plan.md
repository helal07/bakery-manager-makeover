# Purchase Module: Ultimate POS-style Entry Page + Delete in Purchase List

## 1. Full-page Ultimate POS style purchase entry

Rework `Add Purchase` from a narrow centered card into a full-width, sectioned page:

- **Top bar row**: Supplier (searchable picker with inline "New supplier"), Purchase date, Reference/PO no. (auto, editable), Location shown read-only as "Factory".
- **Items section**: full-width table with a prominent "Search product / material" bar above it (like Ultimate POS "Search Product"), keeps the multi-select picker and "New material" action.
- **Sticky bottom summary bar**: Total items, Net total, payment mode (Paid / Due / Partial), Paid amount, Due — plus Save / Cancel buttons always visible while scrolling.
- Keeps the existing factory-only warning banner and the disabled Save when a showroom is selected.
- Mobile: table rows collapse into stacked cards; summary bar stays sticky.

## 2. Number input fields behaviour

Replace `type="number"` on Qty, Unit price and Paid amount with text-mode numeric inputs (`inputMode="decimal"`, digits/decimal filtering, string state) so that:
- No spinner arrows, no scroll-wheel value changes.
- Clearing the field does not snap to `0`; leading zeros/partial entry like `.5` are typable.
- Value is parsed only for totals and on save.

Same treatment for the Partial "Paid amount" field.

## 3. Delete in Purchase List actions

- Add `deletePurchase(uuid)` to `src/lib/purchase-store.ts`: reverse the raw-stock effect of each purchase line via `commit_raw_stock_movement` with negative qty (kind `purchase_delete`), then delete `purchase_items` and the `purchases` row.
- Add a **Delete** entry to the Actions dropdown in `purchasing.list.tsx`, using the existing `ConfirmDialog` for confirmation, then remove the row from state with a success toast.
- Delete is wrapped in the same permission gate style used elsewhere on the page (visible only where purchase management is allowed).

## Technical notes

- Files: `src/routes/_authenticated/purchasing.new.tsx` (layout + inputs), `src/routes/_authenticated/purchasing.list.tsx` (delete action), `src/lib/purchase-store.ts` (delete function).
- No database migration needed; stock reversal reuses the existing `commit_raw_stock_movement` RPC so ledger history stays auditable.
- Purchase totals/payment logic is unchanged; only input handling and layout change.
