# Factory Stock + Showroom Inbox (Incoming Goods)

## Goal
Factory-only production রাখা, showroom-এ transfer receive workflow যোগ করা, এবং Purchase ও Transfer আলাদা রেখে একটা unified "Incoming Goods" view দেওয়া।

## Scope

### 1. Production menu — Factory Stock views
- `Production` sidebar-এ ২টা নতুন submenu:
  - **Factory Raw Stock** — `raw_material_stock` (showroom = factory) list with value (qty × cost)
  - **Factory Product Stock** — `product_stock` (showroom = factory) list with value (qty × price)
- Total valuation KPI উপরে।
- Factory = `showrooms.code = 'FACTORY'` (বা `is_factory` flag; existing convention follow করবো)।

### 2. Showroom Inbox (Incoming Transfers)
- নতুন route: `src/routes/_authenticated/inbox.tsx`
- Current user-এর active showroom-এ pending transfers (`transfers.status = 'sent'`, `to_showroom_id = current`) list করবে।
- প্রতিটা transfer-এ: from factory, date, items (product, qty), "Receive" button।
- Receive হলে:
  - প্রতিটা `transfer_items`-এর জন্য `commit_stock_movement(product_id, to_showroom, +qty, 'transfer_in', 'transfer', transfer_id)`
  - `transfers.status = 'received'`, `received_at = now()`, `received_by = user`
  - Missing product row auto-insert হয় (existing RPC behavior) — showroom-এ product আগে না থাকলেও কাজ করবে।

### 3. Notifications
- Sidebar-এ `Inbox` menu item-এর পাশে pending count badge।
- Topbar-এ ছোট bell/badge (pending transfer count)।
- Count query: `transfers` where `to_showroom_id = current AND status = 'sent'`.

### 4. Purchase vs Transfer separation
- Purchase List-এ transfer **mix করবো না** (double liability এড়াতে)।
- Purchase List page-এর উপরে একটা hint banner: "X pending incoming transfers — Open Inbox" → `/inbox`.
- Optional: Dashboard-এ "Incoming Goods" widget with 2 tabs (Purchases / Transfers) — এই plan-এ শুধু banner + Inbox, widget পরে।

### 5. Missing product edge case
- Existing `commit_stock_movement` RPC `product_stock`-এ row না থাকলে auto-insert করে — কোনো schema change লাগবে না।
- Showroom-এ product first time এলে সেটা automatic ওই showroom-এর catalog-এ visible হবে (product master global, stock per-showroom)।

## Files

**New**
- `src/routes/_authenticated/inbox.tsx` — pending transfers list + receive action
- `src/routes/_authenticated/production.factory-stock.tsx` — raw + product stock tabs
- `sql/14_inbox_helpers.sql` — (only if we need a `get_pending_transfers_count` RPC; otherwise skip)

**Modified**
- `src/components/app-shell.tsx` — add Inbox menu + badge, add Factory Stock under Production
- `src/routes/_authenticated/production.index.tsx` — sidebar entry for Factory Stock
- `src/routes/_authenticated/purchasing.list.tsx` — hint banner linking to Inbox

## Migrations
- সম্ভবত schema change লাগবে না (transfers/status/received_at fields already আছে ধরে নিচ্ছি — verify করে confirm করবো implementation-এ)।
- লাগলে `sql/14_transfer_receive.sql` numbered file দেব manual import-এর জন্য।

## Out of scope (এই plan-এ না)
- Full "Incoming Goods" dashboard widget
- Partial receive / discrepancy reporting
- Auto-create purchase entry from transfer (accounting-এর জন্য পরে আলাদা plan)
