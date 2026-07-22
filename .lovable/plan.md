# Allow finer decimals in recipe ingredient quantity

## Problem
Product form → Ingredients → Qty ফিল্ডে `step="0.01"` দেওয়া আছে, তাই `0.029` কেজি বসাতে গেলে ব্রাউজার "invalid" দেখাচ্ছে। ছোট পরিমাণে (চিনি, ইস্ট, লবণ, ফুড কালার) এতে কস্টিং-এ বড় পার্থক্য হয়।

## Fix
Ingredient Qty ইনপুটে `step="0.0001"` (৪ দশমিক পর্যন্ত, যেমন `0.0290`, `0.0025`) সেট করবো —

- `src/components/product-form.tsx` (line 414): `step="0.01"` → `step="0.0001"`
- `src/routes/_authenticated/recipes.tsx` (line 804): `step="0.001"` → `step="0.0001"` (কনসিস্টেন্সির জন্য)

## Out of scope
- Price/cost ফিল্ড `0.01` (টাকা-পয়সা) — অপরিবর্তিত।
- ডাটাবেজ কলাম `numeric`, ৪+ দশমিক এমনিতেই সাপোর্ট করে — মাইগ্রেশন লাগবে না।
