-- Patch 18 — RLS performance optimization
-- Replaces per-row auth.uid() calls with (select auth.uid()) so Postgres
-- evaluates the function once per query (InitPlan) instead of once per row.
-- Semantics are identical; only speed changes. Safe to re-run.

BEGIN;

-- app_roles
DROP POLICY IF EXISTS app_roles_admin_write ON public.app_roles;
CREATE POLICY app_roles_admin_write ON public.app_roles FOR ALL TO authenticated
  USING (public.user_is_global_admin((select auth.uid())))
  WITH CHECK (public.user_is_global_admin((select auth.uid())));

-- cash_registers
DROP POLICY IF EXISTS cash_registers_scope ON public.cash_registers;
CREATE POLICY cash_registers_scope ON public.cash_registers FOR ALL TO authenticated
  USING (public.user_has_showroom_access((select auth.uid()), showroom_id))
  WITH CHECK (public.user_has_showroom_access((select auth.uid()), showroom_id));

-- company_settings
DROP POLICY IF EXISTS company_settings_admin_write ON public.company_settings;
CREATE POLICY company_settings_admin_write ON public.company_settings FOR ALL TO authenticated
  USING (public.user_is_global_admin((select auth.uid())))
  WITH CHECK (public.user_is_global_admin((select auth.uid())));

-- customer_groups
DROP POLICY IF EXISTS customer_groups_write ON public.customer_groups;
CREATE POLICY customer_groups_write ON public.customer_groups FOR ALL TO authenticated
  USING (public.user_is_global_admin((select auth.uid())))
  WITH CHECK (public.user_is_global_admin((select auth.uid())));

-- customer_payments
DROP POLICY IF EXISTS customer_payments_scope ON public.customer_payments;
CREATE POLICY customer_payments_scope ON public.customer_payments FOR ALL TO authenticated
  USING (showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), showroom_id))
  WITH CHECK (showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), showroom_id));

-- customers
DROP POLICY IF EXISTS customers_write ON public.customers;
CREATE POLICY customers_write ON public.customers FOR ALL TO authenticated
  USING (public.user_is_global_admin((select auth.uid())))
  WITH CHECK (public.user_is_global_admin((select auth.uid())));

-- damaged_ledger
DROP POLICY IF EXISTS damaged_ledger_scope ON public.damaged_ledger;
CREATE POLICY damaged_ledger_scope ON public.damaged_ledger FOR ALL TO authenticated
  USING (showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), showroom_id))
  WITH CHECK (showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), showroom_id));

-- damaged_stock
DROP POLICY IF EXISTS damaged_stock_scope ON public.damaged_stock;
CREATE POLICY damaged_stock_scope ON public.damaged_stock FOR ALL TO authenticated
  USING (showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), showroom_id))
  WITH CHECK (showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), showroom_id));

-- employees
DROP POLICY IF EXISTS employees_admin_write ON public.employees;
CREATE POLICY employees_admin_write ON public.employees FOR ALL TO authenticated
  USING (public.user_is_global_admin((select auth.uid())))
  WITH CHECK (public.user_is_global_admin((select auth.uid())));

DROP POLICY IF EXISTS employees_select ON public.employees;
CREATE POLICY employees_select ON public.employees FOR SELECT TO authenticated
  USING (
    public.user_is_global_admin((select auth.uid()))
    OR user_id = (select auth.uid())
    OR (showroom_id IS NOT NULL AND public.user_has_showroom_access((select auth.uid()), showroom_id))
  );

-- expense_categories
DROP POLICY IF EXISTS expense_categories_write ON public.expense_categories;
CREATE POLICY expense_categories_write ON public.expense_categories FOR ALL TO authenticated
  USING (public.user_is_global_admin((select auth.uid())))
  WITH CHECK (public.user_is_global_admin((select auth.uid())));

