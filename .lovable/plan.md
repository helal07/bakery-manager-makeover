## Goal
Production home (`/production`) কে একটি real "Production Dashboard" বানানো — যেখানে এক নজরে আজকের/মাসের production picture দেখা যাবে, শুধু navigation tile নয়।

## Layout (top → bottom)

1. **Date range filter bar** — Today · This Week · This Month · Custom (date-from/to). Default: Today.
   - Second row: Product filter (optional, all products by default).

2. **KPI cards (grid, 4 per row)**
   - Total Production (qty units + batch count) — from `stock_ledger` kind=`production`.
   - Total Transfers Out (qty + transfer count) — from `transfers` / `transfer_items`, factory → showroom.
   - Wastage (qty + value) — from `wastage_log`.
   - Current Stock Value — Factory raw material stock value + finished goods stock value (raw_material_stock × cost, product_stock × cost).
   - Batches: Completed vs Running (from `stock_ledger` production entries; running = today's produce not yet transferred, optional).
   - Raw Material Consumed (value) — from `raw_stock_ledger` kind=`production_consume` in range.
   - Avg Cost / Unit — consumed value ÷ produced qty.
   - Top produced product (name + qty) in range.

3. **Charts row**
   - Bar chart: Daily production qty over selected range (Recharts).
   - Bar/line: Daily wastage qty.
   - Donut: Production share by product (top 5 + others).

4. **Two-column tables**
   - Recent batches (existing, keep) — last 8, with product, qty, date, cost.
   - Low stock alerts — raw materials where `raw_material_stock.quantity <= min_stock`.

5. **Keep** existing "Advanced" collapsible section for less-used sub-pages (Repurpose, Cost Report, Consumption Report). Remove the two big primary tiles at top (New Production / Recipes already in sidebar) OR keep as small quick-action buttons in the header.

## Data sources (existing tables, no schema change needed)
- `stock_ledger` (kind=`production`, showroom_id IS NULL) → production qty/batches.
- `raw_stock_ledger` (kind=`production_consume`) → consumption value (join `raw_materials.cost`).
- `wastage_log` → wastage qty + value.
- `product_stock` + `products.cost` → finished stock value.
- `raw_material_stock` + `raw_materials.cost` → raw stock value + low-stock alerts.
- `transfers` + `transfer_items` → transfers count/qty in range.

All queries client-side via `supabase` client with date filters on `created_at`. Parallel fetch with `Promise.all`, wrapped in a single `useEffect` keyed by date range. No new migration file needed.

## Files to touch
- `src/routes/_authenticated/production.index.tsx` — full rewrite as dashboard.
- Optional new component `src/components/production/kpi-card.tsx` for reuse (or inline).
- Use existing `recharts` (already used elsewhere) for charts.

## Out of scope
- No schema/DB changes → no new SQL migration file.
- No changes to sidebar or other production sub-pages.
- "Running batch" concept — only shown if trivially derivable from existing ledger; otherwise omitted to avoid new tables.

## Deliverable
Production dashboard যেখানে দিনের/মাসের production KPI, charts, low-stock alerts, recent batches সব একসাথে দেখা যাবে — filter করে date range change করা যাবে।
