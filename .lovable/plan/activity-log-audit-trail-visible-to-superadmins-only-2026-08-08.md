# Activity log (audit trail) visible to superadmins only

Every important change in the system gets recorded automatically: who did it, what they changed, when, and the before/after values. Only a superadmin can read that log.

## What you get

1. **Automatic recording — nothing for staff to remember**
   The recording happens inside the database itself, so it captures every create/edit/delete regardless of which screen or device it came from. Staff cannot skip it or tamper with it.

2. **Covered activity (first pass)**
   - Sales, sale returns, customer payments
   - Purchases, purchase returns, supplier payments
   - Production batches (create / edit / delete), wastage, repurpose
   - Transfers (send / receive)
   - Products, raw materials, recipes, sub-recipes
   - Users, roles and permission changes, showrooms, company settings
   Login events are also recorded when a user signs in.

3. **New page: Settings → Activity Log** (superadmin only, hidden for everyone else)
   - Newest first, paged
   - Filters: date range, user, module/table, action (created / updated / deleted)
   - Each row expands to show exactly which fields changed, old value → new value
   - Export the filtered view to Excel/CSV
   - Rows are read-only: no edit or delete anywhere in the app, so the trail stays trustworthy

4. **Retention**
   Entries are kept indefinitely by default. A superadmin-only "purge older than N months" button is included if the table ever gets large.

## Technical notes

**Database — new patch `sql/33_audit_log.sql`**

- `public.audit_log`: `id`, `occurred_at`, `actor_id` (auth.uid()), `actor_email`, `actor_role_label`, `action` (`insert` / `update` / `delete` / `login` / `rpc`), `table_name`, `record_id`, `showroom_id`, `changed_fields text[]`, `old_data jsonb`, `new_data jsonb`, `note text`. Indexes on `(occurred_at desc)`, `actor_id`, `table_name`.
- GRANTs: `SELECT` to `authenticated` (RLS narrows it), `ALL` to `service_role`. No `anon`.
- RLS enabled with exactly one policy: `SELECT ... TO authenticated USING (public.is_bootstrap_superadmin((select auth.uid())))`. No insert/update/delete policy at all — rows are written only by the security-definer trigger function, so nobody can forge or erase entries through the API.
- `public.audit_row_change()` trigger function (`SECURITY DEFINER`, `search_path = public`): computes the changed-field list by diffing `to_jsonb(OLD)`/`to_jsonb(NEW)`, resolves the actor from `auth.uid()`, skips writes when nothing actually changed, and never raises — a logging failure must not roll back the user's real work.
- `AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW` triggers attached to the tables listed above.
- Existing batch RPCs (`commit_production_batch`, `edit_production_batch`, `void_production_batch`, `commit_transfer_receive`, `commit_repurpose`) additionally write one `rpc`-action row with a human-readable `note`, so the log reads as business events, not just table diffs.
- `public.purge_audit_log(_before timestamptz)` — security definer, asserts superadmin.
- Sensitive columns (password-like or token fields) are stripped from `old_data`/`new_data` before storing.

**Frontend**

- `src/lib/audit-log-store.ts`: `loadAuditLog({ from, to, actorId, table, action, page })`, `loadAuditActors()`, `purgeAuditLog(before)`.
- `src/routes/_authenticated/settings.audit-log.tsx`: filter bar, paged table, expandable diff rows, Excel export reusing the existing export helper.
- `src/components/app-shell.tsx`: add the Settings → Activity Log entry, rendered only when `useRbac().isSuperadmin` (not a permission key — superadmin only, as requested).
- Route guard: the page itself re-checks `isSuperadmin` and shows a "not authorised" state; RLS is the real enforcement.
- `tests/db/audit.test.ts`: asserts the diff/changed-fields logic and that a non-superadmin read returns zero rows.

For the VPS: run `sql/33_audit_log.sql` once in the Supabase SQL editor.
