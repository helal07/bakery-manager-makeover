## Scope

**Cloud DB only. Your VPS production schema will NOT be touched** — I have no access to it and won't generate anything that runs against it. `sql/applied.md` is just a local checklist file; ignore it if you want, or leave your VPS ticks as they are.

## Problem (verified against cloud DB)

Cloud is still on the legacy schema. Confirmed missing pieces:

- `units.code` + `units.is_active` (still has `short_name`) → this is the exact "column units.code does not exist" error on Edit Product
- `employees` missing designation, address, national_id, joining_date, dob, gender, emergency contacts, notes, avatar_url, role_id
- `user_profiles` missing `software` (jsonb)
- `expense_categories` / `purchase_categories` missing `is_active`
- `customer_payments` / `supplier_payments` / `sale_returns` missing `created_by`; `purchase_returns` missing `invoice_ref` / `note` / `created_by`
- `showrooms` missing `settings` (jsonb) and `is_factory`
- RPCs / permission rows from sql/05, 06, 09, 12 likely absent

The code already matches the aligned schema (your VPS proves it). Only cloud is drifted.

## Plan — apply the existing idempotent patches to cloud only

Run each existing `sql/*.sql` via the migration tool, one approval per file, in order:

1. `sql/02_align_code_schema.sql` — fixes units.code, categories.is_active, transfers renames, user_profiles fields, etc. **This one fixes the Edit Product crash.**
2. `sql/05_factory_only_production.sql`
3. `sql/06_reverse_logistics.sql`
4. `sql/07_sales_shipping.sql`
5. `sql/08_employees_extended.sql`
6. `sql/09_showroom_settings.sql`
7. `sql/10_raw_materials_min_stock.sql`
8. `sql/11_transfers_align.sql`
9. `sql/12_invoice_bundle_rpc.sql`
10. `sql/13_image_storage_buckets.sql`

All are `IF NOT EXISTS` / `DO $$ ... IF NOT EXISTS`, so re-runs are safe. After each, a quick `information_schema` check to confirm.

## Not doing

- No changes to your VPS.
- No code changes.
- No new SQL files.

OK to start with `sql/02_align_code_schema.sql` on cloud?
