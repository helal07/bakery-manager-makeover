
## লক্ষ্য

Lovable Cloud-এর current schema থেকে একটা clean, runnable SQL baseline তৈরি করা যেটা আপনি সেলফ-হোস্টেড Supabase-এর **SQL Editor**-এ copy-paste করে চালাতে পারবেন। ভবিষ্যতে প্রতিটা নতুন schema change আলাদা `.sql` ফাইল হিসেবে পাবেন — সেগুলোও SQL Editor-এ চালানো যাবে।

## ধাপ

### 1. পুরনো partX ফাইল archive
`MIGRATIONS_part1.sql` … `MIGRATIONS_part13_stock_onconflict_fix.sql` এবং `MIGRATIONS.md` — সব `legacy-migrations/` ফোল্ডারে সরানো হবে + একটা README যাতে লেখা: "এই ফাইলগুলো আর ব্যবহার হবে না, historical reference মাত্র।"

### 2. Baseline SQL তৈরি (SQL Editor-friendly)

`sql/00_baseline.sql` — একটাই ফাইল, শুরু থেকে শেষ পর্যন্ত copy করে SQL Editor-এ paste করে Run চাপলেই পুরো schema তৈরি হবে।

Structure:
```
-- 1. Reset
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 2. Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 3. Enums (app_role ইত্যাদি)
-- 4. Tables (dependency order-এ: showrooms → products → stock → sales …)
--    প্রতিটার পরে GRANT + ALTER TABLE ... ENABLE RLS + POLICIES
-- 5. Functions (has_role, commit_stock_movement, commit_raw_stock_movement,
--    commit_production_batch, update_updated_at_column, handle_new_user_role,
--    find_user_id_by_email)
-- 6. Triggers (updated_at triggers, auth.users → handle_new_user_role)
-- 7. Seed data (app_roles, permissions catalog, default company_settings row,
--    default units/categories যদি লাগে)
```

আমি Cloud DB introspect করে (exec + `psql` দিয়ে `pg_dump --schema-only --schema=public` বা catalog queries) সব `CREATE TABLE`, indexes, constraints, policies, functions, triggers বের করে এই এক ফাইলে সাজাব। NULLS NOT DISTINCT unique indexes সহ সব latest fix included থাকবে।

যেহেতু SQL Editor একটাই বড় statement batch handle করে, ফাইলটা যেন `BEGIN;` … `COMMIT;` wrap করা থাকে তাই দেব — কোনো step fail করলে rollback হয়ে যাবে।

### 3. Seed data আলাদা রাখব (optional চালানোর জন্য)

`sql/01_seed.sql` — শুধু dummy data (products, customers, suppliers ইত্যাদি) যদি আপনি demo data চান। Baseline চালানো বাধ্যতামূলক, seed optional।

### 4. README

`sql/README.md`-এ ছবির মতো clear steps (বাংলায়):
```
1. Supabase Studio → SQL Editor খুলুন
2. sql/00_baseline.sql পুরোটা copy করে paste করে Run চাপুন
3. (Optional) sql/01_seed.sql একইভাবে চালান
4. ভবিষ্যতে supabase/migrations/ ফোল্ডারে যত নতুন
   <timestamp>_xxx.sql ফাইল আসবে, filename-এর
   timestamp ascending order-এ একটা একটা করে
   SQL Editor-এ চালাবেন
```

### 5. ভবিষ্যৎ workflow

- Cloud-এ যতবার schema change হবে, `supabase/migrations/<timestamp>_<slug>.sql` auto তৈরি হয় (ইতিমধ্যেই হচ্ছে)।
- আমি আর কখনো root-level `MIGRATIONS_partX.sql` বানাব না।
- আপনার job: প্রতিটা চ্যাটের পরে `supabase/migrations/` ফোল্ডার দেখে নতুন ফাইলগুলো SQL Editor-এ paste করে চালানো।
- Track রাখার জন্য `sql/applied.md` checklist template থাকবে যেখানে filename tick করবেন।

## Deliverables

- `legacy-migrations/` — পুরনো partX + MIGRATIONS.md সরানো, একটা README যোগ
- `sql/00_baseline.sql` — SQL Editor-এ paste করে চালানোর জন্য single self-contained file
- `sql/01_seed.sql` — optional demo data
- `sql/README.md` — বাংলায় step-by-step
- `sql/applied.md` — কোন migration চালিয়েছেন track করার checklist

## Notes

- শুধু `public` schema; `auth`/`storage`/`realtime`/`vault` touch করব না।
- Cloud-এ কোনো পরিবর্তন হবে না — শুধু export।
- Approve করলে build mode-এ Cloud DB introspect করে সব ফাইল লিখব।
