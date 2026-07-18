## লক্ষ্য

সম্পূর্ণ প্রোজেক্টের জন্য **কোডবেসকে source of truth ধরে** নতুন `sql/00_baseline.sql` লিখব — যাতে ভবিষ্যতে কোনো টেবিল/কলাম mismatch না থাকে।

## Step 1 — Full codebase audit

আমি নিচের সব ফাইল স্ক্যান করব এবং প্রতিটা টেবিলের **required columns + types** বের করব:

- `src/lib/*-store.ts` — সব store ফাইল (~15টা)
- `src/routes/_authenticated/*.tsx` — সব রুট (~50টা)
- `src/hooks/*.ts` — permission, role, showroom hooks
- `src/integrations/supabase/types.ts` — type reference

প্রতিটা `.from("table").select("...")`, `.insert({...})`, `.update({...})`, `.rpc("...")` call থেকে column list বের করব।

## Step 2 — Table inventory (প্রায় 47টা টেবিল)

**Auth & RBAC:** user_profiles, user_roles, app_roles, permissions, role_permissions, user_role_assignments

**Catalog:** product_categories, units, products, selling_price_groups, product_selling_prices

**Inventory:** product_stock, stock_ledger, raw_materials, raw_material_stock, raw_stock_ledger

**Production:** recipe_categories, recipes, work_orders, qc_checks, wastage_log

**Sales:** customers, customer_groups, customer_payments, sales, sale_items, sale_payments, sale_returns, sale_return_items, held_sales, orders

**Purchasing:** suppliers, supplier_payments, purchase_categories, purchases, purchase_items, purchase_returns, purchase_return_items

**Ops:** expense_categories, expenses, transfers, transfer_items, cash_registers, employees, showrooms

**System:** company_settings, landing_content

## Step 3 — নতুন `sql/00_baseline.sql`

Structure:
```
BEGIN;
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- enum: app_role
-- functions: update_updated_at_column, has_role, handle_new_user_role,
--            find_user_id_by_email, commit_stock_movement,
--            commit_raw_stock_movement, commit_production_batch
-- auth trigger: on_auth_user_created

-- প্রতি টেবিল (৪-step pattern):
--   1) CREATE TABLE (কোডের সাথে exact match)
--   2) GRANT
--   3) ENABLE RLS
--   4) CREATE POLICY
--   5) updated_at trigger

-- Seed (baseline data):
--   permissions catalog (55 keys)
--   default units (kg, g, L, ml, pc, pack, box)
--   default categories
--   default selling price group
--   empty company_settings row

NOTIFY pgrst, 'reload schema';
COMMIT;
```

## Step 4 — Cleanup

- মুছব: `sql/02_user_profiles_extend.sql`, `sql/03_align_with_code.sql` (সব কিছু baseline-এ চলে যাবে)
- আপডেট: `sql/README.md`, `sql/applied.md` — এখন শুধু ১টা ফাইল
- Verify: `sql/01_seed.sql`-এর column names মিলিয়ে ঠিক করব

## তুমি যা করবে

1. প্লান approve
2. আমি সব ফাইল তৈরি করব (একটাই বড় baseline ফাইল হবে ~2000 lines)
3. Supabase Studio → SQL Editor → new query → পুরো `sql/00_baseline.sql` paste → Run
4. Login করলে auth trigger auto-assign করবে `owner` role
5. (Optional) `sql/01_seed.sql` চালাবে demo data-র জন্য

## ভবিষ্যৎ workflow

কোডে নতুন কলাম/টেবিল লাগলে:
- baseline-এ সরাসরি update করব
- সাথে ছোট incremental patch (`sql/NN_*.sql`) দেব যেন তোমার fresh reset না লাগে

## ডেলিভারেবলস

- Rewritten: `sql/00_baseline.sql` (কোডের সাথে 1:1)
- Deleted: `sql/02_user_profiles_extend.sql`, `sql/03_align_with_code.sql`
- Updated: `sql/README.md`, `sql/applied.md`
- Verified: `sql/01_seed.sql`
- কোডে কোনো পরিবর্তন নেই
