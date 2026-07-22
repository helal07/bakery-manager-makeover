## Goal
Superadmin creates an employee with a login (email + password we set), assigns a role + showroom scope, and links it to the employee profile — so the person can log in immediately with the credentials we hand them (Ultimate POS style). Also lock down public signup after the first owner exists, and redesign Access Control to match the rest of the app.

## What already exists (reuse, don't rebuild)
- `employees` table with full profile fields (`sql/08_employees_extended.sql`).
- RBAC: `app_roles`, `role_permissions`, `user_role_assignments (user_id, role_id, showroom_id)`.
- `usePermissions()` + `PermissionGate` — already scope-aware via `canIn(showroomId, key)`.
- `handle_new_user_role()` trigger — already auto-grants `owner` role to the very first signup (see `db-functions`).
- `sendLoginSetupEmail` server fn — email-invite flow (kept as a secondary option).

## What's missing (this plan adds)
1. `employees.user_id` → link the employee profile to `auth.users` (foundation for HRM, attendance, leave, payroll).
2. Admin-created credentials (no email required) — server fn using `supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true })`.
3. One-shot onboarding UX in the Employee form (email + password + role + showroom + "Allow login").
4. First-run signup lock — auth page shows "Create account" only when zero users exist; after that it's login-only.
5. Access Control page redesign (padding, spacing, cards, better empty/loading states).

---

## Step-by-step process

### Step 1 — DB migration `sql/15_employee_login_link.sql`
- `ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;`
- Unique index on `employees.user_id` (one login per employee).
- Add SECURITY DEFINER RPC `public.has_any_user() returns boolean` — returns `true` when `auth.users` has at least one row. Callable by `anon` so the auth page can decide whether to show "Create account".
- `NOTIFY pgrst, 'reload schema';`
- No RLS change; existing employees policy already covers admins.

### Step 2 — Server functions `src/lib/employee-access.functions.ts`
All gated by `requireSupabaseAuth` + owner/admin/superadmin check (same pattern as `sendLoginSetupEmail`). Load `supabaseAdmin` inside the handler.

- `createEmployeeLogin({ email, password, employeeId?, roleId, showroomId })`
  → `admin.createUser({ email_confirm: true })`, insert `user_role_assignments`, set `employees.user_id`. Returns `{ userId }`.
- `resetEmployeePassword({ userId, newPassword })` → `admin.updateUserById`.
- `updateEmployeeAccess({ userId, roleId, showroomId })` → replace assignment row.
- `disableEmployeeLogin({ userId })` → `admin.updateUserById({ ban_duration: "876000h" })` + delete assignments.

### Step 3 — Employee form (`src/components/employee-form.tsx`)
Add "Account & Access" card (owner/admin only):
- Login email (defaults to profile email)
- Temporary password with **Generate**, show/hide, copy
- Role select (from `app_roles`)
- Showroom scope (blank = global/factory)
- "Allow this employee to log in" toggle
  - On save with toggle ON → `createEmployeeLogin` → upsert employee with returned `user_id`.
- **Edit mode when `user_id` exists**: show three actions instead of the create form — Reset password, Change role/scope, Disable login.

### Step 4 — Employees list (`src/routes/_authenticated/employees.tsx`)
- New "Login" badge column: `Active` / `Disabled` / `—`.
- Row actions: keep email invite, add "Set password…" quick dialog.

### Step 5 — First-run signup lock (`src/routes/auth.tsx`)
- On mount: call `has_any_user()` RPC.
- If `false` → show tabs `[Create account] [Sign in]` with **Create account** selected.
  First signup fires the existing `handle_new_user_role()` trigger → user becomes `owner` automatically.
- If `true` → render **Sign in only**; no create-account tab, no visible link.
- Guard the signup server-side too: after step 1 lands, add a `BEFORE INSERT` trigger on `auth.users` (or check inside `handle_new_user_role`) that rejects self-service signups once one user exists — protects against direct API hits.

### Step 6 — Access Control redesign (`src/routes/_authenticated/settings.access.tsx`)
Presentational only, no logic change:
- Wrap each tab body in a `Card` with consistent `p-6` padding and section headers.
- Roles tab → 2-column layout: role list (left) + selected-role detail panel (right) with description, member count, and quick "Edit permissions" jump to matrix.
- Permission Matrix → group by `module` with sticky module headers, `Select all in module` checkbox, search box for permission label.
- User Assignments → user avatar + name + email cell, role & scope as badges, filter by role/showroom, empty state illustration.
- Loading skeletons instead of "Loading…" text; consistent button styles (`Button` from `@/components/ui/button`); mobile-responsive stacking.

### Step 7 — Manual apply order on self-hosted Supabase
1. Run `sql/15_employee_login_link.sql` in SQL editor → `NOTIFY pgrst, 'reload schema';`
2. Deploy frontend.
3. Verify:
   - Fresh browser, no users → `/auth` shows Create account → sign up → auto-owner.
   - Sign out → `/auth` now shows Sign-in only.
   - As owner: Teams → Add Employee → fill profile + toggle "Allow login" + set password → Save.
   - Sign in with those credentials in an incognito window → confirm scoped menus and showroom-restricted data.
   - Owner → Employees row → Reset password / Disable login work.

---

## Out of scope (next phase)
Attendance, leave, salary/payroll screens. `employees.user_id` created in Step 1 is the join key later features will use (`auth.uid()` → employee → attendance/leave/payroll scoped by showroom).

## Technical notes
- Password rules: min 8 chars, mixed case + digit; generator gives 12-char strong default.
- Plaintext password shown once in a success dialog (with copy) — never persisted.
- One active `user_role_assignments` row per `(user_id, showroom_id)` enforced client-side; no schema change needed.
- Bearer middleware in `src/start.ts` already handles auth on server-fn calls — no wiring changes.
- Self-hosted Supabase already has the service-role key in env, so `auth.admin.*` works.