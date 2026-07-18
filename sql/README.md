# SQL Migrations — Self-Hosted Supabase Guide

এই ফোল্ডারে যা আছে সেগুলো Supabase Studio-এর **SQL Editor**-এ copy-paste করে চালানোর জন্য তৈরি।

## ফাইলগুলো

| ফাইল | কী কাজ | বাধ্যতামূলক? |
| --- | --- | --- |
| `00_baseline.sql` | কোডবেসের সাথে **সম্পূর্ণ aligned** schema snapshot — সব table, function, trigger, RLS policy, GRANT, enum, core seed (roles, permissions, default units), auth trigger — সব এতেই আছে। | ✅ হ্যাঁ |
| `01_seed.sql` | Optional demo data (sample showrooms, customers, suppliers, products, stock)। | ❌ না — শুধু demo চাইলে |
| `applied.md` | কোন migration চালানো হয়েছে সেই checklist। | Tracker |

## প্রথমবার সেটআপ / সম্পূর্ণ রিসেট

> ⚠️ `00_baseline.sql` চালানোর সময় `public` schema DROP হয়ে নতুন করে তৈরি হয়। বর্তমান data হারিয়ে যাবে। `auth`, `storage`, `realtime`, `vault` schema unaffected থাকবে।

1. Supabase Studio → **SQL Editor** → **New query**।
2. `sql/00_baseline.sql`-এর পুরো contents copy করে editor-এ paste করুন।
3. **Run** চাপুন। সম্পূর্ণ script `BEGIN … COMMIT`-এ wrap করা — কোথাও error হলে rollback হয়ে যাবে।
4. প্রথম login করলে auth trigger আপনাকে auto `owner` role দিয়ে দেবে।
5. (Optional) demo data-র জন্য একইভাবে `sql/01_seed.sql` চালান।

## ভবিষ্যৎ update workflow

যখনই codebase-এ নতুন কলাম/টেবিল লাগবে:

1. আমি `sql/00_baseline.sql`-এ change যোগ করব (fresh install-এর জন্য)।
2. **এবং** পাশাপাশি ছোট incremental patch দেব (`sql/NN_short_description.sql`) যাতে আপনি সম্পূর্ণ reset ছাড়াই migrate করতে পারেন।
3. আপনি patch ফাইলটা SQL Editor-এ paste করে Run চাপবেন।
4. `sql/applied.md`-এ tick দিয়ে রাখবেন।

## Build-এর আগে schema audit

কোড কোন টেবিল/কলাম আশা করছে এবং SQL baseline/live database-এ সেগুলো আছে কি না দেখতে:

```bash
bun run db:audit
```

তারপর build চালাতে চাইলে:

```bash
bun run build:checked
```

`PGHOST/PGUSER/PGPASSWORD/PGDATABASE` সেট থাকলে script live database-ও মিলিয়ে দেখবে। না থাকলে শুধু `sql/00_baseline.sql` বনাম codebase মিলিয়ে report দেবে।

## সমস্যা হলে

- **"schema public does not exist"** — baseline চালানোর সময় transaction rollback হয়েছে। error message পাঠান।
- **`must be owner of schema public`** — SQL Editor default `postgres` role-এ চালান।
- **Extension error** — Supabase Studio → Database → Extensions থেকে `pgcrypto` enable করুন।
- **`column X does not exist`** — নতুন কোনো mismatch ধরা পড়েছে; জানান, আমি একই টার্নে baseline + patch দিয়ে দেব।
