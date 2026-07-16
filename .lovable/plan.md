## Goal
Replace hard-coded role checks with real RBAC using the existing tables (`app_roles`, `permissions`, `role_permissions`, `user_role_assignments`). Superadmin defines which roles get which permissions in **Settings → Access Control** (Ultimate POS style), and the app enforces it in the sidebar and on the routes.

## Root cause today
- `public.permissions` catalog is empty → the Matrix tab has nothing to toggle → no permission to enforce.
- No route or sidebar entry uses `usePermissions().can(...)` yet.
- `usePermissions` hook is already correct (Superadmin bypass, per-showroom scope). We reuse it.

## Changes

### 1. `MIGRATIONS_part12_rbac_permission_catalog.sql` (idempotent seed, no schema change)
Insert a full catalog into `public.permissions` grouped by module. Includes:
- dashboard, pos, sales, purchases, products, inventory
- **production**: `production.access`, `production.recipes.view/manage`, `production.raw_materials.view/manage`, `production.work_orders.manage`, `production.wastage.manage`, `production.qc.manage`, `production.reports.view`
- contacts, expenses, reports, showrooms, employees, settings (incl. `settings.access`)

Then seed sensible defaults into `role_permissions` for the built-in roles that already exist (`Admin` → everything except `settings.access`; `Manager` → operational + production; `Cashier` → dashboard + POS + basic sales + customers) using `ON CONFLICT DO NOTHING`. Superadmin bypasses at code level; no rows required.

### 2. New `src/components/permission-gate.tsx`
```tsx
<PermissionGate anyOf={["production.access"]}>{children}</PermissionGate>
```
- Loading → bare `AppShell` skeleton (no flash).
- Superadmin OR any listed key present → renders children.
- Otherwise → `AppShell` with a "Not authorized" card and a link back to `/dashboard`.
- Backed by `usePermissions()`.

### 3. Gate Production routes
- `src/routes/_authenticated/production.tsx` layout → wrap `<Outlet />` in `PermissionGate anyOf={["production.access"]}` (covers every `/production/*` child).
- `src/routes/_authenticated/recipes.tsx` → `production.recipes.view`.
- `src/routes/_authenticated/raw-materials.tsx`, `raw-material-stock.tsx` → `production.raw_materials.view`.

Child production pages need no changes.

### 4. Permission-driven sidebar in `src/components/app-shell.tsx`
- Add optional `permission?: string` to `NavItem` and child type.
- Call `usePermissions()` once inside `AppShell`. Superadmin sees everything; otherwise hide items/children whose `permission` is set and the user lacks it. Items without a `permission` stay visible (no regressions for un-tagged items).
- If every child of a group is hidden, hide the group header too.
- Tag Production group + children with the production keys above; tag Showrooms/Reports children/Employees/Settings→Access with their keys.

### 5. Small cleanup in `src/hooks/use-is-admin.ts`
Include `superadmin` alongside `owner`/`admin` for consistency. It is no longer the primary gate — `usePermissions` is — but any remaining call sites stay correct.

## Self-test
- After the migration is approved, `supabase--read_query` confirms `permissions` has ~50 rows and `role_permissions` links the built-in roles (Admin/Manager/Cashier) to the expected keys.
- Playwright (localhost:8080, injected Supabase session):
  1. Open `/settings/access` → Matrix tab, screenshot Production module listed.
  2. Open `/production` and `/recipes` as Superadmin → renders normally.
  3. In the Matrix tab, uncheck all `production.*` keys for the Manager role, save, and read `role_permissions` to confirm the delete landed. This proves the write path Superadmin will actually use to control Production access per role.
- Runtime deny-case UI (non-superadmin without `production.access`) verified by code review of `PermissionGate`; we do not spin up a second test user just for the screenshot.

## Out of scope
- No DB schema changes, no RLS changes.
- Not touching other module pages beyond adding `permission` tags in the sidebar.
- No new sign-in flow for a second test user.
