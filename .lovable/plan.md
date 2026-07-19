## Diagnosis update

Policies ঠিক আছে — তিনটাই permissive (`uid() IS NOT NULL`, `cmd=ALL`, `authenticated`)। যেহেতু sales list production-এ দেখা যাচ্ছে, auth token পাস হচ্ছে এবং `sale_items` read-ও RLS-এ block হওয়ার কথা না। তাই RLS root cause **নয়**।

সবচেয়ে সম্ভাব্য কারণ (unconfirmed): production bundle একটা পুরনো version চালাচ্ছে যেখানে `sale_items` query-তে `products(name, sku)` PostgREST embed করা আছে। Production Supabase-এ যদি `sale_items.product_id → products.id` FK PostgREST schema cache-এ visible না থাকে, embed fail করে এবং items empty আসে। এই version-এ fallback ছিল না, বা mirror deploy পুরনো bundle serve করছে।

## Plan

### Step 1 — Simplify + harden `tryItemSelects()` in `src/routes/invoice.$id.tsx`
- চারটা fallback query মুছে **একটাই query**: `sb.from("sale_items").select("*").eq("sale_id", sale.id)` — কোনো embed নেই, তাই FK/schema-cache issue-এ ভাঙবে না।
- Item row-এ ইতিমধ্যেই `product_name`, `product_sku` সংরক্ষিত আছে (user-এর sample row confirms) — এগুলো সরাসরি use হবে।
- Optional enrichment: distinct `product_id`-এর জন্য আলাদা `products` query — fail করলে fallback ঠিক আছে।
- Debug aid: query error বা empty result হলে `console.warn("[invoice] sale_items", { saleId, count, error })`।

### Step 2 — Production FK sanity check (user action, optional)
পরবর্তীতে embed use করতে চাইলে VPS-এ চালাবেন:
```sql
SELECT conname FROM pg_constraint
WHERE conrelid = 'public.sale_items'::regclass AND contype = 'f';
```
কোনো FK না থাকলে `sql/12_sale_items_fk.sql` তৈরি করব। এটা current fix-এর জন্য দরকার না, শুধু future-proofing।

### Step 3 — Verify mirror deployment freshness
Fix push হওয়ার পর VPS-এর deployed bundle-এ latest code গেছে কিনা check:
- ব্রাউজারে production invoice page open করে DevTools > Network > invoice.$id JS chunk-এর content search করুন `"[invoice] sale_items"` string দিয়ে। থাকলে new bundle live।
- না থাকলে GitHub Actions mirror workflow বা Coolify build log check করবেন।

### Step 4 — Verify items render
Production-এ existing invoice reload → Burger Bun row দেখা যাবে। না গেলে console warn payload paste করবেন — exact cause বেরোবে।

## Technical notes
- Edit: শুধু `src/routes/invoice.$id.tsx` — একটা function replace।
- কোনো SQL migration লাগছে না (RLS/policy ঠিক আছে)।
- Dev-এ regression risk শূন্য — new query strict superset।
