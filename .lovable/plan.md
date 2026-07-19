
## লক্ষ্য

দুইটা সম্পূর্ণ আলাদা ব্যাকেন্ড চলবে একই কোডবেসে:

- **Lovable Cloud Supabase** → Lovable-এর ভিতরে live preview / development-এর জন্য
- **Self-hosted VPS Supabase** (`supabase.muzahidfood.com`) → GitHub mirror → Coolify auto-deploy → production

Frontend কোড একটাই — শুধু env variable আলাদা হবে, তাই কোনো কোড duplication লাগবে না।

## কিভাবে কাজ করবে

Vite automatically env ফাইল আলাদা করে:

```text
Lovable preview / dev  →  .env             (Cloud Supabase)
Coolify production build →  .env.production  (VPS Supabase)
```

এই split এখনই setup করা আছে — কোনো কোড change লাগবে না, শুধু নিশ্চিত করতে হবে দুই ব্যাকেন্ডের schema সবসময় sync থাকে।

```text
                    ┌──────────────────────────┐
                    │   Lovable কোডবেস (one)   │
                    └────────────┬─────────────┘
                                 │ git push
                    ┌────────────┴─────────────┐
                    ▼                          ▼
           Lovable preview               GitHub mirror
           uses .env                     → Coolify build
           → Cloud Supabase              uses .env.production
                                         → VPS Supabase
```

## Migration workflow (সবচেয়ে গুরুত্বপূর্ণ)

প্রতিবার schema change করলে **একই SQL দুই জায়গায় যাবে**:

1. আমি `sql/NN_short_name.sql` ফাইল তৈরি করব (VPS-এর জন্য — তুমি Supabase Studio-তে paste করবে)
2. একই SQL আমি `supabase--migration` tool দিয়ে Lovable Cloud-এ apply করব (তুমি approve করলে auto-run হবে)
3. `sql/applied.md`-এ tick করে রাখবে VPS-এ কোনটা চালানো হয়েছে

এতে দুই DB সবসময় same schema-তে থাকবে, code একই থাকবে, দুই জায়গায় test করা যাবে।

## এখন যা করতে হবে (setup steps)

1. **Lovable Cloud-এ full baseline apply**
   `sql/00_baseline.sql` + `sql/02` … `sql/09` — সব একে একে Cloud-এ migration হিসেবে চালাব যাতে Cloud DB VPS-এর current state-এর সাথে match করে।
2. **Cloud-এ প্রথম owner user তৈরি**
   Cloud-এ Lovable preview খুলে auth page থেকে sign up করলে auto-trigger `owner` role দিয়ে দেবে (baseline-এই trigger আছে)।
3. **Cloud-এ demo data (optional)**
   Preview-তে test করার জন্য `sql/01_seed.sql`-এর equivalent Cloud-এ চালাব যাতে products/showroom/customer থাকে।
4. **Verify parity**
   Cloud preview-এ POS → sale → invoice flow test করব; VPS-এ same flow তুমি deploy-এর পর test করবে। দুই জায়গায় behavior একই হওয়া উচিত।
5. **নতুন feature workflow লক করা**
   এই turn-এর পর থেকে যেকোনো backend change-এ আমি সবসময় দুইটা জিনিস একসাথে দেব: `sql/NN_*.sql` ফাইল + `supabase--migration` call। তুমি শুধু approve চাপবে (Cloud auto-apply) এবং VPS Studio-তে ফাইলটা paste করবে।

## যা change হবে না

- Frontend কোড, mirror workflow, Coolify auto-deploy — সব যেমন আছে তেমনি থাকবে
- `.env` / `.env.production` structure — already correct
- VPS-এর কোনো data touch হবে না; শুধু নতুন migration ফাইল তুমি ম্যানুয়ালি apply করবে

## Technical notes

- `.env` git-ignored করা উচিত না — Lovable preview build-এ এটা লাগে (Cloud URL/key public anon key, safe)
- `.env.production` VPS credentials আছে — এটাও public anon key, তবু ইচ্ছা করলে GitHub secrets-এ move করা যায় future-এ
- Service role key কোথাও committed নেই — Coolify secret + Lovable Cloud managed
- দুই DB-তে data আলাদা থাকবে (independent) — এটাই চাওয়া, preview data প্রোডাকশনে impact করবে না

## Approve করলে যা করব প্রথম

Cloud-এ `sql/00_baseline.sql` full apply করার জন্য `supabase--migration` call দেব — তুমি approve চাপলে Cloud DB আজকের VPS state-এর সাথে match করবে, তারপর একে একে `sql/02` থেকে `sql/09` apply করব।
