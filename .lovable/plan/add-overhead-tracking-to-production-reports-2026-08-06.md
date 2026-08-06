# Add overhead tracking to Production reports

Overheads are recorded per production batch (electricity, labour, gas, etc.) but neither the Cost Report nor the Consumption Report shows them today. This adds them in both places, plus a dedicated overhead breakdown.

## 1. Cost Report — material + overhead + true total

- Fetch the overhead rows for the batches in the selected date range and match them to each batch.
- New table columns: Material cost, Overhead cost, Total cost, Unit cost (total ÷ qty).
- Summary cards become: Batches, Units produced, Material cost, Overhead cost, Total cost / avg unit cost.
- Expanding a batch row shows its overhead lines (category, amount, note).
- Note: today's unit cost only reflects ingredients, so figures will rise once overheads are included — this is the correct factory cost.

## 2. Consumption Report — overhead summary section

Keep the existing material consumption/wastage table, and add below it an "Overheads in this period" card: one row per overhead category with batch count and total amount, plus a grand total. Same date range and showroom filter as the materials table.

## 3. New submenu: Overhead Report

A dedicated page under Production (next to Cost Report / Consumption Report) with:
- Date range filter, showroom-scoped.
- Cards: total overhead, category count, batch count, average overhead per batch.
- Category-wise summary table (category, batches, total, % of overhead).
- Detail table: date, product, category, amount, note.
- CSV export and an A4 print layout with company header, report name and date range, matching the existing report styling.

## Technical notes

- Batch identity: `stock_ledger.ref_id` (kind `production`) is the batch id used by `production_overheads.batch_id`; the cost report currently selects `stock_ledger.id`, so it will also select `ref_id` for the join.
- Reuse `loadOverheadsForBatches` / `loadOverheadsInRange` from `src/lib/production-overhead-store.ts`; no new store functions or SQL/migrations needed.
- New route file `src/routes/_authenticated/production.overhead-report.tsx`, plus a sidebar entry in `src/components/app-shell.tsx` under Production (same permission key as the other production reports).
- Export helpers reuse `exportCsv` from `src/components/report-filters.tsx`.
