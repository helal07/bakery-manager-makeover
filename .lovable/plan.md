
## Problem

Two invoice surfaces render differently even though they share `/invoice/$id` and `<InvoicePreview />`:

- **POS → F9 → auto-open**: opens `window.open("/invoice/${sale.id}", ...)` with a local snapshot stashed in `localStorage:invoice:<saleId>`. That snapshot is missing `discount`, `shipping`, `previousDue`, and `payments`, so the preview shows no "Discount" line and the *Today's Bill + Previous Due = Total − Today Payment = Due Till Today* block collapses (rows are conditional on non-zero values).
- **Sales List → Print**: no local snapshot, so `fetchSaleSnapshot()` runs and pulls `sale.discount`, computes `previousDue`, loads `sale_payments` → full breakdown → looks like "a different invoice".

Confirmed:
- `src/routes/_authenticated/pos.tsx` (~L481) snapshot omits `discount`, `shipping`, `previousDue`, `payments`.
- `src/routes/invoice.$id.tsx` eagerly renders the localStorage snapshot; DB fetch overwrites, but auto-print can fire on the partial version.
- `src/components/invoice-preview.tsx` — breakdown rows exist but are conditionally hidden when values are 0.
- DB: `sales.discount` exists, `sales.shipping` does **not**. `sale_items` already has `discount_amount` (from legacy part 9) — no new column needed.

## Fix (data parity + breakdown rows + wire per-line discount storage)

### 1. `src/routes/_authenticated/pos.tsx` — enrich the invoice snapshot before opening the print window

In the sale-completion block, include on the snapshot:
- `discount` (sale-level, already in state),
- `shipping` (already in state),
- `previousDue`: reuse the `customerDue` already computed in the header,
- `payments`: mirror the `payRows` we just inserted (`{ method, amount, reference }`),
- `customer.address` when a saved customer is selected.

Also persist per-line discount when inserting `sale_items`: add `discount_amount: Number(line.discount || 0)` to each row (column already exists). If the current POS UI has no per-line discount input, pass 0 for now — the storage path is wired so future UI changes just flow through.

### 2. `src/routes/invoice.$id.tsx` — always prefer fresh DB data before printing

- Keep the localStorage read as a fallback only; don't set `stored` from it eagerly. Instead, await `fetchSaleSnapshot()` and only fall back to the localStorage snapshot if the DB fetch returns nothing.
- Include `sale_items.discount_amount` in the select and map it to `discount` on each `InvoiceLine`.
- Coerce `sale.shipping` safely with `Number(sale.shipping ?? 0)` (schema currently lacks the column; treat as 0).
- Auto-print already waits for `ready`; keep that gate — this ensures the DB-hydrated snapshot is what prints.

### 3. `src/components/invoice-preview.tsx` — always render the breakdown skeleton

The block *Today's Bill + Previous Due = Total − Today Payment = Due Till Today* currently hides rows when their values are 0, breaking the equation visually. Change so:
- "Previous Due" row renders whenever a new `showPreviousDue` toggle is on (default true), even when 0.
- "Today Payment" row renders whenever `s.showPaid` is on, regardless of amount.
- Mirror the same three-row structure into the thermal (58/80mm) layout for parity.

No visual redesign — only unhiding rows and adding the missing per-line `discount` column value already supported by the type.

### 4. `src/lib/company-settings.ts` — add `showPreviousDue` toggle

Add `showPreviousDue: boolean` to `InvoiceSettings` (default `true`) and expose it as a checkbox in the Invoice tab of `src/routes/_authenticated/settings.index.tsx` under existing Totals toggles.

## Out of scope

- Restyling the invoice — only data parity and the missing breakdown rows.
- Adding a per-line discount input to the POS cart UI — storage path is wired; UI stays as-is unless requested next.