-- expenses
DROP POLICY IF EXISTS expenses_scope ON public.expenses;
CREATE POLICY expenses_scope ON public.expenses FOR ALL TO authenticated
  USING (showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), showroom_id))
  WITH CHECK (showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), showroom_id));

-- held_sales
DROP POLICY IF EXISTS held_sales_scope ON public.held_sales;
CREATE POLICY held_sales_scope ON public.held_sales FOR ALL TO authenticated
  USING (public.user_has_showroom_access((select auth.uid()), showroom_id))
  WITH CHECK (public.user_has_showroom_access((select auth.uid()), showroom_id));

-- landing_carousels
DROP POLICY IF EXISTS landing_carousels_admin ON public.landing_carousels;
CREATE POLICY landing_carousels_admin ON public.landing_carousels FOR ALL TO authenticated
  USING (public.user_is_global_admin((select auth.uid())))
  WITH CHECK (public.user_is_global_admin((select auth.uid())));

-- landing_content
DROP POLICY IF EXISTS landing_content_all_authenticated ON public.landing_content;
CREATE POLICY landing_content_all_authenticated ON public.landing_content FOR ALL TO authenticated
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- orders
DROP POLICY IF EXISTS orders_scope ON public.orders;
CREATE POLICY orders_scope ON public.orders FOR ALL TO authenticated
  USING (public.user_has_showroom_access((select auth.uid()), showroom_id))
  WITH CHECK (public.user_has_showroom_access((select auth.uid()), showroom_id));

-- permissions
DROP POLICY IF EXISTS permissions_admin_write ON public.permissions;
CREATE POLICY permissions_admin_write ON public.permissions FOR ALL TO authenticated
  USING (public.user_is_global_admin((select auth.uid())))
  WITH CHECK (public.user_is_global_admin((select auth.uid())));

-- product_categories
DROP POLICY IF EXISTS product_categories_write ON public.product_categories;
CREATE POLICY product_categories_write ON public.product_categories FOR ALL TO authenticated
  USING (public.user_is_global_admin((select auth.uid())))
  WITH CHECK (public.user_is_global_admin((select auth.uid())));

-- product_selling_prices
DROP POLICY IF EXISTS product_selling_prices_write ON public.product_selling_prices;
CREATE POLICY product_selling_prices_write ON public.product_selling_prices FOR ALL TO authenticated
  USING (public.user_is_global_admin((select auth.uid())))
  WITH CHECK (public.user_is_global_admin((select auth.uid())));

-- product_stock
DROP POLICY IF EXISTS product_stock_scope ON public.product_stock;
CREATE POLICY product_stock_scope ON public.product_stock FOR ALL TO authenticated
  USING (showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), showroom_id))
  WITH CHECK (showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), showroom_id));

-- production_overhead_categories
DROP POLICY IF EXISTS poc_write ON public.production_overhead_categories;
CREATE POLICY poc_write ON public.production_overhead_categories FOR ALL TO authenticated
  USING (public.user_is_global_admin((select auth.uid())))
  WITH CHECK (public.user_is_global_admin((select auth.uid())));

-- production_overheads
DROP POLICY IF EXISTS po_write ON public.production_overheads;
CREATE POLICY po_write ON public.production_overheads FOR ALL TO authenticated
  USING (public.user_is_global_admin((select auth.uid())))
  WITH CHECK (public.user_is_global_admin((select auth.uid())));

-- products
DROP POLICY IF EXISTS products_write ON public.products;
CREATE POLICY products_write ON public.products FOR ALL TO authenticated
  USING (public.user_is_global_admin((select auth.uid())))
  WITH CHECK (public.user_is_global_admin((select auth.uid())));

-- purchase_categories
DROP POLICY IF EXISTS purchase_categories_write ON public.purchase_categories;
CREATE POLICY purchase_categories_write ON public.purchase_categories FOR ALL TO authenticated
  USING (public.user_is_global_admin((select auth.uid())))
  WITH CHECK (public.user_is_global_admin((select auth.uid())));

