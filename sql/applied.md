# Applied Migrations Checklist

সেলফ-হোস্টেড Supabase-এ কোন ফাইলগুলো চালানো হয়েছে সেটা এখানে tick করে রাখুন।

## Baseline

- [x] `sql/00_baseline.sql` — কোডের সাথে aligned schema (units.code+is_active + user_profiles bio/language/timezone/software included)
- [ ] `sql/01_seed.sql` — (optional) demo data

## Incremental patches

`00_baseline.sql`-এর পরে যদি নতুন patch ফাইল যোগ হয়, এখানে line add করুন।

<!-- format:
- [ ] sql/NN_slug.sql — সংক্ষিপ্ত বর্ণনা
-->

- [ ] `sql/02_align_code_schema.sql` — existing DB-তে codebase expected columns যোগ/rename করে schema mismatch ঠিক করবে
- [ ] `sql/05_factory_only_production.sql` — raw stock / production / wastage / QC / work orders showroom_id NULL enforce (CHECK constraint) + production permission keys seed
- [ ] `sql/06_reverse_logistics.sql` — damaged_stock / damaged_ledger / repurpose_queue tables, condition on sale_return_items, kind on transfers, is_factory on showrooms, commit_damaged_movement / commit_damaged_transfer_approve / commit_repurpose RPCs, RBAC permission rows
- [ ] `sql/07_sales_shipping.sql` — sales table-এ shipping কলাম যোগ (POS-এ SHIPPING (+) ইনপুট save করার জন্য)
- [ ] `sql/08_employees_extended.sql` — employees table-এ role_id (app_roles FK), designation, address, national_id, joining_date, DOB, gender, emergency contact, notes, avatar_url যোগ
- [ ] `sql/09_showroom_settings.sql` — showrooms.settings jsonb (per-showroom invoice override) + get_effective_invoice_settings(showroom_id) helper
- [ ] `sql/20_damaged_sale.sql` — damaged_ledger.sale_amount/customer_name + log_finished_product_wastage() ও commit_damaged_sale() RPC + production.damaged.sell permission

