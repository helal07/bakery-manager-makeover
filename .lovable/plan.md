# Product Add/Edit-এ Sub-Recipe হিসাব

এখন Product form-এর "Recipe & Ingredients" section-এ শুধু raw material row যোগ করা যায়। Sub-recipe (যেমন "বেসিক খামির") ingredient হিসেবে select করার UI নেই — যদিও backend (`recipes.sub_recipe_id`, `commit_production_batch` expansion) ও standalone Recipes Workbench এতে prepared আছে। এই প্ল্যান শুধু Product form-এ সেই UI ও হিসাব যোগ করবে; database/RPC-এ কোনো পরিবর্তন লাগবে না।

## স্কোপ

- File: `src/components/product-form.tsx` (Recipe & Ingredients section + save + cost preview)
- বাকি সব (POS, Production commit, Recipes Workbench) অপরিবর্তিত

## UX ধারণা

Recipe section-এ প্রতিটা ingredient row-এ একটা source-toggle থাকবে:

```text
[ Material ▾ | Sub-Recipe ▾ ]   [ Picker: raw material OR sub-recipe ]   [ Qty ]  [ unit ]  [× remove]
```

- Default = Material (existing behavior অক্ষুণ্ণ)
- "Sub-Recipe" বেছে নিলে picker sub-recipe list দেখায়, unit label sub-recipe-এর `yield_unit` থেকে আসবে
- "Add ingredient" ড্রপডাউনে দুইটা option: **Add material** / **Add sub-recipe**
- Duplicate guard: একই material বা একই sub-recipe দ্বিতীয়বার add করা যাবে না (দুটো আলাদা set)

Recipe panel-এর নিচে ছোট "Expanded raw material preview" (collapsible):

- Sub-recipe row গুলো auto-expand করে aggregated raw material list + estimated cost per unit product দেখাবে (Recipes Workbench-এর মতো একই expansion logic)
- এতে user বুঝতে পারবে ১ ইউনিট product বানাতে actual কোন raw material কত লাগবে

## হিসাবের নিয়ম (frontend preview মাত্র)

প্রতিটা ingredient row per-unit product-এর জন্য:

- Material row → `qty` raw material সরাসরি
- Sub-recipe row → `ratio = qty / subRecipe.yield_qty`; প্রতিটা `sub_recipe_items[i]` থেকে `child.qty × ratio` raw material
- একই material একাধিক জায়গা থেকে এলে aggregate

Cost per unit = Σ (aggregated_qty × raw_material.cost). এই মানটা existing cost preview-এর জায়গায় দেখাবে (যদি recipe enabled থাকে)।

## State ও Save পরিবর্তন

- `IngredientRow` type: `{ materialId?: string; subRecipeId?: string; qty: string }`
- `loadRecipeFor` এখন `subRecipeId` সহ ফেরত দেয় — সেটা state-এ hydrate হবে
- Save-এ `Ingredient[]` build করার সময় sub-recipe row-এর জন্য `{ subRecipeId, qty }` আর material row-এর জন্য `{ materialId, qty }` পাঠাবে (existing `saveRecipe` এটা handle করে)
- Validation: qty > 0, প্রতি row-এ material বা sub-recipe যেকোনো একটা থাকতেই হবে, duplicate নেই
- "Copy ingredients from existing recipe" flow এও sub-recipe row copy করবে

## ভ্যালিডেশন ও edge case

- Sub-recipe list load fail হলে row toggle disabled + tooltip
- Inactive sub-recipe existing recipe-এ থাকলে read-only badge "inactive" দেখাবে, save block নয় কিন্তু warning
- Yield unit 0 বা missing হলে expansion থেকে skip + row-এ warning

## Out of scope

- Nested sub-recipe (sub-recipe-এর ভেতরে sub-recipe) — Phase 2
- Overhead UI product form-এ যোগ করা — Recipes Workbench-এই থাকবে
- Backend RPC/SQL — আগেই patch 19-এ done

শুরু করব?