-- purchase_items
DROP POLICY IF EXISTS purchase_items_scope ON public.purchase_items;
CREATE POLICY purchase_items_scope ON public.purchase_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchases p
    WHERE p.id = purchase_items.purchase_id
      AND (p.showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), p.showroom_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchases p
    WHERE p.id = purchase_items.purchase_id
      AND (p.showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), p.showroom_id))));

-- purchase_return_items
DROP POLICY IF EXISTS purchase_return_items_scope ON public.purchase_return_items;
CREATE POLICY purchase_return_items_scope ON public.purchase_return_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_returns r
    WHERE r.id = purchase_return_items.return_id
      AND (r.showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), r.showroom_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_returns r
    WHERE r.id = purchase_return_items.return_id
      AND (r.showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), r.showroom_id))));

-- purchase_returns
DROP POLICY IF EXISTS purchase_returns_scope ON public.purchase_returns;
CREATE POLICY purchase_returns_scope ON public.purchase_returns FOR ALL TO authenticated
  USING (showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), showroom_id))
  WITH CHECK (showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), showroom_id));

-- purchases
DROP POLICY IF EXISTS purchases_scope ON public.purchases;
CREATE POLICY purchases_scope ON public.purchases FOR ALL TO authenticated
  USING (showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), showroom_id))
  WITH CHECK (showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), showroom_id));

-- qc_checks
DROP POLICY IF EXISTS qc_checks_scope ON public.qc_checks;
CREATE POLICY qc_checks_scope ON public.qc_checks FOR ALL TO authenticated
  USING (showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), showroom_id))
  WITH CHECK (showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), showroom_id));

-- raw_material_stock
DROP POLICY IF EXISTS raw_material_stock_scope ON public.raw_material_stock;
CREATE POLICY raw_material_stock_scope ON public.raw_material_stock FOR ALL TO authenticated
  USING (showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), showroom_id))
  WITH CHECK (showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), showroom_id));

-- raw_materials
DROP POLICY IF EXISTS raw_materials_write ON public.raw_materials;
CREATE POLICY raw_materials_write ON public.raw_materials FOR ALL TO authenticated
  USING (public.user_is_global_admin((select auth.uid())))
  WITH CHECK (public.user_is_global_admin((select auth.uid())));

-- raw_stock_ledger
DROP POLICY IF EXISTS raw_stock_ledger_scope ON public.raw_stock_ledger;
CREATE POLICY raw_stock_ledger_scope ON public.raw_stock_ledger FOR ALL TO authenticated
  USING (showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), showroom_id))
  WITH CHECK (showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), showroom_id));

-- recipe_categories
DROP POLICY IF EXISTS recipe_categories_write ON public.recipe_categories;
CREATE POLICY recipe_categories_write ON public.recipe_categories FOR ALL TO authenticated
  USING (public.user_is_global_admin((select auth.uid())))
  WITH CHECK (public.user_is_global_admin((select auth.uid())));

-- recipe_overheads
DROP POLICY IF EXISTS ro_write ON public.recipe_overheads;
CREATE POLICY ro_write ON public.recipe_overheads FOR ALL TO authenticated
  USING (public.user_is_global_admin((select auth.uid())))
  WITH CHECK (public.user_is_global_admin((select auth.uid())));

-- recipes
DROP POLICY IF EXISTS recipes_write ON public.recipes;
CREATE POLICY recipes_write ON public.recipes FOR ALL TO authenticated
  USING (public.user_is_global_admin((select auth.uid())))
  WITH CHECK (public.user_is_global_admin((select auth.uid())));

-- repurpose_queue
DROP POLICY IF EXISTS repurpose_queue_scope ON public.repurpose_queue;
CREATE POLICY repurpose_queue_scope ON public.repurpose_queue FOR ALL TO authenticated
  USING (source_showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), source_showroom_id))
  WITH CHECK (source_showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), source_showroom_id));

