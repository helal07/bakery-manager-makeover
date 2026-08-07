# Refactor for stable factory / showroom separation, accounting and RBAC

## What I checked in the current code

- Location scoping in data reads is already strict almost everywhere: every sales, stock, purchase, expense and report query filters either `showroom_id = <outlet>` or `showroom_id IS NULL` (factory). No "all locations" leak found in dashboard, POS, sales list, stock and sales reports.
- Raw material purchase already writes raw stock to the factory only (`_showroom_id: null`) in `purchase-store.ts`, and the purchase form warns and blocks saving when a showroom is selected.
- POS no longer deducts recipe ingredients on sale — only finished-product stock moves. That fix is intact and will not be touched.
- Transfers already require explicit acceptance at the destination (`commit_transfer_receive`), and the RPC asserts the caller has access to the destination outlet.
- Database side: `sql/25_strict_tenant_isolation.sql` centralises access on `user_can_access_location()` and every stock RPC calls `assert_location_access`.

So the architecture is mostly correct. The real remaining defects are these:

1. **Ungated pages.** Roughly 40 authenticated pages render with no permission check — POS, product stock, purchasing (list/new/edit/payments/returns), sales (list/history/payments/return), expenses, accounting, products, suppliers, CRM, employees, branches, inventory, orders. Sidebar links are hidden by role, but typing the URL still opens the page. This breaks requirement 2.
2. **Factory-only writes reachable from a showroom screen.** The "Production" dialog inside Product Stock posts a `commit_stock_movement` with `_showroom_id: null`, i.e. a showroom user's screen writing factory stock. Finished-goods production belongs to the Production module only.
3. **Raw-material purchase guard is client-side only.** A showroom user can still create a purchase row carrying `showroom_id` with raw-material lines by other paths; there is no database-level rule tying raw-material purchase lines to the factory.
4. **Transfer creation is not restricted by direction/role.** Nothing prevents composing a transfer whose source is an outlet the user cannot access; it fails only later at receive time.
5. **Accounting page mixes scope implicitly.** It scopes each query, but a global admin viewing "Factory" sees only `showroom_id IS NULL` rows with no visible label, which reads as if outlet money is missing.

## Fix plan

### A. Enforce RBAC on every route (no new schema)
- Add `PermissionGate` to every authenticated page currently without one, using the existing keys in `src/lib/rbac-matrix.ts` (e.g. `pos.access`, `purchases.view`, `sales.view`, `expenses.view`, `accounting.view`, `products.view`, `crm.view`, `hr.view`, `settings.access`).
- Where a group of routes shares a prefix, add a layout route with a single gate (purchasing, sales, products, expenses, crm, employees) instead of repeating the gate per file, following the existing `production.tsx` pattern.
- Extend `tests/rbac/matrix.test.ts` so a missing gate on any `_authenticated` route fails the test suite — this stops the gap from reappearing.

### B. Keep factory writes inside the factory module
- Remove the factory-writing "Production" dialog from `product-stock.tsx`; that page keeps only outlet-scoped adjustment for the currently selected location.
- Finished-goods creation stays in Production → New Production, which already writes with factory scope and is gated by `production.*`.

### C. Harden raw-material purchasing at the database level
- New migration: raw-material purchase lines must belong to a factory-scoped purchase. Implemented as a trigger on `purchase_items` that raises when `material_id IS NOT NULL` and the parent purchase has a non-null `showroom_id`.
- Keep the existing UI warning as the friendly first line of defence.

### D. Restrict transfer creation by access
- In `transfers.new.tsx` and `transfers.damaged.new.tsx`, restrict the source selector to locations the signed-in user can access (factory only for factory users, own outlet for outlet users) and destination to the remaining allowed locations.
- Add an `assert_location_access(source)` check when the transfer is marked sent, so the rule also holds outside the UI.

### E. Make separate accounting explicit
- On Accounting and the report headers, show the active location name ("Factory" or the outlet name) so per-location totals are unambiguous, and keep every figure computed from the already-scoped queries.

### Data preservation
- No `DELETE`, `TRUNCATE` or destructive `UPDATE` in any migration from this work. Sub-recipes, sub-menus, recipes and all existing rows stay as they are. New SQL is additive (one trigger + function) and idempotent, delivered as `sql/26_purchase_factory_guard.sql` for your VPS as well.

## Technical notes
- Touched files: new layout routes under `src/routes/_authenticated/` (purchasing, sales, products, expenses, crm, employees), plus `pos.tsx`, `accounting.tsx`, `dashboard.tsx`, `product-stock.tsx`, `inventory.tsx`, `orders.tsx`, `suppliers.tsx`, `branches.tsx`, `transfers.new.tsx`, `transfers.damaged.new.tsx`.
- New SQL: `sql/26_purchase_factory_guard.sql` (trigger function + trigger, plus the source-access check inside the transfer send path).
- POS checkout logic, stock-movement RPC signatures and sub-recipe expansion remain untouched.
- Verification: typecheck plus the existing 153-test suite, extended with the route-gate coverage test.
