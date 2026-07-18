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