-- role_permissions
DROP POLICY IF EXISTS role_permissions_admin_write ON public.role_permissions;
CREATE POLICY role_permissions_admin_write ON public.role_permissions FOR ALL TO authenticated
  USING (public.user_is_global_admin((select auth.uid())))
  WITH CHECK (public.user_is_global_admin((select auth.uid())));

-- sale_items
DROP POLICY IF EXISTS sale_items_scope ON public.sale_items;
CREATE POLICY sale_items_scope ON public.sale_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales s
    WHERE s.id = sale_items.sale_id AND public.user_has_showroom_access((select auth.uid()), s.showroom_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales s
    WHERE s.id = sale_items.sale_id AND public.user_has_showroom_access((select auth.uid()), s.showroom_id)));

-- sale_payments
DROP POLICY IF EXISTS sale_payments_scope ON public.sale_payments;
CREATE POLICY sale_payments_scope ON public.sale_payments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales s
    WHERE s.id = sale_payments.sale_id AND public.user_has_showroom_access((select auth.uid()), s.showroom_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales s
    WHERE s.id = sale_payments.sale_id AND public.user_has_showroom_access((select auth.uid()), s.showroom_id)));

-- sale_return_items
DROP POLICY IF EXISTS sale_return_items_scope ON public.sale_return_items;
CREATE POLICY sale_return_items_scope ON public.sale_return_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sale_returns r
    WHERE r.id = sale_return_items.return_id AND public.user_has_showroom_access((select auth.uid()), r.showroom_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sale_returns r
    WHERE r.id = sale_return_items.return_id AND public.user_has_showroom_access((select auth.uid()), r.showroom_id)));

-- sale_returns
DROP POLICY IF EXISTS sale_returns_scope ON public.sale_returns;
CREATE POLICY sale_returns_scope ON public.sale_returns FOR ALL TO authenticated
  USING (public.user_has_showroom_access((select auth.uid()), showroom_id))
  WITH CHECK (public.user_has_showroom_access((select auth.uid()), showroom_id));

-- sales
DROP POLICY IF EXISTS sales_scope ON public.sales;
CREATE POLICY sales_scope ON public.sales FOR ALL TO authenticated
  USING (public.user_has_showroom_access((select auth.uid()), showroom_id))
  WITH CHECK (public.user_has_showroom_access((select auth.uid()), showroom_id));

-- selling_price_groups
DROP POLICY IF EXISTS selling_price_groups_write ON public.selling_price_groups;
CREATE POLICY selling_price_groups_write ON public.selling_price_groups FOR ALL TO authenticated
  USING (public.user_is_global_admin((select auth.uid())))
  WITH CHECK (public.user_is_global_admin((select auth.uid())));

-- showrooms
DROP POLICY IF EXISTS showrooms_select ON public.showrooms;
CREATE POLICY showrooms_select ON public.showrooms FOR SELECT TO authenticated
  USING (public.user_has_showroom_access((select auth.uid()), id));

DROP POLICY IF EXISTS showrooms_write ON public.showrooms;
CREATE POLICY showrooms_write ON public.showrooms FOR ALL TO authenticated
  USING (public.user_is_global_admin((select auth.uid())))
  WITH CHECK (public.user_is_global_admin((select auth.uid())));

-- stock_ledger
DROP POLICY IF EXISTS stock_ledger_scope ON public.stock_ledger;
CREATE POLICY stock_ledger_scope ON public.stock_ledger FOR ALL TO authenticated
  USING (showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), showroom_id))
  WITH CHECK (showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), showroom_id));

-- supplier_payments
DROP POLICY IF EXISTS supplier_payments_admin ON public.supplier_payments;
CREATE POLICY supplier_payments_admin ON public.supplier_payments FOR ALL TO authenticated
  USING (public.user_is_global_admin((select auth.uid())))
  WITH CHECK (public.user_is_global_admin((select auth.uid())));

