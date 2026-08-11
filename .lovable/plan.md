# Editable SKU with duplicate check

Today the SKU box in Add/Edit Product is read-only and always auto-filled from category + name. Make it optional and user-controlled instead.

## Behaviour

- SKU field becomes editable (both Add and Edit Product).
- Leave it blank → the system generates one on save (current auto format), and retries with a new random suffix if that generated code happens to be taken.
- Type your own → it is saved exactly as typed (trimmed), never overwritten.
- Auto-fill only assists while the field is untouched: typing a name/category still suggests a code, but once you edit the SKU by hand, suggestions stop overwriting it. A small "Regenerate" action lets you get a suggestion back.
- Duplicate protection: on blur and again on save, the app checks whether another product already uses that code. If so it blocks saving with a clear message naming the conflicting product. The database already enforces uniqueness, so a race still fails safely with a friendly "SKU already exists" message instead of a raw error.
- On Edit, the product's own existing SKU is not treated as a duplicate of itself.

## Technical notes

- `src/components/product-form.tsx`: drop `readOnly` on the SKU input, add `skuTouched` state so `genSku` no longer clobbers manual input on name/category change, add a debounced availability lookup and inline validation state, and validate inside `doSave` before writing.
- `src/lib/product-store.ts`: add a `findProductBySku(sku, excludeId?)` helper (case-insensitive `ilike` match on `products.sku`) and map Postgres unique-violation `23505` on `products_sku_key` to a readable error in `addProduct`/`updateProduct`.
- `updateProduct` already forwards `sku`, so edit saves need no schema change. No migration required — `products_sku_key` unique index already exists.
