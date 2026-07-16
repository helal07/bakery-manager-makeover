## POS 7.0 upgrade plan

Building on the current POS screen (`src/routes/_authenticated/pos.tsx`). Customer search is already fixed to fetch from DB with error surfacing.

### 1. Payment logic (Ultimate POS style)

Rewire the three payment modes:

- **Cash** → single tender, `paid = total`, `due = 0`. No amount input.
- **Credit** (renamed from "Due") → `paid = 0`, `due = total`. Requires a selected customer (not walk-in).
- **Multiple Pay** → opens a modal with rows for Cash / Card / Mobile Banking / Bank Transfer / Cheque. User enters an amount per row; running "Paid" and "Due" totals update live. Any positive due requires a customer.

### 2. Line-level discount & tax

Each cart line gets an inline "…" menu with:
- Discount: `%` or flat `৳`
- Tax override: pick from `tax_rates` table (default = product's tax)

Line total = `(unit_price − discount) × qty × (1 + tax%)`. Cart totals recompute from lines; the fixed 5% VAT block is removed.

### 3. Hold / Recall (suspended sales)

Toolbar buttons: **Hold** and **Recall (N)**.
- Hold snapshots `{ customer, cart, mode, tenders, notes, held_at }` to `public.held_sales` and clears the cart.
- Recall opens a drawer listing held tickets (customer, item count, total, age) with **Load** and **Delete**.
- Held sales are per-cashier, per-showroom.

### 4. Register open / close (cash drawer)

New "Register" pill in the top bar showing OPEN/CLOSED state and current session total.

- **Open register** modal: opening cash float + note → creates `cash_registers` row (`opened_at`, `opening_float`, `cashier_id`, `showroom_id`).
- Every cash-tender sale writes to `cash_register_transactions` linked to the open session.
- **Close register** modal: shows expected cash (opening + cash sales − cash refunds), user enters counted cash, difference is computed, session is closed. Sale is blocked when no register is open (configurable).
- **Z-report** button prints the closing summary.

### 5. Data model additions (migration)

```sql
CREATE TABLE public.held_sales (…cashier_id, showroom_id, customer_id, snapshot jsonb, total, created_at);
CREATE TABLE public.cash_registers (…cashier_id, showroom_id, opening_float, closing_cash, expected_cash, status, opened_at, closed_at);
CREATE TABLE public.cash_register_transactions (…register_id, sale_id, kind, amount, method, created_at);
ALTER TABLE public.sales ADD COLUMN register_id uuid REFERENCES cash_registers(id);
CREATE TABLE public.sale_payments (…sale_id, method, amount);      -- multi-tender
ALTER TABLE public.sale_items ADD COLUMN discount_amount numeric, ADD COLUMN tax_pct numeric;
```

All with GRANTs + RLS scoped to cashier/showroom.

### 6. UI layout (Ultimate POS 7.0)

```text
┌─ Top bar: Exit · POS · Scan · Register(OPEN ৳X) · Shortcuts ──────┐
├─ Toolbar: Customer search │ Group │ Product search │ Hold │ Recall│
├─────────────┬─────────────────────────────────────────────────────┤
│  CART       │  CATEGORY chips                                     │
│  line rows  │                                                     │
│  w/ disc &  │  PRODUCT GRID                                       │
│  tax menu   │                                                     │
│             │                                                     │
│  Totals     │                                                     │
│  Cash│Credit│MultiPay                                             │
│  [Complete] │                                                     │
└─────────────┴─────────────────────────────────────────────────────┘
```

### Technical notes

- New store modules: `src/lib/held-sales-store.ts`, `src/lib/register-store.ts`, `src/lib/tax-store.ts`.
- Multi-tender modal, hold/recall drawer, and register open/close modal are separate components under `src/components/pos/`.
- `complete()` in POS becomes multi-step: create sale → insert `sale_items` (with per-line discount/tax) → insert `sale_payments` rows → cash-register transactions → stock RPCs (unchanged).
- Existing sales/history views need small updates to display payments list and per-line discount.

### Delivery order

1. Migration (schema + GRANTs + RLS).
2. Payment logic (Cash / Credit / Multiple Pay modal) — highest user-visible priority.
3. Line-level discount & tax.
4. Hold / Recall.
5. Register open/close + Z-report.
6. Sales history/edit view updates.
