## 1. একাধিক সাব-রেসিপি দিয়ে একটা প্রোডাকশন

**বর্তমান অবস্থা (কোড পড়ে যাচাই করা):** প্রোডাক্ট রেসিপিতে ইতিমধ্যেই একাধিক সাব-রেসিপি row যোগ করা যায় (`product-form.tsx` ও `recipes.tsx` দুই জায়গাতেই), এবং `commit_production_batch` RPC সব সাব-রেসিপি expand করে raw material অটো কেটে নেয় — একই material দুই সাব-রেসিপিতে থাকলে যোগ করে একবারেই deduct করে। শুধু একই সাব-রেসিপি দুইবার যোগ করা ব্লকড, ভিন্ন সাব-রেসিপি নয়।

বাকি কাজ = **overlap warning + স্পষ্ট UI**:

- **Overlap detection**: সব সাব-রেসিপি expand করে দেখা হবে কোন raw material একাধিক উৎসে (দুই সাব-রেসিপি, বা সাব-রেসিপি + সরাসরি material) আছে। থাকলে amber warning banner:
  > "ময়দা ২টি সাব-রেসিপিতে আছে (ক্রিম বেস, কেক বান) — মোট ৩.২ কেজি একসাথে কাটা হবে"
  Blocking নয়, শুধু সতর্কতা।
- জায়গা: `product-form.tsx`-এর ingredient section এবং `recipes.tsx`-এর Produce/Edit Recipe ট্যাব — একই helper দিয়ে।
- **Expanded breakdown**: কোন material কোন সাব-রেসিপি থেকে কত আসছে, source badge সহ।

ডাটাবেস পরিবর্তন লাগবে না।

## 2. সাব-রেসিপি Add বাটন আলাদা করা

নতুন প্রোডাক্ট তৈরি/এডিটে "Add sub-recipe" ingredient row-এর ভেতরের টগল থেকে বের করে **হেডারের পাশে আলাদা বাটন**:

```text
Ingredients            [+ Add ingredient]  [+ Add sub-recipe]
```

- দুইটা আলাদা বাটন পাশাপাশি (মোবাইলে stack)।
- "Add sub-recipe" ক্লিকে সরাসরি সাব-রেসিপি row যোগ হবে (সার্চেবল পিকার সহ); row-এর ভেতরের raw-material/sub-recipe টগল বাদ যাবে।
- সাব-রেসিপি row-এ ছোট "Sub-recipe" badge।

## 3. Unsaved-changes গার্ড (সেভ / ডোন্ট সেভ)

ইউজার কিছু বদলানোর পর ক্লোজ/ক্যানসেল/নেভিগেট করলে confirm dialog:

```text
পরিবর্তন সেভ করা হয়নি
[ সেভ করুন ]  [ সেভ ছাড়া বন্ধ করুন ]  [ বাতিল ]
```

**কভারেজ:**
- Sub-Recipe editor modal
- Recipes পেজের Edit Recipe ট্যাব ও New Recipe dialog
- **Product list → New Product (`products.new.tsx`) ও Edit Product (`products.edit.$id.tsx`)** — এগুলো ফুল-পেজ রুট, তাই Cancel/Back বাটন, সাইডবার নেভিগেশন, ব্রাউজার back — সব ক্ষেত্রেই গার্ড কাজ করবে। "সেভ করুন" চাপলে ফর্মের normal submit চলবে (validation fail করলে navigation বাতিল হবে)।

**কারিগরি:**
- Dirty tracking: initial snapshot বনাম current state তুলনা — কিছু না বদলালে dialog আসবে না।
- Trigger: X/Cancel বাটন, backdrop, Esc, TanStack Router-এর route blocker, আর ফুল-পেজে `beforeunload` (ট্যাব বন্ধ/রিলোড)।
- **Destructive action-এও confirm**: ingredient/sub-recipe row মুছলে ও Delete sub-recipe/product-এ নেটিভ `confirm()`-এর বদলে একই confirm dialog।
- একটাই shared `<ConfirmDialog />` + `useUnsavedChanges()` হুক, যাতে সব জায়গায় একই আচরণ থাকে।

## 4. Yield qty অটো হিসাব

`sub-recipes.tsx` এডিটরে:

- ডিফল্টে **Auto** মোড: ইনগ্রেডিয়েন্টের qty-গুলোর যোগফল লাইভ Yield qty-তে বসবে (read-only, "auto" ব্যাজ)।
- পাশে **Manual** টগল — কেউ চাইলে নিজে লিখবে (রান্নায় পানি শুকিয়ে গেলে yield কম হয়)। Edit/Duplicate-এ পুরনো ভ্যালু manual হিসেবে লোড হবে, ইনগ্রেডিয়েন্ট বদলালে "Auto করুন?" hint।
- ইউনিট না মিললে নোট: "ইউনিট ভিন্ন — যোগফল আনুমানিক"।

## 5. সিরিয়াল নম্বর + সর্টিং

- প্রতিটা accordion row-এর শুরুতে **সিরিয়াল নম্বর** badge (১, ২, ৩…)।
- সার্চের পাশে **Sort** ড্রপডাউন: Name (A→Z / Z→A), Ingredient সংখ্যা, Yield qty, খরচ/ইউনিট, নতুন আগে।
- সর্ট করলেও সিরিয়াল ১ থেকে দেখানো হবে।

## Technical notes

- `src/lib/sub-recipe-store.ts`-এ `expandIngredients()` helper — ingredient list → `{ materialId, total, sources: [{ subRecipeName, qty }] }`, সব পেজে reuse।
- `loadSubRecipes()`-এ `created_at` সিলেক্ট যোগ (সর্টিং)।
- নতুন `src/components/confirm-dialog.tsx` + `src/hooks/use-unsaved-changes.ts`।
- কোনো SQL migration লাগছে না।

## Files to touch
- `src/lib/sub-recipe-store.ts` — expand helper + created_at
- `src/components/confirm-dialog.tsx` (new), `src/hooks/use-unsaved-changes.ts` (new)
- `src/routes/_authenticated/sub-recipes.tsx` — auto yield, serial, sort, unsaved guard
- `src/components/product-form.tsx` — আলাদা Add sub-recipe বাটন, overlap warning, dirty state expose
- `src/routes/_authenticated/products.new.tsx` — unsaved guard
- `src/routes/_authenticated/products.edit.$id.tsx` — unsaved guard
- `src/routes/_authenticated/recipes.tsx` — overlap warning, আলাদা বাটন, unsaved guard
