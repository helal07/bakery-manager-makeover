# Recipes-as-template + Product Duplication

Four surgical changes. Recipes stay per-product in DB (no schema change); the Product form just gains a template picker so operators don't retype identical ingredient lists.

---

## 1. Product form — "Enable Recipe" toggle + template picker

**File:** `src/components/product-form.tsx`

- Add a boolean `recipeEnabled` (default: `ingredients.length > 0` for edit, `false` for new). Above the current "Ingredients & Measurement" card render a toggle: **"This product has a recipe"**. When off, hide the ingredients + overheads UI and clear both state arrays on save.
- When on, render a new **"Copy from recipe"** row above the ingredient list: searchable picker listing every product that currently has ≥1 recipe row (loaded via `loadRecipes()`). Selecting one:
  - loads `loadRecipeFor(sourceProductId)` + `loadRecipeOverheads(sourceProductId)`,
  - replaces the current editor's ingredient/overhead state with those rows,
  - shows a small helper "Copied from <name> — edits below only affect this product." Source recipe is never mutated because save writes to the CURRENT product's `product_id` via existing `saveRecipe`/`saveRecipeOverheads`.
- Overheads section: pull overheads into the product form the same way recipes.tsx does (load categories, allow add row, per_unit/per_batch), so overrides survive the copy.

## 2. Quantity inputs — 6-decimal text field

Every ingredient qty and per-unit overhead amount input becomes a text-mode field (matches the existing "opening stock" pattern already used to defeat leading-zero issues):

- `type="text"`, `inputMode="decimal"`, `placeholder="0"`, empty string allowed.
- Accept regex `^\d*(\.\d{0,6})?$`; reject other keystrokes by not updating state.
- Store as string in local state; convert with `Number(v)` only at save time. On save reject rows where the parsed number is `0` or `NaN` (existing dedupe/qty>0 check already lives in `saveRecipe`, keep client-side error toast too).
- Apply to: `src/components/product-form.tsx` ingredient qty + overhead amount; `src/routes/_authenticated/recipes.tsx` editor ingredient qty + overhead amount + batch qty.

## 3. Recipes workbench — visible recipe list + all products in "New Recipe"

**File:** `src/routes/_authenticated/recipes.tsx`

- **New Recipe dialog product picker** currently limits choices to `products` filtered by recipe presence in some paths. Change `openNewRecipe` (and the picker inside the dialog) to list **all active products**, sorted so products without a recipe come first, followed by a divider then products that already have one (with "override" hint). This makes it possible to attach a recipe to a newly-created product from here.
- **Recipe list beside the header button.** The current "product selector" card is a searchable picker that only shows `withRecipes` — from a small viewport it's easy to miss. Add a compact left sidebar (on ≥md) / collapsible section (on mobile) that lists every recipe with product name + ingredient count + last-produced date, clicking a row sets `activeId` and switches to the recipe tab. Keep the search picker for large lists but always render this visible list.
- Small polish: batch qty input in Produce tab uses the same text-mode / 6-decimal rule.

## 4. Product Duplication

**Product list — `src/routes/_authenticated/products.index.tsx`**
- Add a **"Duplicate"** item to the row Actions dropdown between Edit and Labels, using `Copy` from `lucide-react`. Click → `navigate({ to: "/products/new", search: { from: p.id } })`.

**Product new route — `src/routes/_authenticated/products.new.tsx`**
- Add `validateSearch` accepting `from?: string` via `zodValidator` + `fallback`; pass it to `<ProductForm from={search.from} />`.

**Product form — `src/components/product-form.tsx`**
- Accept new prop `from?: string`. On mount, when not in edit mode and `from` is present, `loadProducts()` + find that product and pre-fill:
  - `name` → `"<orig> (Copy)"`
  - `sku` → cleared (auto-generate on save)
  - `stock` → `"0"`
  - all other fields (category, price, cost, threshold, shelf life, image URL) copied verbatim
- Duplicate does **not** copy the recipe or toggle "recipeEnabled" on — user picks a template from the new picker if they want to reuse ingredients (§1).

---

## Not touched

- DB schema / RLS: recipes remain 1:1 with `product_id`; no new tables or FK moves.
- `commit_production_batch` RPC: unchanged.
- Overhead category CRUD: unchanged.

## Files edited

1. `src/components/product-form.tsx` — toggle, template picker, overhead section, text qty inputs, `from` prefill.
2. `src/routes/_authenticated/products.new.tsx` — accept `?from=` search.
3. `src/routes/_authenticated/products.index.tsx` — Duplicate action.
4. `src/routes/_authenticated/recipes.tsx` — visible recipe list, "New Recipe" shows all products, text qty inputs.
