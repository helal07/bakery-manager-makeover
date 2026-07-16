# SQL Migrations — Self-Hosted Supabase Guide

এই ফোল্ডারে যা আছে সেগুলো Supabase Studio-এর **SQL Editor**-এ copy-paste করে চালানোর জন্য তৈরি।

## ফাইলগুলো

| ফাইল | কী কাজ | বাধ্যতামূলক? |
| --- | --- | --- |
| `00_baseline.sql` | Lovable Cloud-এর current schema-এর পূর্ণ snapshot। সব table, function, trigger, RLS policy, GRANT, enum ও core seed (roles, permissions, units, categories, company settings) এতে আছে। | ✅ হ্যাঁ |
| `01_seed.sql` | Optional demo data (sample showrooms, customers, suppliers, products, stock)। | ❌ না — শুধু demo চাইলে |
| `applied.md` | কোন migration সেলফ-হোস্টেডে চালানো হয়েছে সেই checklist। | Tracker |

## প্রথমবার সেটআপ

> ⚠️ `00_baseline.sql` চালানোর সময় `public` schema DROP হয়ে নতুন করে তৈরি হয়। বর্তমান কোনো data থাকলে হারিয়ে যাবে। `auth`, `storage`, `realtime`, `vault` schema unaffected থাকবে।

1. Supabase Studio খুলুন → **SQL Editor** → **New query**।
2. `sql/00_baseline.sql`-এর পুরো contents copy করে editor-এ paste করুন।
3. **Run** চাপুন। সম্পূর্ণ script `BEGIN … COMMIT`-এ wrap করা, তাই কোথাও error হলে rollback হয়ে যাবে।
4. (Optional) demo data চাইলে একইভাবে `sql/01_seed.sql` চালান।

## ভবিষ্যৎ update (এটাই আসল workflow)

Lovable Cloud-এ প্রতিটা schema change automatically `supabase/migrations/<timestamp>_<slug>.sql` হিসেবে save হয়। এই ফাইলগুলোই আপনার সেলফ-হোস্টেডে চালাতে হবে।

**নিয়ম:**

1. প্রতিটা চ্যাটের পরে `supabase/migrations/` ফোল্ডার দেখুন।
2. নতুন যোগ হওয়া ফাইলগুলো filename-এর timestamp অনুসারে ascending order-এ (পুরোনো → নতুন) একটা একটা করে SQL Editor-এ paste করে Run চাপুন।
3. `sql/applied.md`-এ tick দিয়ে রাখুন কোনটা চালানো হয়েছে।

## যেসব ফাইল আর নেই

পুরনো `MIGRATIONS_partX.sql` সিরিজ (part1 … part13) এখন `legacy-migrations/` ফোল্ডারে archive করা। **নতুন সেটআপে চালাবেন না** — সব কিছু ইতিমধ্যেই `00_baseline.sql`-এ included আছে।

## সমস্যা হলে

- **"schema public does not exist"** — baseline চালানোর সময় transaction rollback হয়েছে। error message পাঠান।
- **`must be owner of schema public`** — SQL Editor default `postgres` role-এ চালান (Studio-তে top-right role selector)।
- **Extension error** — `pgcrypto` / `uuid-ossp` extensions available নেই — Supabase Studio → Database → Extensions থেকে enable করে আবার চালান।
