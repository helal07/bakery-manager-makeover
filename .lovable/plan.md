# Customizable Invoice from Backend

Right now `src/routes/invoice.$id.tsx` hardcodes layout, colors, labels, badge text, footer, signature captions and thermal widths. Goal: move all of that into an **Invoice Settings** panel saved in `company_settings.settings` (jsonb — already exists, no migration needed), with a live preview like Ultimate POS.

## What the user configures (Settings → Invoice)

**Header**
- Show/hide: logo, business name, tagline, VAT reg, address, phone, email
- Header style: `gradient` | `solid` | `minimal` | `bordered`
- Header color (uses design tokens; stored as HSL string)
- Invoice title label (e.g. "Invoice", "Tax Invoice", "Cash Memo", "চালান")
- Invoice number prefix + padding (e.g. `INV-` / 6 digits) — replaces current `INV-<id-slice>`

**Outlet & Customer blocks**
- Toggle: show outlet block, show customer block, show "Served by"
- Custom labels (Outlet / Billed to / Details) — supports Bengali

**Items table**
- Column toggles: `#`, SKU, Qty, Unit, Price, Discount, Tax, Amount
- Show item notes row
- Zebra rows on/off

**Totals**
- Toggle: Subtotal, Discount, VAT, Shipping, Round-off, Grand Total, Paid, Due, Change
- Custom labels + currency symbol (default ৳) + decimal places
- Amount-in-words on/off (Bangla/English)

**Footer**
- Multi-line footer note (rich text: bold/italic/line-breaks)
- Terms & conditions block (separate)
- Signature captions (Customer / Authorized) — editable, or hide entirely
- Show "Powered by …" line on/off

**Print / paper**
- Default paper size: A4 / 80mm / 58mm
- Thermal: font size, monospace font on/off, show logo on/off, dashed vs solid separators
- Auto-print after sale: on/off (currently always on via `ap=1`)
- QR code: none | invoice link | UPI/bKash payload (text template)
- Barcode of invoice number: on/off

**Branding**
- Accent color (drives header + badges + total row)
- Watermark text (e.g. "PAID" / "DUPLICATE")
- Duplicate-copy label ("Original / Customer Copy / Merchant Copy")

## Data model (no migration required)

Store everything under `company_settings.settings.invoice` as a typed JSON blob. Add helpers in `src/lib/company-settings.ts`:

- `InvoiceSettings` type + `defaultInvoiceSettings`
- `getInvoiceSettings()` / `saveInvoiceSettings(patch)` — reads/writes `settings.invoice`, merges with defaults, updates the same cache used by `getCompany()` so navigating stays instant
- Per-showroom override: `showrooms.settings jsonb` (add later if requested) — v1 uses global only

## UI changes

1. `src/routes/_authenticated/settings.index.tsx` — new **Invoice** tab with three panels: *Content*, *Style*, *Print*. Right-side sticky **Live Preview** iframe pointing to `/invoice/preview?draft=1` reading unsaved values from `sessionStorage`.
2. New `src/components/invoice-preview.tsx` — extracts the render logic from `invoice.$id.tsx` and takes `(snapshot, invoiceSettings, company, paper)` as props. Both the settings preview and the real invoice route render through it — single source of truth.
3. Refactor `src/routes/invoice.$id.tsx` to:
   - Load `invoiceSettings` alongside `company`
   - Delegate rendering to `<InvoicePreview />`
   - Replace hardcoded labels/badges/columns/footers with settings values
4. `src/routes/_authenticated/pos.tsx` — respect `invoiceSettings.autoPrint` (drop forced `ap=1` when off), and use `invoiceSettings.numbering` to generate the reference stored in the snapshot.

## Behavior details

- Number generator: `${prefix}${String(seq).padStart(pad, "0")}` where `seq` comes from a monotonic counter per showroom stored in `company_settings.settings.invoice.counters` (updated in same POS transaction that saves the sale).
- Toggling a column also hides its total column and adjusts the thermal template widths.
- All colors go through CSS variables set on the invoice root; no hex in components — keeps dark-mode/theme rules intact.
- Bengali labels supported since values are user-entered strings.

## Out of scope for v1 (call out for next round)

- Multiple named templates + assign per showroom/customer group
- Email/WhatsApp send from invoice screen
- Custom HTML template editor
- Per-showroom invoice override (structure supports it; UI later)

## Files to touch

- `src/lib/company-settings.ts` — add `InvoiceSettings` type, defaults, `getInvoiceSettings`, `saveInvoiceSettings`
- `src/components/invoice-preview.tsx` — new, shared renderer
- `src/routes/invoice.$id.tsx` — thin wrapper over `<InvoicePreview />`
- `src/routes/_authenticated/settings.index.tsx` — new Invoice tab + live preview
- `src/routes/_authenticated/pos.tsx` — apply numbering + autoPrint settings

No SQL migration. If later we want per-showroom overrides, we'll add `sql/09_showroom_settings.sql`.
