## Issues

**1. "IT Solution" label** — hardcoded fallback in `src/routes/_authenticated/products.index.tsx` lines 125–126 when no showroom is selected (factory / all scope). It's not from settings; just a stray literal.

**2. Stock Report tab ignores most Filter-card fields.** Only `category` + the search box actually filter rows today (see `filtered`, lines 129–136). `Product Type`, `Unit`, `Tax`, `Brand`, `Business Location`, and `Not for selling` are inert. In particular, the **Business Location** filter does not re-scope stock to the picked showroom — stock is loaded once from `currentShowroomId` and never re-queried.

## Plan

### A. Fix the "IT Solution" label
- Replace the hardcoded fallback with `"All Locations"` when scope is factory/global (no showroom selected). Use the actual showroom name when one is picked. No settings dependency needed.

### B. Make the Filter card actually filter the Products list and Stock Report

Client-side filters (applied to `filtered`, so both tabs react):
- **Category** — already works.
- **Product Type** — `products` has no variants today, so map `All` → no-op, `Single` → show all, `Variable` → empty (documented placeholder until variants ship).
- **Unit** — filter by `products.unit` (already selected in `reports.stock.tsx`; add `unit` to the `loadProducts` select and to the `Product` type).
- **Tax** — `products` has no tax column; hide the Tax select for now (keeps UI honest) OR leave it and make it no-op. Recommend hiding to avoid dead controls.
- **Brand** — same story, no `brand` column. Hide for now.
- **Not for selling** — filter by `products.is_active = false`. Requires loading inactive rows too when the box is checked (today `loadProducts` hardcodes `is_active = true`). Add an `includeInactive` option to `loadProducts` and re-fetch when the toggle flips.

Server-side re-scope (needs a refetch, not just a client filter):
- **Business Location** — when the user picks a specific location, refetch products/stock scoped to that `showroom_id` instead of `currentShowroomId`. When `All`, fall back to `currentShowroomId` (preserves the top-bar showroom switcher behavior). Wire this by adding a `locationOverride` state that feeds `loadProducts(locationOverride ?? currentShowroomId)` inside the existing `useEffect`.

### C. Keep the display label in sync
- `currentShowroomName` (used in the Stock Report header and CSV "Location" column) should reflect the effective scope: overridden location name if set, else the current showroom's name, else `"All Locations"`.

## Technical notes

- Files touched: `src/routes/_authenticated/products.index.tsx`, `src/lib/product-store.ts` (add `unit`, `is_active` to the projection + `includeInactive` option).
- No schema changes. No new SQL migration.
- Tax / Brand selects are removed from the Filters card until the schema grows those columns — cleaner than shipping controls that do nothing.
