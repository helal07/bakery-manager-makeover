
আমি ৪টা কাজ আলাদা আলাদা স্টেপে করব। প্রতি স্টেপ শেষে আপনার অনুমতি নিয়ে পরবর্তী স্টেপে যাব।

## Step 1 — "New Recipe" পপআপ বড় ও ইউজার-ফ্রেন্ডলি
**সমস্যা:** `src/routes/_authenticated/recipes.tsx`-এ New Recipe dialog ছোট, Target Product লিস্টে সব প্রোডাক্ট আসে না বা খুঁজে পেতে কষ্ট হয়।

**করব:**
- Dialog width `max-w-3xl`, height responsive (মোবাইলে full-screen sheet, ডেস্কটপে বড় modal)
- Target Product সার্চ ইনপুট + স্ক্রলেবল লিস্ট, সব active products লোড হচ্ছে কিনা verify (query limit চেক)
- প্রতিটি row-এ: product name, SKU, category badge, "has recipe" hint
- Recent/Popular sort, keyboard nav (↑↓ Enter)
- মোবাইলে full-height bottom sheet

## Step 2 — পুরো প্রজেক্ট Mobile Responsive
- সব list pages (`products.index`, `sales.list`, `purchasing.list`, `crm.index`, `transfers.index`, `production.*`, `expenses.*`, `employees.*`) — টেবিলগুলো মোবাইলে card-view / horizontal scroll
- সব form pages (product, employee, purchase, transfer, recipe) — grid `sm:grid-cols-2` এ collapse, touch-friendly inputs (min-h-11)
- Dialogs → মোবাইলে full-screen sheet
- AppShell sidebar → মোবাইলে drawer overlay, sticky top bar height compact
- POS mobile pass আরেকবার (cart drawer, keypad)
- Report/print pages preview করে বাদ

## Step 3 — PWA (installable app)
- `public/manifest.webmanifest` তৈরি — name/short_name from company settings, `display: standalone`, theme/background color from settings
- `src/routes/__root.tsx` head-এ manifest link + apple-touch-icon
- **PWA icon = Settings → Company Logo** (dynamic runtime override via generated icons থেকে logoDataUrl)
- Manifest-only ইনস্টলেবিলিটি (offline/service worker না — Lovable preview safety)
- Settings → Appearance-এ PWA preview কার্ড (icon + name preview)

## Step 4 — POS Barcode Scanner (মোবাইল ক্যামেরা)
- Library: `@zxing/browser` (bundle-friendly, works on iOS Safari 14+)
- `src/routes/_authenticated/pos.tsx`-এ "Scan" বাটন → full-screen camera sheet
- Rear camera priority, torch toggle, scan region overlay
- Barcode detect → products লিস্টে SKU/barcode match → auto-add to cart + beep
- Continuous scan mode (একাধিক পণ্য পরপর) অথবা single-shot
- Fallback: keyboard USB scanner (existing text input) untouched
- Product model-এ যদি `barcode` কলাম না থাকে → SKU দিয়ে match; পরে barcode field add করার সুযোগ

---

## Order of execution
Step 1 → আপনি approve করলে → Step 2 → approve → Step 3 → approve → Step 4।

**এখন Step 1 (Recipe popup) দিয়ে শুরু করব?**
