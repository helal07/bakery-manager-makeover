# Remix of Muzahid Food 25.07-v5

আমার আগের একটি লাভবেল প্রজেক্ট গিটহাব থেকে ডাউনলোড করা আছে এখন আমি এখানে সেটা নতুন করে কিছু চেঞ্জ করতে চাই নিচের যা যা তথ্য তোমার প্লান অনুযায়ী কর। 
# Bakery Manager migration plan

## যা পেয়েছি
- **Repo:** https://github.com/helal07/bakery-manager.git
- **Supabase URL:** `http://supabasekong-ot2z9gtejtdzxegn57ch0iud.163.227.239.130.sslip.io` (self-hosted Supabase)
1. SERVICE_URL_SUPABASEKONG_8000=http://supabasekong-ot2z9gtejtdzxegn57ch0iud.163.227.239.130.sslip.io:8000  2. Main Branch a ase. 3. SERVICE_SUPABASEANON_KEY=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc4MjMxMDAyMCwiZXhwIjo0OTM3OTgzNjIwLCJyb2xlIjoiYW5vbiJ9.Uffv6guskXwsR0pdz4qQDCL-mW0tTT4COPZisEJqnsE

## ⚠️ গুরুত্বপূর্ণ সতর্কতা
আপনার Supabase URL `http://` (HTTPS না)। ব্রাউজার mixed-content block করবে যেহেতু Lovable preview HTTPS। Production এ এটা কাজ করবে না যদি না আপনি **HTTPS/SSL** enable করেন Supabase server এ। এটা আগে সমাধান করতে হবে।

---

## ধাপে ধাপে যা হবে

### ধাপ ১ — Repo clone ও inspect
- Public repo `bakery-manager` clone করব `/tmp` তে
- Structure দেখব: framework কী, routing, pages, components, supabase migrations কই
- পুরোনো `package.json` থেকে dependency list বের করব

### ধাপ ২ — Migration report
Clone করার পর আপনাকে সংক্ষেপে বলব:
- কতটা page/component
- Routing library (react-router-dom কি না)
- SQL migration file আছে কিনা
- কী কী extra npm package লাগবে

### ধাপ ৩ — Dependencies install
- `bun add` দিয়ে missing packages install (shadcn UI, react-hook-form, zod, date-fns যা যা লাগে)
- `@supabase/supabase-js` install
- `react-router-dom` install **করব না** — TanStack Router এ convert হবে

### ধাপ ৪ — Files copy
- `src/components/`, `src/hooks/`, `src/lib/` → সরাসরি কপি
- `public/` assets → কপি
- `src/index.css` / global styles → template এর `src/styles.css` এ merge (design tokens preserve)
- **কপি হবে না:** `.git/`, `package.json` (full), `vite.config.ts`, `tsconfig.json`, `src/main.tsx`, `App.tsx`, `router config`, `.env`, `node_modules/`

### ধাপ ৫ — Routing convert (react-router-dom → TanStack Router)
প্রতিটা `src/pages/*.tsx` → `src/routes/*.tsx` এ convert:
- `src/pages/Index.tsx` → `src/routes/index.tsx` (placeholder overwrite)
- `src/pages/Login.tsx` → `src/routes/login.tsx`
- `src/pages/Dashboard.tsx` → `src/routes/_authenticated/dashboard.tsx` (auth needed pages)
- Products, Orders, Inventory, ইত্যাদি → same pattern
- প্রতিটাতে `createFileRoute("/path")({ head, component })` wrap
- `<Link to>`, `useNavigate`, `useParams` → `@tanstack/react-router` থেকে import
- প্রতিটাতে unique `head()` — title, description, og:title, og:description (SEO)

### ধাপ ৬ — Auth-protected pages
Bakery manager app এ অবশ্যই login-required pages আছে। এগুলো যাবে `src/routes/_authenticated/` ফোল্ডারে। Template এর managed auth gate সেগুলো protect করবে — কিন্তু এটা Lovable-managed Supabase ধরে নেয়। আপনার self-hosted Supabase এ এই auto-gate থাকবে না, তাই আমি একটা custom auth-check hook বানাব যেটা আপনার Supabase client ব্যবহার করে।

### ধাপ ৭ — Supabase client setup
`src/integrations/supabase/client.ts`:
```ts
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!
);
```
আপনার URL + full anon key `.env` এ set করব:
```
VITE_SUPABASE_URL=http://supabasekong-ot2z9gtejtdzxegn57ch0iud.163.227.239.130.sslip.io
VITE_SUPABASE_PUBLISHABLE_KEY=<আপনার full anon key>
```

### ধাপ ৮ — SQL migration
Repo তে `supabase/migrations/*.sql` থাকলে:
- সব SQL সঠিক order এ এক জায়গায় দেখাব
- আপনি নিজের self-hosted Supabase Studio → SQL Editor এ paste করে চালাবেন
- **আমি Lovable থেকে external Supabase এ push করতে পারব না** — এটা manual

### ধাপ ৯ — Test & fix
- Preview খুলে homepage দেখব
- Login/Signup flow test করব
- Console error / network error fix করব
- Data fetch হচ্ছে কিনা verify করব

---

## এখন আপনার কাছ থেকে যা দরকার

**পূর্ণ anon key টা paste করুন** — এটা `eyJ...` দিয়ে শুরু হয়ে ৩টা dot-separated segment থাকবে (header.payload.signature)। আপনি যেটা দিয়েছেন সেটা `...4OTM3O` তে কেটে গেছে।

Anon key পুরোটা পাওয়ার পর আমি build mode এ গিয়ে সব step execute করব।

Optional — এখনই বলে দিতে পারেন:
- আপনার Supabase server এ কি HTTPS আছে, নাকি শুধু HTTP?
- Repo এর default branch কি `main` না `master`?

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://sweet-migration.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/e871934f-3e45-4e6e-a56e-351943618154).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