-- suppliers
DROP POLICY IF EXISTS suppliers_write ON public.suppliers;
CREATE POLICY suppliers_write ON public.suppliers FOR ALL TO authenticated
  USING (public.user_is_global_admin((select auth.uid())))
  WITH CHECK (public.user_is_global_admin((select auth.uid())));

-- transfer_items
DROP POLICY IF EXISTS transfer_items_scope ON public.transfer_items;
CREATE POLICY transfer_items_scope ON public.transfer_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.transfers t
    WHERE t.id = transfer_items.transfer_id
      AND (public.user_has_showroom_access((select auth.uid()), t.source_showroom_id)
        OR public.user_has_showroom_access((select auth.uid()), t.dest_showroom_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.transfers t
    WHERE t.id = transfer_items.transfer_id
      AND (public.user_has_showroom_access((select auth.uid()), t.source_showroom_id)
        OR public.user_has_showroom_access((select auth.uid()), t.dest_showroom_id))));

-- transfers
DROP POLICY IF EXISTS transfers_scope ON public.transfers;
CREATE POLICY transfers_scope ON public.transfers FOR ALL TO authenticated
  USING (public.user_has_showroom_access((select auth.uid()), source_showroom_id)
      OR public.user_has_showroom_access((select auth.uid()), dest_showroom_id))
  WITH CHECK (public.user_has_showroom_access((select auth.uid()), source_showroom_id)
      OR public.user_has_showroom_access((select auth.uid()), dest_showroom_id));

-- units
DROP POLICY IF EXISTS units_write ON public.units;
CREATE POLICY units_write ON public.units FOR ALL TO authenticated
  USING (public.user_is_global_admin((select auth.uid())))
  WITH CHECK (public.user_is_global_admin((select auth.uid())));

-- user_profiles
DROP POLICY IF EXISTS user_profiles_write ON public.user_profiles;
CREATE POLICY user_profiles_write ON public.user_profiles FOR ALL TO authenticated
  USING (user_id = (select auth.uid()) OR public.user_is_global_admin((select auth.uid())))
  WITH CHECK (user_id = (select auth.uid()) OR public.user_is_global_admin((select auth.uid())));

-- user_role_assignments
DROP POLICY IF EXISTS ura_admin_write ON public.user_role_assignments;
CREATE POLICY ura_admin_write ON public.user_role_assignments FOR ALL TO authenticated
  USING (public.user_is_global_admin((select auth.uid())))
  WITH CHECK (public.user_is_global_admin((select auth.uid())));

DROP POLICY IF EXISTS ura_select_own_or_admin ON public.user_role_assignments;
CREATE POLICY ura_select_own_or_admin ON public.user_role_assignments FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()) OR public.user_is_global_admin((select auth.uid())));

-- user_roles
DROP POLICY IF EXISTS user_roles_admin_write ON public.user_roles;
CREATE POLICY user_roles_admin_write ON public.user_roles FOR ALL TO authenticated
  USING (public.user_is_global_admin((select auth.uid())))
  WITH CHECK (public.user_is_global_admin((select auth.uid())));

DROP POLICY IF EXISTS user_roles_select_own_or_admin ON public.user_roles;
CREATE POLICY user_roles_select_own_or_admin ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()) OR public.user_is_global_admin((select auth.uid())));

-- wastage_log
DROP POLICY IF EXISTS wastage_log_scope ON public.wastage_log;
CREATE POLICY wastage_log_scope ON public.wastage_log FOR ALL TO authenticated
  USING (showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), showroom_id))
  WITH CHECK (showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), showroom_id));

-- work_orders
DROP POLICY IF EXISTS work_orders_scope ON public.work_orders;
CREATE POLICY work_orders_scope ON public.work_orders FOR ALL TO authenticated
  USING (showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), showroom_id))
  WITH CHECK (showroom_id IS NULL OR public.user_has_showroom_access((select auth.uid()), showroom_id));

COMMIT;
