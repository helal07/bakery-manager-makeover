# Sub-Recipe (Intermediate Product) ফিচার

## লক্ষ্য
"বেসিক খামির"-এর মতো master/intermediate recipe তৈরি করা যাবে। ফাইনাল প্রোডাক্টের (যেমন বাটার বান) recipe-এ ingredient হিসেবে raw material + sub-recipe দুটোই ব্যবহার করা যাবে। প্রোডাকশনে সিস্টেম নিজে থেকে nested raw material breakdown হিসাব করে stock deduct করবে।

## কনসেপ্ট

```text
বেসিক খামির (yield: 100 kg)         বাটার বান (per 1 pc, 200 gm)
├─ ময়দা 80 kg                        ├─ বেসিক খামির 0.2 kg  ←─ sub-recipe
├─ চিনি 10 kg                         │    auto expand:
├─ তেল  5 kg                          │    ময়দা 160g, চিনি 20g,
├─ ইস্ট  2.5 kg                       │    তেল 10g, ইস্ট 5g, মসলা 5g
└─ মসলা 2.5 kg                        └─ বাটার 0.015 kg
```

## Scope (এই phase-এ)

- **Sub-recipe শুধু raw material নেবে** (Phase 1) — nested sub-recipe Phase 2-তে
- **Yield unit free-form** — kg, gm, L, ml, pc যেকোনো unit (units টেবিল থেকে)

## Data Model (`sql/19_sub_recipes.sql`)

**নতুন tables:**
- `sub_recipes` — id, name, yield_qty numeric, yield_unit text, is_active, timestamps
- `sub_recipe_items` — id, sub_recipe_id (fk), material_id (fk raw_materials), qty numeric, timestamps

**`recipes` টেবিলে পরিবর্তন:**
- নতুন nullable column: `sub_recipe_id uuid references sub_recipes`
- `material_id` কে nullable করা
- CHECK constraint: exactly one of `(material_id, sub_recipe_id)` non-null
- Unique index: `(product_id, coalesce(material_id, sub_recipe_id))` — duplicate ban

**GRANTs + RLS:** authenticated CRUD, service_role ALL। Existing recipe patterns follow করবে।

## Backend RPC (`commit_production_batch` v3)

Overload বদলাবে (backwards-compatible):
- Ingredient JSON item এখন হয় `{ materialId, qty }` অথবা `{ subRecipeId, qty }`
- Expansion logic:
  1. Direct materials collect
  2. প্রতিটি sub-recipe reference-এর জন্য: `sub_recipe_items` fetch → ratio = `qty / yield_qty` → প্রতিটা child material-এর required = `child.qty × ratio × batch`
  3. একই material-এর requirement aggregate (Map by material_id)
- Stock lock + shortfall check হবে final aggregated list-এ (partial deduct থেকে বাঁচাতে)
- Sub-recipe এর ভেতর sub-recipe ban (validation error) — Phase 1

## Frontend

**নতুন Route:** `/recipes/sub-recipes` (sidebar-এ "Sub-Recipes" submenu Production/Recipes-এর নিচে)
- List + create/edit dialog: name, yield qty + unit picker, ingredient rows (IngredientPicker reuse)
- Delete guard: কোনো recipe এই sub-recipe reference করলে block

**Recipe editor (`recipes.tsx` RecipeEditorDialog) আপডেট:**
- প্রতিটি ingredient row-এ toggle: **Raw Material** | **Sub-Recipe**
- Sub-Recipe select করলে qty ইনপুট (unit auto-shown from sub_recipe.yield_unit)
- Live preview panel: expanded raw material breakdown + total cost estimate (sub-recipe cost = Σ material cost × ratio)

**Produce tab:**
- Batch commit-এর আগে expanded material list + shortfall hint দেখাবে

**Cost aggregation:**
- Sub-recipe cost per yield unit = Σ (item.qty × material.cost) ÷ yield_qty
- Product cost preview এই expanded value use করবে

## Migration ফাইল
`sql/19_sub_recipes.sql` — idempotent (CREATE IF NOT EXISTS, DROP+CREATE policies, function replace), GRANTs + RLS + updated RPC সব একসাথে। VPS-এ SQL Editor-এ apply।
`sql/applied.md`-তে entry যোগ।

## App logic-এ ইমপ্যাক্ট
- Existing recipes অক্ষুণ্ণ (material_id-based rows valid থাকবে)
- Existing `commit_production_batch` calls same signature — শুধু ingredient item shape optional-ly sub-recipe support করবে
- `loadRecipeFor` / `saveRecipe` extend করা লাগবে sub-recipe row handle করার জন্য

## Phase 2 (পরে, চাইলে)
- Nested sub-recipe (recursive expansion, cycle detection)
- Sub-recipe এ overhead category
- Sub-recipe batch production tracking (আলাদা stock ধরা)

শুরু করব?
