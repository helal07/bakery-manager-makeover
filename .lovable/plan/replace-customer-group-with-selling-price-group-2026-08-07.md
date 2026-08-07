# Replace Customer Group with Selling Price Group

Assign customers directly to a **Selling Price Group** (managed under Products) and retire the separate Customer Group menu.

## What changes for you

- Customer list → Actions → "Assign to group" now lists the Selling Price Groups you maintain in Products → Selling Price Groups.
- The Customers menu no longer has a "Customer Group" submenu; that page is removed.
- POS: when you pick a customer, their selling price group is applied automatically — each product uses the fixed price set in that group, falling back to the normal price when no group price exists.
- The Customers table "Group" column shows the price group name.

## Implementation

1. **Database (one migration, idempotent)**
   - Add `customers.selling_price_group_id UUID REFERENCES public.selling_price_groups(id) ON DELETE SET NULL`.
   - Backfill: for customers with a `group_id` whose customer group has `pricing_mode = 'price_group'`, copy that group's `selling_price_group_id`.
   - Keep `customers.group_id` and the `customer_groups` table in place (no data destroyed), just unused by the UI.

2. **Customers list (`src/routes/_authenticated/crm.index.tsx`)**
   - Load `selling_price_groups` (active) instead of `customer_groups`.
   - Read/write `selling_price_group_id` in the assign dialog and the Group column; keep "— No group —".

3. **POS (`src/routes/_authenticated/pos.tsx`)**
   - Drop the `customer_groups` fetch and percentage-discount branch of `applyGroup`.
   - Selecting a customer loads their `selling_price_group_id`; group prices come from `product_selling_prices` for that group (existing logic path), plus a manual price-group selector in the customer row.

4. **Navigation and permissions**
   - Remove the `/customer-groups` item from `src/components/app-shell.tsx` and delete `src/routes/_authenticated/customer-groups.tsx`.
   - Remove `contacts.customer_groups.manage` from `src/lib/rbac-matrix.ts` (catalog + role grants) and add a sync SQL statement that deletes that permission key and its role grants.

5. **Dashboard (`src/routes/_authenticated/dashboard.tsx`)**
   - Replace its `customer_groups` discount dropdown with the selling-price-group source, or remove the group selector there if it is only a legacy demo control (decided while editing, keeping totals correct).

6. **Verification**
   - Typecheck plus `vitest run` (the RBAC matrix tests assert catalog/route parity, so they must pass after the key removal).

## Note

Selling price groups only set fixed per-product prices — they have no percentage-discount mode. Any customer group that used a percentage discount will lose that behavior; those customers will need a price group with explicit prices instead.
