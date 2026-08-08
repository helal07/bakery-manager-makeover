# Batch CRUD with permission guards

Right now a production batch can only be created — never corrected. If someone enters a wrong quantity or saves the same batch twice, the stock ledger keeps both forever. This adds safe edit and delete for batches, gated by permissions so ordinary production staff can create batches but only authorised people can change or remove them.

## What you get

1. **Batch History becomes the batch manager**
   Each row in Production → Batch History gets an actions column: **Edit** and **Delete** (shown only if your role allows it).

2. **Delete = full reversal, not a hole in the ledger**
   Deleting a batch puts the consumed raw materials back into factory stock, removes the produced quantity from finished stock, and drops that batch's overheads. Every reversal is recorded as its own ledger entry, so the audit trail stays intact and nothing silently disappears.
   Blocked when the produced quantity has already been sold or transferred away (not enough finished stock left to reverse) — you get a clear message instead of negative stock.

3. **Edit = correct quantity and overheads**
   Editing re-runs the batch at the new quantity: the old consumption is reversed and the new one applied in one atomic step, with the same stock-availability checks as creating a batch. Batch number and date stay the same, so your printed reports keep matching.
   You can also fix the overhead amounts attached to the batch.

4. **Duplicate warning at creation**
   When you save a batch for the same product, same quantity, within the last few minutes, you get a confirmation prompt ("A nearly identical batch was saved N minutes ago — save anyway?") so accidental double-saves stop before they happen.

5. **Permissions**
   Two new permission keys appear in Roles & Teams:
   - **Edit production batches** — allows correcting a batch
   - **Delete production batches** — allows reversing a batch
   Creating batches keeps using the existing production permission, so nothing changes for current staff. Both new permissions are granted to Admin by default; every other role gets them only if you tick them.

## Technical notes

**Database — new patch `sql/32_batch_crud.sql`**
- `public.user_has_permission(_user uuid, _key text)` — security-definer lookup across `user_role_assignments → app_roles → role_permissions`, with superadmin/global-admin short-circuit. Reused by both RPCs below.
- `public.void_production_batch(_batch_id uuid, _note text)` — asserts app staff, asserts location access on the batch's showroom, asserts `production.batches.delete`; verifies finished stock ≥ produced qty; then writes reversing movements via existing `commit_raw_stock_movement` / `commit_stock_movement` (kinds `production_reverse`, `production_void`) and deletes `production_overheads` for the batch. All in one function so it is atomic.
- `public.edit_production_batch(_batch_id uuid, _batch numeric, _ingredients jsonb, _overheads jsonb)` — asserts `production.batches.edit`, calls the void logic internally, then re-applies consumption/production for the same `ref_id` (batch id preserved) reusing the ingredient-expansion logic already in `commit_production_batch`.
- Permission catalog inserts for `production.batches.edit` and `production.batches.delete`, plus grants to the Admin role.

**Frontend**
- `src/lib/recipe-store.ts`: add `voidProductionBatch()`, `editProductionBatch()`, and a `findRecentSimilarBatch()` helper for the duplicate check; reuse `explainStockRpcError` for friendly messages.
- `src/routes/_authenticated/production.batch-history.tsx`: actions column, delete confirm dialog (`ConfirmDialog`), and an edit dialog reusing the existing ingredient/overhead editor rows; buttons gated with `usePermission("production.batches.edit"/".delete")`.
- `src/routes/_authenticated/recipes.tsx`: duplicate-batch confirmation before commit in the Produce tab.
- `src/lib/rbac-matrix.ts`: add the two keys to the catalog and to the Admin/Owner role sets; extend the RBAC tests to assert a production-only role can create but not edit/delete.
