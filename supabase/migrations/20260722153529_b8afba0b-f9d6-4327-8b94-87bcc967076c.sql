-- 1) Purge built-in roles except Superadmin
DELETE FROM public.role_permissions
 WHERE role_id IN (SELECT id FROM public.app_roles WHERE lower(name) <> 'superadmin' AND is_system = true);
DELETE FROM public.user_role_assignments
 WHERE role_id IN (SELECT id FROM public.app_roles WHERE lower(name) <> 'superadmin' AND is_system = true);
DELETE FROM public.app_roles WHERE lower(name) <> 'superadmin' AND is_system = true;

-- 2) Helpers
CREATE OR REPLACE FUNCTION public.is_bootstrap_superadmin(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = _user AND lower(ur.role::text) IN ('superadmin','owner'))
      OR EXISTS (SELECT 1 FROM public.user_role_assignments a
        JOIN public.app_roles r ON r.id = a.role_id
       WHERE a.user_id = _user AND lower(r.name) = 'superadmin');
$$;

CREATE OR REPLACE FUNCTION public.user_is_global_admin(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user IS NOT NULL AND (
    public.is_bootstrap_superadmin(_user)
    OR EXISTS (SELECT 1 FROM public.user_role_assignments a
         WHERE a.user_id = _user AND a.showroom_id IS NULL));
$$;

CREATE OR REPLACE FUNCTION public.user_has_showroom_access(_user uuid, _showroom uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user IS NOT NULL AND (
    public.user_is_global_admin(_user)
    OR ( _showroom IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_role_assignments a
       WHERE a.user_id = _user AND a.showroom_id = _showroom)));
$$;

GRANT EXECUTE ON FUNCTION public.is_bootstrap_superadmin(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.user_is_global_admin(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.user_has_showroom_access(uuid, uuid) TO authenticated, anon;

-- 3) Scoped policies
DROP POLICY IF EXISTS showrooms_all_authenticated ON public.showrooms;
CREATE POLICY showrooms_select ON public.showrooms FOR SELECT TO authenticated
  USING (public.user_has_showroom_access(auth.uid(), id));
CREATE POLICY showrooms_write ON public.showrooms FOR ALL TO authenticated
  USING (public.user_is_global_admin(auth.uid()))
  WITH CHECK (public.user_is_global_admin(auth.uid()));

DROP POLICY IF EXISTS sales_all_authenticated ON public.sales;
CREATE POLICY sales_scope ON public.sales FOR ALL TO authenticated
  USING (public.user_has_showroom_access(auth.uid(), showroom_id))
  WITH CHECK (public.user_has_showroom_access(auth.uid(), showroom_id));

DROP POLICY IF EXISTS sale_items_all_authenticated ON public.sale_items;
CREATE POLICY sale_items_scope ON public.sale_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id
                  AND public.user_has_showroom_access(auth.uid(), s.showroom_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id
                  AND public.user_has_showroom_access(auth.uid(), s.showroom_id)));

DROP POLICY IF EXISTS sale_payments_all_authenticated ON public.sale_payments;
CREATE POLICY sale_payments_scope ON public.sale_payments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id
                  AND public.user_has_showroom_access(auth.uid(), s.showroom_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id
                  AND public.user_has_showroom_access(auth.uid(), s.showroom_id)));

DROP POLICY IF EXISTS sale_returns_all_authenticated ON public.sale_returns;
CREATE POLICY sale_returns_scope ON public.sale_returns FOR ALL TO authenticated
  USING (public.user_has_showroom_access(auth.uid(), showroom_id))
  WITH CHECK (public.user_has_showroom_access(auth.uid(), showroom_id));

DROP POLICY IF EXISTS sale_return_items_all_authenticated ON public.sale_return_items;
CREATE POLICY sale_return_items_scope ON public.sale_return_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sale_returns r WHERE r.id = return_id
                  AND public.user_has_showroom_access(auth.uid(), r.showroom_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.sale_returns r WHERE r.id = return_id
                  AND public.user_has_showroom_access(auth.uid(), r.showroom_id)));

DROP POLICY IF EXISTS purchases_all_authenticated ON public.purchases;
CREATE POLICY purchases_scope ON public.purchases FOR ALL TO authenticated
  USING (showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), showroom_id))
  WITH CHECK (showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), showroom_id));

DROP POLICY IF EXISTS purchase_items_all_authenticated ON public.purchase_items;
CREATE POLICY purchase_items_scope ON public.purchase_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = purchase_id
                  AND (p.showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), p.showroom_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = purchase_id
                  AND (p.showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), p.showroom_id))));

