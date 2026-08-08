# Full Batch History submenu + honest save

## What is happening

Confirmed by reading the code:

- Batch history today is **a tab inside Recipes & Production**, and it lists batches **of the one product currently selected** (`kind = 'production'`, `product_id = <selected product>`, latest 50). A batch saved for Product A is invisible while the screen is on Product B. **This stays exactly as it is.**
- Production always writes to the **Factory** scope (`showroom_id = NULL`).
- The produce call **throws away the batch id** the database returns, and shows the success toast without confirming the new row is readable by that user. So if the row is created but hidden from the employee by location access rules, the UI still says "✓ Produced" — a silent, confusing result.

## Plan

### 1. Make the save honest (diagnosis + real fix)

- Capture the batch id returned by the production call, then immediately read that batch row back.
- If it reads back: show `✓ Produced … (Batch #XXXXXX)` with a link straight to the new Batch History page.
- If it does **not** read back: show a clear warning instead of a plain success — "Production was saved, but your account cannot view Factory records. Ask an admin to assign you to the Factory location in Roles & Teams."
- Companion SQL patch so staff with **no showroom assigned** count as Factory users, meaning a production-only employee can both create and see factory production records. Kept in `sql/` to run once on the VPS; idempotent.

### 2. New submenu: Production → Batch History

A standalone full page (nothing removed from the existing workbench tab), permission-gated like the other production reports:

- **Filters:** Today / Yesterday / This week / This month / This year / Custom range, plus a product filter and batch-no. search.
- **Summary strip:** total batches, total produced qty, total production cost, total overhead, total value. 
- **List:** one row per batch — Date & time, Batch `#XXXXXX`, Product, Qty produced, materials count, Cost, Value.
- **Expand a row** to reveal the raw materials actually consumed by that batch (e.g. `Atta — 5 kg`, `Sugar — 4 kg`) with qty, unit and line cost, plus that batch's overheads. Consumption is read from the batch's own consumption records, so it reflects what was truly deducted — not a recalculation from the recipe.
- Empty state distinguishes "no batches in this range" from "no access to Factory records".

### 3. Daily production print report

A **Print** button on the new page producing a professional A4 report you can file every day:

- Company name, address and contact header, plus the date range.
- Batch list table with totals.
- Under each batch, the consumed-material breakdown, so one printout shows what was produced and what it consumed. Add a column there in print only titel will be "Actual" where production manager write actually how much artisan took from manager. so owner can compair this will show only in print version.
- Same print styling family as the existing factory-stock and register reports.
- Also an Excel export of the same data.

## Technical notes

- New route `src/routes/_authenticated/production.batch-history.tsx`, wrapped in `PermissionGate`; sidebar entry added in `src/components/app-shell.tsx`.
- Data: `stock_ledger` (`kind='production'`) grouped by `ref_id` (= batch id), joined to `raw_stock_ledger` (`kind='production_consume'`, same `ref_id`) for consumed materials, and `production_overheads` by `batch_id`. Scoped through the existing `scopeTo` factory/showroom helper.
- Date range kept in URL search params so a filtered view is shareable and survives reload.
- Print/export reuse the `renderStockReportHtml` / `exportStockXlsx` helpers in `src/lib/stock-report-export.ts`, extended to support nested per-batch material rows.
- New permission key for the page added to the RBAC catalog sync SQL so it can be granted per role.
- `commitProduction` in `src/lib/recipe-store.ts` returns the batch id; the produce handler in `recipes.tsx` does the read-back check.
- SQL patch `sql/31_factory_user_no_showroom.sql` updates the factory-user rule.