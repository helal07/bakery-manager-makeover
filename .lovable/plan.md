## লক্ষ্য

Reverse logistics + factory retail sales:

1. দোকানদার → শোরুম: expired/damaged product return
2. শোরুম → ফ্যাক্টরি: damaged stock return
3. ফ্যাক্টরি: damaged product কে **raw material-এ রূপান্তর** (grind/repurpose) করে নতুন product বানাবে
4. ফ্যাক্টরি নিজেই খুচরা কাস্টমারকে POS দিয়ে বিক্রি করতে পারবে

## পূর্বশর্ত (আগের প্ল্যান থেকে)

Factory-only production model (raw stock + production শুধু factory-তে) — এটা আগের অনুমোদিত প্ল্যানের অংশ। এই প্ল্যান সেটার উপর দাঁড়ায়।

---

## Flow ম্যাপিং

```text
Customer ──return──▶ Showroom (sale_returns, restock=damaged)
                         │
                         └─transfer──▶ Factory  (kind='damaged_return')
                                          │
                        ┌─────────────────┴─────────────────┐
                        ▼                                   ▼
              Repurpose → Raw Material          Wastage (unusable)
              (grind biscuit → fish-feed flour)
                        │
                        ▼
              Production (existing flow) → New Product
                        │
                        ▼
              Factory POS → Retail Customer
```

---

## Part 1 — Sale Return: "damaged" condition

**File:** `src/routes/_authenticated/sales.return.tsx`

- প্রতিটি return line-এ **Condition** dropdown: `resellable` / `damaged` / `expired`
- `resellable` → আগের মত showroom stock-এ ফেরত (`+qty`, `kind='return'`)
- `damaged` / `expired` → showroom-এ আলাদা **damaged bucket** এ যাবে, বিক্রয়যোগ্য stock বাড়বে না
- `sale_return_items` টেবিলে `condition` column যোগ

**DB:** `sale_return_items.condition text default 'resellable'`, plus নতুন `damaged_stock` table (`product_id`, `showroom_id`, `quantity`) এবং `damaged_ledger` (movement history)।

---

## Part 2 — Damaged Return Transfer (Showroom → Factory)

**নতুন page:** `src/routes/_authenticated/transfers.damaged.tsx` (route: `/transfers/damaged/new`)

- Source: current showroom (locked)
- Destination: **Factory** (locked)
- শুধু ওই showroom-এর `damaged_stock` থেকে item pick করা যাবে
- Submit → `transfers` row with `kind='damaged_return'`, status draft → approve
- Approve করলে: showroom damaged_stock কমবে, factory-তে নতুন **`repurpose_queue`** টেবিলে row বসবে (product_id, qty, source_showroom_id, received_at, status='pending')

Transfer list page (`transfers.index.tsx`)-এ **Kind** filter (normal / damaged) যোগ।

---

## Part 3 — Factory Repurpose Workshop

**নতুন page:** `src/routes/_authenticated/production.repurpose.tsx` (permission: `production.repurpose`)

Repurpose Queue দেখাবে। প্রতিটি row-তে দুটি action:

### A) Convert to Raw Material
- Modal: target **Raw Material** select (e.g. "Fish Feed Flour Base"), yield qty (e.g. 5 kg biscuit → 4.5 kg flour), wastage qty
- Submit RPC `commit_repurpose`:
  - `repurpose_queue` row → status='converted'
  - `raw_stock_ledger` insert: `+yield_qty`, `kind='repurpose_in'`, `ref_type='repurpose'`
  - `raw_material_stock` factory row +yield_qty
  - `wastage_log` insert (if wastage > 0)
  - `damaged_ledger` insert: `-qty` at factory

### B) Discard (fully wastage)
- সম্পূর্ণ qty `wastage_log`-এ, queue row → status='discarded'

**Report:** Repurpose History (কী product → কী raw material, yield %, dates)।

---

## Part 4 — Factory as POS Location (Retail Sales)

- **Showrooms table** এ একটি default factory-linked showroom entry থাকে (`is_factory=true`) — factory nominally একটা showroom-এর মত আচরণ করবে POS-এর জন্য
- অথবা: `showroom_id IS NULL` কে POS **"Factory Outlet"** হিসাবে treat করা
- **সিদ্ধান্ত (recommend):** `showrooms` table-এ `is_factory boolean` column যোগ করে একটি বিশেষ "Factory Outlet" showroom বানানো। Product stock/sales সব existing flow দিয়েই কাজ করবে, production সেই factory-outlet showroom-এ finished goods commit করবে (previous plan-এ যে factory = `showroom_id NULL` ছিল সেটা এই special row-এ shift হবে)
- POS/transfer/report সব জায়গায় factory-outlet একটি selectable location — user difference বুঝবে badge/icon দিয়ে
- Factory Manager role-এ `sales.create` permission optional — চাইলে factory retail বন্ধ রাখা যাবে

