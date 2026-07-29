## 1. Finished-Product Wastage + Damaged-goods বিক্রয়

বর্তমান state: `wastage_log` শুধু raw material handle করে। ফিনিশড প্রোডাক্ট নষ্ট হলে record নাই। কিন্তু `damaged_stock`, `damaged_ledger`, `repurpose_queue`, `commit_damaged_movement` — সব RPC + tables আগেই আছে (reverse-logistics migration থেকে)।

**নতুন workflow (production-side damage):**

```text
Finished product damaged
        │
        ├─▶ Deduct from product_stock (kind=wastage_out)
        └─▶ Add to damaged_stock (kind=damaged_in)
                │
                ├─▶ Discard fully (repurpose → discarded)
                ├─▶ Repurpose to raw material (existing)
                └─▶ Sell as-is (নতুন — খাবার/feed হিসেবে বিক্রি)
```

**Plan:**

### a. Log finished-product wastage
- `src/lib/wastage-store.ts` — নতুন `logFinishedProductWastage({ productId, showroomId, qty, reason, notes })`:
  - `commit_stock_movement` দিয়ে product_stock থেকে −qty (kind = `wastage_out`)
  - `commit_damaged_movement` দিয়ে damaged_stock-এ +qty (kind = `damaged_in`, ref = wastage)
  - `wastage_log`-এ `product_id` সহ row insert (schema-এ কলাম আগেই আছে)
  - পাশাপাশি `repurpose_queue`-এ status = `pending` একটা row create — যাতে এটা repurpose UI-তেও দেখা যায়

### b. Wastage page UI (`production.wastage.tsx`)
- "Log wastage" কার্ডে টগল: **Raw material** vs **Finished product**
- Finished product হলে product search + showroom scope
- Recent wastage list-এ দুটোই দেখাবে, origin badge সহ

### c. Damaged-goods বিক্রয় (নতুন — টাকা recover করার জন্য)
নতুন RPC `commit_damaged_sale` (migration লাগবে):
- Input: `_product_id`, `_showroom_id`, `_qty`, `_unit_price`, `_customer_name?`, `_note?`
- Damaged_stock থেকে −qty deduct (kind = `sale_out`)
- একটা lightweight `sales` row বানাবে flag সহ (`payment_mode = 'damaged_sale'`, সরাসরি cash paid, no product_stock touch) — বা `damaged_ledger`-এই amount সহ log করা যায় income tracking-এর জন্য

সহজ approach — regular `sales` table use না করে, damaged_ledger-এ `note` + একটা নতুন কলাম `sale_amount numeric` দিয়ে income track করা। তাহলে reports-এ "Damaged sales revenue" আলাদা দেখানো যাবে।

**Migration:** `sql/20_damaged_sale.sql`
- `ALTER TABLE damaged_ledger ADD COLUMN IF NOT EXISTS sale_amount numeric`
- `ALTER TABLE damaged_ledger ADD COLUMN IF NOT EXISTS customer_name text`
- নতুন RPC `commit_damaged_sale(_product_id, _showroom_id, _qty, _unit_price, _customer_name, _note)`
- Permission: `production.damaged.sell`

**UI:** Wastage page-এ (বা Repurpose page-এ) damaged_stock rows-এর পাশে "Sell" button — dialog-এ qty, unit price, customer name → RPC call → income recorded।

Repurpose page-এ প্রতিটা queued row-এ এখন **তিনটা** action: Repurpose to material / Discard / **Sell as damaged goods**।

### d. Report
`reports.index.tsx`-এ ছোট widget: এই মাসের "Damaged goods sold" = SUM(damaged_ledger.sale_amount) → recovered income।

---

## 2. Bangla text সাপোর্ট (category)

`src/routes/_authenticated/products.categories.tsx:46` — zod regex `^[A-Za-z0-9][A-Za-z0-9 &'\-]*$` "বেকারি" reject করছে। Fix: `^[\p{L}\p{N}][\p{L}\p{N} &'\-]*$/u` + error message নিরপেক্ষ করা হবে।

---

## 3. Production মেনু হাইলাইট

`src/components/app-shell.tsx:113` — সাইডবারে "Production" group label-এর জন্য special class: primary color + uppercase tracking + subtle left accent bar। শুধু Production label-এ apply হবে (`item.label === "Production"` check), বাকি groups অপরিবর্তিত।

---

## Files to touch
- **Migration:** `sql/20_damaged_sale.sql` (new — columns + RPC + permission)
- `src/lib/wastage-store.ts` — finished-product logging + damaged-sale helper
- `src/routes/_authenticated/production.wastage.tsx` — mode toggle + list updates
- `src/routes/_authenticated/production.repurpose.tsx` — add "Sell" action next to Repurpose/Discard
- `src/routes/_authenticated/products.categories.tsx` — Unicode regex
- `src/components/app-shell.tsx` — Production group highlight
- `src/routes/_authenticated/reports.index.tsx` — damaged-sale revenue widget (optional, small)