DROP POLICY IF EXISTS purchase_returns_all_authenticated ON public.purchase_returns;
CREATE POLICY purchase_returns_scope ON public.purchase_returns FOR ALL TO authenticated
  USING (showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), showroom_id))
  WITH CHECK (showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), showroom_id));

DROP POLICY IF EXISTS purchase_return_items_all_authenticated ON public.purchase_return_items;
CREATE POLICY purchase_return_items_scope ON public.purchase_return_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_returns r WHERE r.id = return_id
                  AND (r.showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), r.showroom_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_returns r WHERE r.id = return_id
                  AND (r.showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), r.showroom_id))));

DROP POLICY IF EXISTS transfers_all_authenticated ON public.transfers;
CREATE POLICY transfers_scope ON public.transfers FOR ALL TO authenticated
  USING (public.user_has_showroom_access(auth.uid(), source_showroom_id)
      OR public.user_has_showroom_access(auth.uid(), dest_showroom_id))
  WITH CHECK (public.user_has_showroom_access(auth.uid(), source_showroom_id)
      OR public.user_has_showroom_access(auth.uid(), dest_showroom_id));

DROP POLICY IF EXISTS transfer_items_all_authenticated ON public.transfer_items;
CREATE POLICY transfer_items_scope ON public.transfer_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.transfers t WHERE t.id = transfer_id
                  AND (public.user_has_showroom_access(auth.uid(), t.source_showroom_id)
                    OR public.user_has_showroom_access(auth.uid(), t.dest_showroom_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.transfers t WHERE t.id = transfer_id
                  AND (public.user_has_showroom_access(auth.uid(), t.source_showroom_id)
                    OR public.user_has_showroom_access(auth.uid(), t.dest_showroom_id))));

DROP POLICY IF EXISTS product_stock_all_authenticated ON public.product_stock;
CREATE POLICY product_stock_scope ON public.product_stock FOR ALL TO authenticated
  USING (showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), showroom_id))
  WITH CHECK (showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), showroom_id));

DROP POLICY IF EXISTS stock_ledger_all_authenticated ON public.stock_ledger;
CREATE POLICY stock_ledger_scope ON public.stock_ledger FOR ALL TO authenticated
  USING (showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), showroom_id))
  WITH CHECK (showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), showroom_id));

DROP POLICY IF EXISTS raw_material_stock_all_authenticated ON public.raw_material_stock;
CREATE POLICY raw_material_stock_scope ON public.raw_material_stock FOR ALL TO authenticated
  USING (showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), showroom_id))
  WITH CHECK (showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), showroom_id));

DROP POLICY IF EXISTS raw_stock_ledger_all_authenticated ON public.raw_stock_ledger;
CREATE POLICY raw_stock_ledger_scope ON public.raw_stock_ledger FOR ALL TO authenticated
  USING (showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), showroom_id))
  WITH CHECK (showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), showroom_id));

DROP POLICY IF EXISTS "damaged_stock all authed" ON public.damaged_stock;
DROP POLICY IF EXISTS damaged_stock_all_authenticated ON public.damaged_stock;
CREATE POLICY damaged_stock_scope ON public.damaged_stock FOR ALL TO authenticated
  USING (showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), showroom_id))
  WITH CHECK (showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), showroom_id));

DROP POLICY IF EXISTS "damaged_ledger all authed" ON public.damaged_ledger;
DROP POLICY IF EXISTS damaged_ledger_all_authenticated ON public.damaged_ledger;
CREATE POLICY damaged_ledger_scope ON public.damaged_ledger FOR ALL TO authenticated
  USING (showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), showroom_id))
  WITH CHECK (showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), showroom_id));

DROP POLICY IF EXISTS cash_registers_all_authenticated ON public.cash_registers;
CREATE POLICY cash_registers_scope ON public.cash_registers FOR ALL TO authenticated
  USING (public.user_has_showroom_access(auth.uid(), showroom_id))
  WITH CHECK (public.user_has_showroom_access(auth.uid(), showroom_id));

DROP POLICY IF EXISTS customer_payments_all_authenticated ON public.customer_payments;
CREATE POLICY customer_payments_scope ON public.customer_payments FOR ALL TO authenticated
  USING (showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), showroom_id))
  WITH CHECK (showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), showroom_id));

DROP POLICY IF EXISTS held_sales_all_authenticated ON public.held_sales;
CREATE POLICY held_sales_scope ON public.held_sales FOR ALL TO authenticated
  USING (public.user_has_showroom_access(auth.uid(), showroom_id))
  WITH CHECK (public.user_has_showroom_access(auth.uid(), showroom_id));

DROP POLICY IF EXISTS wastage_log_all_authenticated ON public.wastage_log;
CREATE POLICY wastage_log_scope ON public.wastage_log FOR ALL TO authenticated
  USING (showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), showroom_id))
  WITH CHECK (showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), showroom_id));

