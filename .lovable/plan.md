## লক্ষ্য
POS চেকআউটের পর invoice window খুললে instant load — কোন spinner-জাল না।

## এখন কেন slow
`invoice.$id.tsx` এর `fetchSaleSnapshot()` সব query **serial** চালায়:
1. `sales` লুকআপ  →  2. `sale_items`  →  3. `products` enrichment  →  4. `sale_payments`  →  5. `showrooms`  →  6. `customers`  →  7. `previousDue` এর জন্য আরও 2টা query।

মোট ~7-9 round-trip, তারপর `InvoicePreview` render হয়। VPS latency-এ এটা 2-4s লাগে। যদিও POS ইতিমধ্যে `localStorage.setItem('invoice:<id>', snapshot)` করে, কোডটা DB-first — snapshot শুধু fallback হিসেবে ব্যবহার হয়।

## সমাধান (৩ স্তর)

### 1. Instant paint from POS snapshot (frontend only, দুই env-এই কাজ করবে)
`invoice.$id.tsx`-এ:
- Mount হওয়ার সাথে সাথেই `localStorage`/`sessionStorage` থেকে snapshot পড়ে **সাথে সাথে render** ও `?ap=1` হলে print trigger করবে।
- এর পর background-এ DB fetch চালিয়ে fresh data দিয়ে reconcile (previousDue, showroom address etc. accurate করার জন্য)।
- Company + invoice settings ইতিমধ্যেই `localStorage`-cached — সেটাই sync-ভাবে seed হবে, `await` না করে।

POS side-এ: snapshot-এ `customerAddress` + fresh `showroom` fields সব already আছে, তাই instant paint সম্পূর্ণ accurate।

### 2. Parallelize DB reconciliation
`fetchSaleSnapshot()` কে `Promise.all` দিয়ে items/payments/showroom/customer/priorSales/priorPayments একসাথে fire — sequential await বাদ। এতে reconciliation round-trip 7 → 2।

### 3. Single-RPC fast path (optional, দুই env-এ SQL migration লাগবে)
নতুন SQL function `public.get_invoice_bundle(_sale_id uuid)` যা এক call-এ JSON return করবে: sale + items(+product name/sku) + payments + showroom + customer address + previousDue।
- Dev: `supabase--migration` দিয়ে apply।
- VPS: `sql/12_invoice_bundle_rpc.sql` file generate করব — manually SQL editor-এ চালাবেন।

তিন স্তর একসাথে হলে print window খোলার **সাথে সাথেই** invoice দৃশ্যমান, DB reconciliation invisible-ভাবে ~150ms-এ শেষ।

## যে ফাইল বদলাবে
- `src/routes/invoice.$id.tsx` — snapshot-first render, parallel fetch, RPC try-first with fallback।
- `sql/12_invoice_bundle_rpc.sql` — নতুন RPC (VPS-এর জন্য)।
- Dev DB-তে একই RPC migration-এর মাধ্যমে।

## Behavior contracts (unchanged)
- `?ap=1` থাকলেই auto-print, না থাকলে view-only।
- Previous Due = strictly prior sales due − prior standalone payments।
- Print output HTML/CSS একদম unchanged।

Approve করলে implement করি।