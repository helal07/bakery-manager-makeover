# Fix Outlet-Scope RBAC Violation

## What's actually broken

Audit + live DB check confirms scoped users can see **all outlets**' data because outlet isolation was never enforced:

1. **DB is wide open.** Every scoped table (`showrooms`, `sales`, `product_stock`, `transfers`, `cash_registers`, `customers`, `held_sales`, `customer_payments`, `stock_ledger`, `damaged_stock`, `wastage_log`, and even `user_role_assignments`) has a single policy: `USING (auth.uid() IS NOT NULL)`. Any signed-in user can read/write any outlet's rows. Introduced by migration `20260716090018_...sql`.
2. **UI trusts the DB.** `useShowroomScope` loads all showrooms (no filter by assignments), so the header switcher lists every outlet to every user, and `.eq("showroom_id", …)` returns whatever they pick.

Additional leaks: `branches.tsx` skips scope filtering, POS silently re-points scope when loading a foreign sale, and `transfers.new` reads `product_stock` unfiltered.

## Fix plan

### 1. Purge built-in roles (keep `superadmin` only)

- Delete every seeded role from `app_roles` **except `superadmin`** (e.g. `owner`, `admin`, `manager`, `cashier`, plus any other seed rows). Cascade cleanup of their `role_permissions` and `user_role_assignments`.
- `superadmin` keeps `is_system=true` and remains the only undeletable role; used as the built-in bootstrap for the first user via `handle_new_user_role`.
- Update `sql/12_rbac_permission_catalog.sql` (or add a companion `sql/16_purge_builtin_roles.sql`) so re-running the baseline never re-inserts the other seeded roles.
- Employees whose only assignment referenced a purged role will lose RBAC access until you re-assign them; the initial superadmin remains intact.

### 2. Re-tighten RLS at the database (root cause)

Add `SECURITY DEFINER` helpers and rewrite policies so scoped users only see rows for outlets they're assigned to; `superadmin` (or any user-created role assigned with `showroom_id IS NULL`) keeps full access.

- `public.user_has_showroom_access(_user uuid, _showroom uuid) returns boolean` — true when the user is `superadmin`, or has a `user_role_assignments` row with `showroom_id IS NULL` (global), or an assignment where `showroom_id = _showroom`. Data rows with `NULL` showroom (factory) are accessible only to global users.
- `public.user_is_global_admin(_user uuid) returns boolean` — same minus the specific-showroom match. Used by tables without a `showroom_id` column.
- Rewrite policies for: `showrooms`, `sales`, `sale_items` (via parent), `sale_payments` (via parent), `sale_returns`, `sale_return_items`, `product_stock`, `stock_ledger`, `raw_material_stock`, `raw_stock_ledger`, `transfers` (access to source OR dest), `transfer_items` (via parent), `cash_registers`, `held_sales`, `customer_payments`, `damaged_stock`, `damaged_ledger`, `wastage_log`, `orders`, `expenses`, `supplier_payments`, `production_overheads`, `work_orders`, `qc_checks`, `repurpose_queue`.
- `user_role_assignments`: SELECT `own row OR global admin`; writes `global admin` only.
- `app_roles`, `role_permissions`, `permissions`: SELECT authenticated; writes `global admin` only.
- `customers`, `suppliers`, `products`, `raw_materials`, `recipes`, `categories`, `units`, `company_settings`, `landing_*`: SELECT authenticated (shared catalog / branding); writes restricted to global admins where appropriate.
- Every write policy gets an explicit `WITH CHECK` mirroring `USING` so a scoped user can't move rows across outlets via `UPDATE`.
- Ship as `sql/17_rbac_scope_policies.sql` and apply via `supabase--migration`.

### 3. Tighten the client scope layer

- **`src/hooks/use-showroom-scope.tsx`**: after loading assignments, filter `showrooms` to only assigned outlets for non-global users; expose `assignedShowroomIds`; guarantee `currentShowroomId` is always one of them (auto-select first, reject switches to a non-assigned id).
- **`ShowroomSwitcher` in `src/components/app-shell.tsx`**: single-outlet scoped user → read-only label. Multi-outlet scoped user → only their outlets. Global admin → full list + "All".
- **`setCurrentShowroomId`**: guard rejects non-assigned ids inside the provider.

### 4. Plug the leaking pages

- `src/routes/_authenticated/branches.tsx` — filter `sales`/`showrooms` by `assignedShowroomIds`; hide entirely from users with no cross-outlet visibility or render only their own outlet card.
- `src/routes/_authenticated/transfers.new.tsx` — filter `product_stock` and the source dropdown to assigned outlets.
- `src/routes/_authenticated/transfers.receive.$id.tsx` — verify the destination showroom is accessible; otherwise "Not found".
- `src/routes/_authenticated/pos.tsx` — remove the auto scope-switch on foreign-sale load; show an error toast instead.
- Sweep report pages (`reports.sales`, `reports.stock`, `reports.ledgers`, `reports.purchase`, `sales.payments`, `sales.return`, `sales.history`, `sales.list`) so "no filter when `loc` is null" only runs for global admins; scoped users always get the assignment filter.
- Sweep `orders.tsx`, `accounting.tsx`, `ai-insights.tsx`, `dashboard.tsx` for the same class of unscoped aggregate query.

### 5. Verification

- Run `supabase--linter` after migrations.
- Playwright as a scoped employee: (a) switcher shows only their outlet, (b) `/branches` doesn't leak, (c) `/transfers/new` stock picker only shows their outlet, (d) direct URL to foreign sale → not-found, (e) Settings › Access lists only `superadmin` until you create more.
- Playwright as `superadmin`: everything still works; Settings › Access can create/delete custom roles freely.
- SQL probe via `requireSupabaseAuth` server fn: `SELECT * FROM sales` returns only the scoped user's outlet.

## Technical notes

- `superadmin` is preserved as the sole built-in role (`is_system=true`, undeletable in UI). All other roles are user-created and freely deletable.
- `user_role_assignments` is currently open — any user could self-grant global access via the JS client. Lockdown ships in the same migration to close that window.
- Helpers follow the existing `has_role()` pattern (SQL, `STABLE`, `SECURITY DEFINER`, `SET search_path = public`).
- Factory rows (`showroom_id IS NULL`) → "global admin only" — preserves factory-only production logic.
- No changes to `client.server` / admin bypass paths.