DROP POLICY IF EXISTS orders_all_authenticated ON public.orders;
CREATE POLICY orders_scope ON public.orders FOR ALL TO authenticated
  USING (public.user_has_showroom_access(auth.uid(), showroom_id))
  WITH CHECK (public.user_has_showroom_access(auth.uid(), showroom_id));

DROP POLICY IF EXISTS expenses_all_authenticated ON public.expenses;
CREATE POLICY expenses_scope ON public.expenses FOR ALL TO authenticated
  USING (showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), showroom_id))
  WITH CHECK (showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), showroom_id));

DROP POLICY IF EXISTS work_orders_all_authenticated ON public.work_orders;
CREATE POLICY work_orders_scope ON public.work_orders FOR ALL TO authenticated
  USING (showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), showroom_id))
  WITH CHECK (showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), showroom_id));

DROP POLICY IF EXISTS qc_checks_all_authenticated ON public.qc_checks;
CREATE POLICY qc_checks_scope ON public.qc_checks FOR ALL TO authenticated
  USING (showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), showroom_id))
  WITH CHECK (showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), showroom_id));

DROP POLICY IF EXISTS "repurpose_queue all authed" ON public.repurpose_queue;
DROP POLICY IF EXISTS repurpose_queue_all_authenticated ON public.repurpose_queue;
CREATE POLICY repurpose_queue_scope ON public.repurpose_queue FOR ALL TO authenticated
  USING (source_showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), source_showroom_id))
  WITH CHECK (source_showroom_id IS NULL OR public.user_has_showroom_access(auth.uid(), source_showroom_id));

-- 4) RBAC metadata & shared tables
DROP POLICY IF EXISTS user_role_assignments_all_authenticated ON public.user_role_assignments;
CREATE POLICY ura_select_own_or_admin ON public.user_role_assignments FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.user_is_global_admin(auth.uid()));
CREATE POLICY ura_admin_write ON public.user_role_assignments FOR ALL TO authenticated
  USING (public.user_is_global_admin(auth.uid()))
  WITH CHECK (public.user_is_global_admin(auth.uid()));

DROP POLICY IF EXISTS user_roles_all_authenticated ON public.user_roles;
CREATE POLICY user_roles_select_own_or_admin ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.user_is_global_admin(auth.uid()));
CREATE POLICY user_roles_admin_write ON public.user_roles FOR ALL TO authenticated
  USING (public.user_is_global_admin(auth.uid()))
  WITH CHECK (public.user_is_global_admin(auth.uid()));

DROP POLICY IF EXISTS app_roles_all_authenticated ON public.app_roles;
CREATE POLICY app_roles_select ON public.app_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY app_roles_admin_write ON public.app_roles FOR ALL TO authenticated
  USING (public.user_is_global_admin(auth.uid()))
  WITH CHECK (public.user_is_global_admin(auth.uid()));

DROP POLICY IF EXISTS role_permissions_all_authenticated ON public.role_permissions;
CREATE POLICY role_permissions_select ON public.role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY role_permissions_admin_write ON public.role_permissions FOR ALL TO authenticated
  USING (public.user_is_global_admin(auth.uid()))
  WITH CHECK (public.user_is_global_admin(auth.uid()));

DROP POLICY IF EXISTS permissions_all_authenticated ON public.permissions;
CREATE POLICY permissions_select ON public.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY permissions_admin_write ON public.permissions FOR ALL TO authenticated
  USING (public.user_is_global_admin(auth.uid()))
  WITH CHECK (public.user_is_global_admin(auth.uid()));

DROP POLICY IF EXISTS company_settings_all_authenticated ON public.company_settings;
CREATE POLICY company_settings_select ON public.company_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY company_settings_admin_write ON public.company_settings FOR ALL TO authenticated
  USING (public.user_is_global_admin(auth.uid()))
  WITH CHECK (public.user_is_global_admin(auth.uid()));

DROP POLICY IF EXISTS employees_all_authenticated ON public.employees;
CREATE POLICY employees_select ON public.employees FOR SELECT TO authenticated USING (true);
CREATE POLICY employees_admin_write ON public.employees FOR ALL TO authenticated
  USING (public.user_is_global_admin(auth.uid()))
  WITH CHECK (public.user_is_global_admin(auth.uid()));

DROP POLICY IF EXISTS user_profiles_all_authenticated ON public.user_profiles;
CREATE POLICY user_profiles_select ON public.user_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY user_profiles_write ON public.user_profiles FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.user_is_global_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.user_is_global_admin(auth.uid()));