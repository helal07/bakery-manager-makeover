# Ultimate POS ধাঁচের ইউনিট সিস্টেম — লাইভ ডাটা সুরক্ষিত রেখে

## যাচাই (আসল DB + কোড পড়ে)

- `public.units` কলাম: `id, name, short_name, code, is_active` — conversion তথ্য নেই।
- বর্তমান ইউনিট: `box, dz, g, kg, L, ml, pc, pkt`।
- `raw_materials.unit` টেক্সট হিসেবে **কোড** রাখে; ব্যবহৃত মান `pc(1), g(4), ml(1), kg(1)` — সবই `units.code`-এর সাথে মিলে যায়, কোনো এতিম মান নেই।
- `products.unit`-ও টেক্সট কোড; `units` টেবিলে কোনো foreign key নেই।
- `src/lib/unit-store.ts`-এ `renameUnit()` **code পরিবর্তন করতে দেয়** এবং `removeUnit()` শুধু `is_active=false` করে — দুটোতেই ব্যবহৃত হচ্ছে কিনা কোনো চেক নেই।
- `sub_recipes` টেবিলে এখনো কোনো row নেই।

## আপনার আশঙ্কা — কোনটা সত্যি, কোনটা নয়

| অ্যাকশন | সংরক্ষিত ডাটার উপর প্রভাব |
|---|---|
| নতুন সাব-ইউনিট যোগ (g → base kg, ১০০০) | **কোনো প্রভাব নেই** — শুধু নতুন row |
| conversion factor বদলানো | সংরক্ষিত qty/দাম **বদলায় না**; শুধু ভবিষ্যতের auto-yield ও mixed-unit যোগফলের হিসাব বদলায় |
| base unit বাঁধা/খোলা | ঐ একই — শুধু গণনা |
| **unit code rename (kg → KG)** | **আসল ঝুঁকি** — `raw_materials.unit`/`products.unit`-এর পুরনো টেক্সট আর মিলবে না, ইউনিট "unknown" হয়ে যাবে |
| **unit delete (soft)** | **ঝুঁকি** — ব্যবহৃত ইউনিট লিস্ট থেকে হারাবে, ফর্মে খালি দেখাবে |

তাই নতুন ফিচারটা নিরাপদ; বিপদ আসলে **rename/delete**-এ, যা এখন সম্পূর্ণ অরক্ষিত। প্ল্যানে দুটোই ঠিক করা হবে।

## ১. SQL — সম্পূর্ণ additive (`sql/21_unit_conversions.sql`, idempotent)

```sql
ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS base_unit_id uuid REFERENCES public.units(id),
  ADD COLUMN IF NOT EXISTS conversion_factor numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS allow_decimal boolean NOT NULL DEFAULT true;
```

- কোনো কলাম drop/rename নেই, কোনো row আপডেট নেই।
- সব বিদ্যমান ইউনিট `base_unit_id = NULL, factor = 1` → base unit, আচরণ হুবহু আগের মতো।
- Guard: self-reference নিষেধ, `factor > 0`, এবং nesting এক লেভেল (base unit-এর নিজের base থাকবে না — চেইন লুপ ঠেকাতে)।
- Lovable Cloud-এ migration tool দিয়ে, VPS-এ একই ফাইল কপি-পেস্ট।

## ২. Rename / Delete গার্ড (ডাটা লস ঠেকানোর মূল অংশ)

- **Code rename ব্লক** যদি ঐ code কোনো `raw_materials` বা `products`-এ ব্যবহৃত হয়: "এই ইউনিট ৪টি raw material-এ ব্যবহৃত — code বদলানো যাবে না, শুধু নাম বদলান।" (নাম/short name/decimal অবাধে বদলাবে)
- **Delete ব্লক** যদি ব্যবহৃত হয়, অথবা অন্য ইউনিট একে base হিসেবে ধরে থাকে: কোথায় ব্যবহৃত তার গণনা দেখানো হবে।
- **Base/factor বদলালে confirm**: "এতে সংরক্ষিত স্টক বা দাম বদলাবে না — শুধু ভবিষ্যতের রূপান্তর হিসাব বদলাবে।" সাথে আগে/পরে উদাহরণ (১ kg = ১০০০ g → ৫০০)।
- কোনো ধাপেই সংরক্ষিত quantity re-scale করা হবে **না** — এটাই ডাটা-নিরাপত্তার মূল নিয়ম।

## ৩. Units পেজ (`products.units.tsx`) — Ultimate POS ফর্ম

```text
Name*               [Kilogram]
Short name / code*  [kg]           (ব্যবহৃত হলে লক + ব্যাখ্যা)
Allow decimal*      [Yes / No]
[x] Add as multiple of other unit
    1 Kilogram = [1000] [Gram v]
```

লিস্টে নতুন কলাম: **Base unit**, **Conversion** ("1 kg = 1000 g"), **ব্যবহৃত** (কয়টি material/product)।

## ৪. রূপান্তর ইঞ্জিন (`src/lib/unit-convert.ts`)

- DB-র units থেকে গ্রাফ: qty → base (`* factor`) → target (`/ factor`)।
- `convert(qty, fromCode, toCode, units)` → `number | null` (ভিন্ন base হলে null, কখনো ভুল যোগ নয়)।
- কোনো hardcoded kg/g ম্যাপিং থাকবে না — সবই ইউজারের সেট করা মান।

## ৫. Auto Yield ঠিক করা (`sub-recipes.tsx`)

- এখন: ১ kg + ৫০০ g = ৫০১ (ভুল)। নতুন: yield unit-এ কনভার্ট করে যোগ → **১.৫ kg** (yield unit `g` হলে ১৫০০)।
- অ-রূপান্তরযোগ্য আইটেম (৫ pc ডিম) যোগফলে ধরা হবে না, নিচে স্পষ্ট নোট + "Units পেজে conversion সেট করুন" লিংক।
- Manual মোড আগের মতোই থাকবে।

## ৬. সাব-রেসিপি expansion

`expandIngredients()`-এ রেসিপির qty ইউনিট আর সাব-রেসিপির yield unit ভিন্ন হলে কনভার্ট করে ratio হবে (৫০০ g ÷ ১ kg = ০.৫), এখন যা ৫০০ ধরছে। Product form ও Production workbench-এর cost preview/overlap warning একই হেল্পার ব্যবহার করবে।

## যা স্পর্শ করা হবে না

`raw_materials.unit`, `products.unit`, `raw_material_stock.quantity`, `product_stock.quantity`, `recipes.qty`, `sub_recipe_items.qty`, `raw_materials.cost`, এবং `commit_production_batch` RPC — কোনোটিই migrate বা re-scale হবে না। raw material deduction আগের মতোই material-এর নিজের ইউনিটে হবে।

## Files to touch

- `sql/21_unit_conversions.sql` (new) + `sql/applied.md` এন্ট্রি
- `src/lib/unit-store.ts` — নতুন ফিল্ড + usage-count চেক, rename/delete গার্ড
- `src/lib/unit-convert.ts` (new)
- `src/routes/_authenticated/products.units.tsx` — নতুন ফর্ম, লিস্ট কলাম, confirm dialog
- `src/routes/_authenticated/sub-recipes.tsx` — unit-aware auto yield + নোট
- `src/lib/sub-recipe-store.ts` — `expandIngredients`-এ unit-aware ratio
