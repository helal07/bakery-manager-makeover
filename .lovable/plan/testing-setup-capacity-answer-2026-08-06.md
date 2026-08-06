# Testing setup + capacity answer

## Short answer on capacity

100 sale invoices/day is a very small load for a 6 vCPU / 8 GB VPS running Coolify + self-hosted Supabase. Rough scale: 100 invoices ≈ a few thousand database writes per day, i.e. a handful of requests per minute even at a busy peak. This system will comfortably handle 10-20x that. The realistic bottlenecks are not raw volume but:

- Report/dashboard pages that scan whole tables (sales, stock_ledger, production) once data grows over months — fixed with indexes.
- Postgres memory settings if the Supabase container is left at defaults on an 8 GB box.
- Backup/restore and full-DB export, which are heavy one-off operations.

So: no upgrade needed. Part of this plan adds a small load check so we prove it with numbers instead of estimates.

## What gets added

### 1. Test runner
Add Vitest (dev dependency) with a `test` script and a config that reuses the existing path aliases. No change to app build or deploy.

### 2. Unit tests (pure logic, no database)
Target the business rules where a silent bug costs money:

- `unit-convert.ts` — g/kg/l/ml normalisation, mixed-dimension rejection, auto-yield summing.
- `sub-recipe-store.ts` — recursive expansion of sub-recipes into raw materials, multi-sub-recipe aggregation, overlap detection.
- Recipe/product costing in `product-form` helpers — material cost + overhead cost totals, per-unit cost.
- `backup-tables.ts` — dependency order is valid (no table restored before its parent).
- Invoice/POS totals — subtotal, discount, tax, shipping, paid/due, previous-due rollup.
- `stock-report-export.ts` — row and totals shaping for XLSX/print.

Where the logic currently lives inside a component, the calculation moves into a small pure helper module so it can be tested; the component imports it and behaves the same.

### 3. Function tests (real database RPCs)
A test suite that runs against the database using a service key from env and checks the money-critical server functions end to end, each inside a transaction-style setup/teardown on throwaway records:

- `commit_production_batch` — deducts raw materials (including via sub-recipes), adds finished stock at the factory, writes overheads, is atomic on failure.
- `commit_stock_movement` / `commit_raw_stock_movement` — ledger + on-hand stay consistent, no negative stock.
- `commit_damaged_movement`, `commit_damaged_sale`, `log_finished_product_wastage` — damaged stock and resale amounts land in the right tables.
- `commit_repurpose` and damaged transfer approval — queue status transitions once, not twice.
- `get_invoice_bundle` — items, payments, showroom header, previous-due figure.
- `has_role` / `user_has_showroom_access` — RBAC returns the expected answer for each role, and RLS actually blocks a cashier from another showroom's rows.

These are opt-in: they skip themselves when the database env vars are absent, so normal builds never depend on them.

### 4. Load/capacity check (one-off script)
A script that creates N synthetic sales (default 100, configurable) with items and payments against a scratch showroom, then reports write throughput and the timing of the heaviest read paths: POS product list, sales history, daily register report, profit & loss, invoice bundle. It cleans up after itself. Running this on the VPS gives a real answer for the 6 vCPU / 8 GB box.

### 5. Index review (only if the load check shows it)
If any report query is slow, add indexes in a new `sql/22_perf_indexes.sql` (idempotent, same style as existing patches) on the columns those reports filter by — typically `sales(created_at, showroom_id)`, `stock_ledger(created_at, showroom_id)`, `sale_items(sale_id)`, `production_overheads(batch_id)`.

## Technical notes

- Vitest in `node` environment for logic and database tests; no React rendering tests in this pass (the UI is large and changing fast, so component tests would mostly be churn).
- Database and load scripts read credentials from environment variables only — nothing committed.
- Test files live next to what they test as `*.test.ts`, plus `tests/db/` for the RPC suite and `scripts/load-check.mjs` for the load run.
- Extracting calculations out of components is behaviour-preserving refactor only; no UI change.
