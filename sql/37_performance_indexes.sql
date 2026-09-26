-- Patch 37 — Performance indexes for a growing database (idempotent, safe to re-run).
-- Run once in the VPS SQL editor. Adds no data, changes no rows.
-- 1) Access-check lookups run for EVERY row the app reads (RLS), so these matter most.
CREATE INDEX IF NOT EXISTS idx_ura_user ON public.user_role_assignments (user_id, showroom_id);
CREATE INDEX IF NOT EXISTS idx_ura_role ON public.user_role_assignments (role_id);
CREATE INDEX IF NOT EXISTS idx_ura_showroom ON public.user_role_assignments (showroom_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON public.role_permissions (role_id, permission_key);

-- 2) Date-range reports per location (sales, purchases, expenses, ledgers).
CREATE INDEX IF NOT EXISTS idx_sales_showroom_created ON public.sales (showroom_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_created ON public.sales (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_showroom_date ON public.purchases (showroom_id, purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_showroom_date ON public.expenses (showroom_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_customer_payments_paid_on ON public.customer_payments (showroom_id, paid_on DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_paid_on ON public.supplier_payments (showroom_id, paid_on DESC);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_product ON public.stock_ledger (product_id, showroom_id);
CREATE INDEX IF NOT EXISTS idx_raw_stock_ledger_material ON public.raw_stock_ledger (material_id, showroom_id);
CREATE INDEX IF NOT EXISTS idx_damaged_ledger_product ON public.damaged_ledger (product_id);
CREATE INDEX IF NOT EXISTS idx_wastage_log_created ON public.wastage_log (showroom_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfers_created ON public.transfers (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sale_returns_showroom_created ON public.sale_returns (showroom_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_showroom_created ON public.purchase_returns (showroom_id, created_at DESC);

-- 3) Child rows looked up by parent (invoice, purchase view, ledgers, transfers).
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON public.sale_items (sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON public.sale_items (product_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON public.sale_payments (sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON public.sales (customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_register ON public.sales (register_id);
CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON public.customer_payments (customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_payments_sale ON public.customer_payments (sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_returns_sale ON public.sale_returns (sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_return_items_return ON public.sale_return_items (return_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON public.purchase_items (purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_material ON public.purchase_items (material_id);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON public.purchases (supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_supplier ON public.purchase_returns (supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_purchase ON public.purchase_returns (purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_return ON public.purchase_return_items (return_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON public.supplier_payments (supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_purchase ON public.supplier_payments (purchase_id);
CREATE INDEX IF NOT EXISTS idx_transfer_items_transfer ON public.transfer_items (transfer_id);
CREATE INDEX IF NOT EXISTS idx_recipes_product ON public.recipes (product_id);
CREATE INDEX IF NOT EXISTS idx_recipes_material ON public.recipes (material_id);
CREATE INDEX IF NOT EXISTS idx_sub_recipe_items_sub ON public.sub_recipe_items (sub_recipe_id);
CREATE INDEX IF NOT EXISTS idx_product_selling_prices_product ON public.product_selling_prices (product_id);
CREATE INDEX IF NOT EXISTS idx_recipe_overheads_product ON public.recipe_overheads (product_id);
CREATE INDEX IF NOT EXISTS idx_orders_showroom_created ON public.orders (showroom_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_held_sales_showroom ON public.held_sales (showroom_id);
CREATE INDEX IF NOT EXISTS idx_cash_registers_showroom ON public.cash_registers (showroom_id, status);
CREATE INDEX IF NOT EXISTS idx_work_orders_showroom ON public.work_orders (showroom_id, planned_date);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products (category_id);

-- 4) Refresh planner statistics.
ANALYZE;
