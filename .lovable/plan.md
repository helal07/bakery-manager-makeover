
## নীতি

কোডবেস = সোর্স অফ ট্রুথ। বর্তমান সেলফ-হোস্টেড DB-তে ডেটা আছে, তাই drop/reset নয় — শুধু ছোট ALTER দিয়ে স্কিমা কোডের সাথে মেলাব। বেসলাইন ফাইলও একই সাথে আপডেট করব যাতে ভবিষ্যতে fresh install-ও ঠিক থাকে।

## Gap analysis (কোড grep অনুযায়ী)

| টেবিল | কোড যা চায় | DB-তে যা আছে | অ্যাকশন |
|---|---|---|---|
| `raw_materials` | `min_stock` | `threshold` | কলাম রিনেম |
| `customer_groups` | `mode`, `selling_price_group_id` | নেই | কলাম যোগ |
| বাকি সব | — | মিল আছে ✅ | কিছু না |

## ধাপ ১ — নতুন migration ফাইল

`sql/03_align_with_code.sql` তৈরি করব — idempotent, safe to re-run:

```sql
BEGIN;

-- raw_materials: threshold → min_stock
ALTER TABLE public.raw_materials
  RENAME COLUMN threshold TO min_stock;
-- (যদি ইতিমধ্যে min_stock থাকে, উপরের লাইন error দেবে — সেক্ষেত্রে skip)

-- customer_groups: mode + selling_price_group_id
ALTER TABLE public.customer_groups
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'percentage';

ALTER TABLE public.customer_groups
  ADD COLUMN IF NOT EXISTS selling_price_group_id uuid
  REFERENCES public.selling_price_groups(id) ON DELETE SET NULL;

-- PostgREST schema cache refresh
NOTIFY pgrst, 'reload schema';

COMMIT;
```

নোট: `RENAME COLUMN`-এ `IF EXISTS` নেই, তাই safe version:
```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='raw_materials' AND column_name='threshold')
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='raw_materials' AND column_name='min_stock')
  THEN
    ALTER TABLE public.raw_materials RENAME COLUMN threshold TO min_stock;
  END IF;
END $$;
```
এটা রি-রান করলেও ভাঙবে না।

## ধাপ ২ — বেসলাইন সিঙ্ক

`sql/00_baseline.sql`-এও একই দুই টেবিলের definition আপডেট করব (fresh install-এর জন্য) — শুধু line ~755 (raw_materials) আর line ~383 (customer_groups)। ডেটা loss নেই কারণ এটা শুধু ফাইল edit।

## ধাপ ৩ — তুমি যা করবে

সেলফ-হোস্টেড Supabase SQL Editor-এ শুধু:
```
sql/03_align_with_code.sql
```
রান করবে। বাকি কিছু না। ডেটা অক্ষত থাকবে।

## Verify

- Raw Materials page লোড হয়
- Customer Groups page লোড হয় (WITHIN GROUP error যায়)
- POS-এ customer group select করলে discount কাজ করে

## ডেলিভারেবলস

- নতুন: `sql/03_align_with_code.sql`
- আপডেটেড: `sql/00_baseline.sql` (দুই টেবিলে ছোট edit)
- কোডে কোনো পরিবর্তন নেই