> Note: এই decision আগের "factory = NULL" model কে বদলাবে। আপনি অনুমতি দিলে সেই বদলটা এই প্ল্যানের migration-এ একসাথে আসবে।

---

## Part 5 — Permissions (RBAC)

নতুন permission keys `permissions` table-এ:

- `sales.return.damaged` — damaged condition select করতে
- `transfers.damaged.create` — damaged return transfer
- `production.repurpose` — repurpose workshop
- `production.repurpose.report`

Factory Manager role → `production.repurpose*` পাবে।  
Showroom Manager role → `sales.return.damaged`, `transfers.damaged.create` পাবে।

---

## Part 6 — SQL Migration (`sql/06_reverse_logistics.sql`, idempotent, self-hosted import)

1. `ALTER TABLE sale_return_items ADD COLUMN IF NOT EXISTS condition text DEFAULT 'resellable'`
2. `CREATE TABLE damaged_stock(product_id, showroom_id, quantity)` + GRANT + RLS
3. `CREATE TABLE damaged_ledger(...)` + GRANT + RLS
4. `CREATE TABLE repurpose_queue(id, product_id, qty, source_showroom_id, received_at, status, converted_material_id, yield_qty, wastage_qty)` + GRANT + RLS
5. `ALTER TABLE transfers ADD COLUMN IF NOT EXISTS kind text DEFAULT 'normal'` (values: normal/damaged_return)
6. `ALTER TABLE showrooms ADD COLUMN IF NOT EXISTS is_factory boolean DEFAULT false`
7. Seed: existing "Factory" showroom flag করা, বা নতুন insert
8. RPC `commit_damaged_movement(product, showroom, qty, kind, ref)` — mirror of `commit_stock_movement`
9. RPC `commit_repurpose(queue_id, material_id, yield_qty, wastage_qty)` — atomic
10. RPC `commit_damaged_transfer_approve(transfer_id)` — showroom damaged_stock ➖, factory repurpose_queue rows insert
11. New permission rows insert

---

## Part 7 — UI touchpoints summary

| Screen | Change |
|---|---|
| `sales.return.tsx` | Condition column, damaged bucket route |
| `transfers.index.tsx` | Kind filter, "New Damaged Return" button |
| `transfers.damaged.tsx` (new) | Damaged-only picker, factory locked dest |
| `production.index.tsx` | "Repurpose Queue" card with pending count |
| `production.repurpose.tsx` (new) | Queue list + Convert/Discard modals |
| `production.wastage.tsx` | Include repurpose-origin wastage in report |
| `reports.stock.tsx` | New "Damaged" tab per showroom |
| `pos.tsx` | Factory Outlet selectable when `is_factory=true` (no code change if we go with special showroom row) |
| Sidebar | Production → Repurpose menu behind permission |

---

## Technical notes

- Damaged stock এবং saleable stock **আলাদা table** — একই `product_stock`-এ mix করলে POS ভুল বিক্রি করবে
- `repurpose_queue` = পরিষ্কার audit trail: কোন damaged batch কী raw material হয়েছে, yield কত
- সব RPC `SECURITY DEFINER` + `SET search_path = public`, existing pattern-এর সাথে সামঞ্জস্যপূর্ণ
- Migration আপনি self-hosted Supabase SQL Editor-এ manually চালাবেন, applied.md-তে entry হবে
- Factory-outlet decision (Part 4) সবচেয়ে বড় architecture choice — approve করার আগে জানান "special showroom row" approach ঠিক আছে, নাকি "NULL = factory" রাখতে চান (তখন POS-এ NULL-select কাজ করবে না, আলাদা code path লাগবে)

---

## Verification checklist

1. দোকানদার return → showroom `damaged_stock` বাড়ে, `product_stock` অপরিবর্তিত
2. Damaged transfer approve → showroom damaged কমে, factory `repurpose_queue`-এ pending
3. Repurpose convert → raw material stock বাড়ে, queue converted, wastage log entry
4. নতুন production batch সেই raw material দিয়ে চালানো যায়
5. Factory Outlet POS → খুচরা sale record হয়, factory product_stock কমে
6. Showroom user "Repurpose" menu দেখে না; Factory Manager দেখে
