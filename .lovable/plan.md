# Batch History: independent page + fix "saved but not visible"

## What is happening (and what is still unconfirmed)

Confirmed by reading the code:

- Batch history today is **a tab inside Recipes & Production**, and it only lists batches **of the one product currently selected** (`kind = 'production'`, `product_id = <selected product>`, latest 50). So a batch saved for Product A is invisible the moment the screen is on Product B — this alone explains "it saved but I don't see it in batch history".
- Production always writes to the **Factory** scope (`showroom_id = NULL`).
- The produce call **throws away the batch id** the database returns, and it shows the success toast without ever confirming the new row is actually readable by that user. So if the row is created but hidden from the employee by access rules, the UI still says "✓ Produced".
- Access rule check: an employee is treated as a Factory user only when their role assignment points at a showroom flagged as factory, or when they count as a global user. A production-only employee **with no showroom at all** may fall outside that, which would make factory rows invisible to them even after a successful save.

Not yet confirmed: which of the two is biting on your live server, because that data lives on your own VPS database, not here. Step 1 below makes the system tell us instead of guessing.

## Plan

### 1. Make the save honest (diagnosis + real fix)

- Capture the batch id returned by the production call, then immediately read that batch row back.
- If it reads back: show `✓ Produced … (Batch #XXXXXX)` with a link straight to the new Batch History page.
- If it does **not** read back: show a clear warning instead of a plain success — "Production was saved, but your account cannot view Factory records. Ask an admin to assign you to the Factory location in Roles & Teams." No more silent empty history.

### 2. Let "no showroom" staff work as Factory staff

Per your choice, staff with no showroom assigned will be treated as Factory users, so they can both create and see factory production records. Delivered as a small SQL patch you run on the VPS (and kept in `sql/` with the others), plus the warning from step 1 as a safety net.

### 3. New independent submenu: Production → Batch History

A standalone full page (not a tab), permission-gated like the other production reports:

- **Filters:** Today / Yesterday / This week / This month / This year / Custom range, plus product search and a text search on batch no.
- **Summary strip:** total batches, total produced qty, total production cost, total overhead, total value.
- **List:** one row per batch — Date & time, Batch `#XXXXXX`, Product, Qty produced, Materials count, Cost, Value.
- **Expand a row** to reveal the raw materials actually consumed for that batch (e.g. `Atta — 5 kg`, `Sugar — 4 kg`), each with qty + unit and line cost, plus that batch's overheads. Consumption comes from the batch's own consumption records, not from re-reading the recipe, so it reflects what was truly deducted.
- **Print:** professional A4 report with company name/address header, date range, the batch list, and the consumed-material breakdown under each batch, with totals — matching the print style already used in the other production reports.
- Empty state that distinguishes "no batches in this range" from "you have no access to Factory records".

### 4. Keep the Recipes tab, but pointed at the new page

The in-workbench history tab stays as a quick per-product view, with a "See all batches" link to the new page, so the confusing per-product-only behaviour is no longer the only way to look at history.

## Technical notes

- New route `src/routes/_authenticated/production.batch-history.tsx`, wrapped in `PermissionGate`; sidebar entry added in `src/components/app-shell.tsx`.
- Data: `stock_ledger` (`kind='production'`) grouped by `ref_id` = batch id, joined to `raw_stock_ledger` (`kind='production_consume'`, same `ref_id`) for consumed materials, and `production_overheads` by `batch_id`. All scoped through the existing `scopeTo` factory/showroom helper.
- Date range handled with URL search params so a filtered view is shareable/reloadable.
- New permission key for the page added to the RBAC catalog sync SQL, so it can be granted per role like the other reports.
- SQL patch file `sql/31_factory_user_no_showroom.sql` updating the factory-user rule; idempotent, safe to re-run.
- `commitProduction` in `src/lib/recipe-store.ts` returns the batch id; the produce handler in `recipes.tsx` does the read-back check.
