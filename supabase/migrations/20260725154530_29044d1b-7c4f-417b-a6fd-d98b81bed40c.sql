
-- 1. customers: authenticated read, global admin write
DROP POLICY IF EXISTS customers_all_authenticated ON public.customers;
CREATE POLICY customers_read ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY customers_write ON public.customers FOR ALL TO authenticated
  USING (public.user_is_global_admin(auth.uid()))
  WITH CHECK (public.user_is_global_admin(auth.uid()));

-- 2. suppliers: authenticated read, global admin write
DROP POLICY IF EXISTS suppliers_all_authenticated ON public.suppliers;
CREATE POLICY suppliers_read ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY suppliers_write ON public.suppliers FOR ALL TO authenticated
  USING (public.user_is_global_admin(auth.uid()))
  WITH CHECK (public.user_is_global_admin(auth.uid()));

-- 3. supplier_payments: global admin only
DROP POLICY IF EXISTS supplier_payments_all_authenticated ON public.supplier_payments;
CREATE POLICY supplier_payments_admin ON public.supplier_payments FOR ALL TO authenticated
  USING (public.user_is_global_admin(auth.uid()))
  WITH CHECK (public.user_is_global_admin(auth.uid()));

-- 4. master data tables: authenticated read, global admin write
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products','raw_materials','units','purchase_categories','recipe_categories',
    'customer_groups','product_selling_prices','expense_categories',
    'product_categories','selling_price_groups','recipes'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_all_authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.user_is_global_admin(auth.uid())) WITH CHECK (public.user_is_global_admin(auth.uid()))', t || '_write', t);
  END LOOP;
END $$;

-- 5. Replace always-true ALL policies with admin-restricted writes
DROP POLICY IF EXISTS "auth manage carousels" ON public.landing_carousels;
CREATE POLICY landing_carousels_admin ON public.landing_carousels FOR ALL TO authenticated
  USING (public.user_is_global_admin(auth.uid()))
  WITH CHECK (public.user_is_global_admin(auth.uid()));

DROP POLICY IF EXISTS poc_all_auth ON public.production_overhead_categories;
CREATE POLICY poc_read ON public.production_overhead_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY poc_write ON public.production_overhead_categories FOR ALL TO authenticated
  USING (public.user_is_global_admin(auth.uid()))
  WITH CHECK (public.user_is_global_admin(auth.uid()));

DROP POLICY IF EXISTS ro_all_auth ON public.recipe_overheads;
CREATE POLICY ro_read ON public.recipe_overheads FOR SELECT TO authenticated USING (true);
CREATE POLICY ro_write ON public.recipe_overheads FOR ALL TO authenticated
  USING (public.user_is_global_admin(auth.uid()))
  WITH CHECK (public.user_is_global_admin(auth.uid()));

DROP POLICY IF EXISTS po_all_auth ON public.production_overheads;
CREATE POLICY po_read ON public.production_overheads FOR SELECT TO authenticated USING (true);
CREATE POLICY po_write ON public.production_overheads FOR ALL TO authenticated
  USING (public.user_is_global_admin(auth.uid()))
  WITH CHECK (public.user_is_global_admin(auth.uid()));

-- 6. Storage: restrict writes on the three app buckets to global admins
DO $$
DECLARE b text;
BEGIN
  FOREACH b IN ARRAY ARRAY['customer-avatars','product-images','company-logos'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'auth insert ' || b);
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'auth update ' || b);
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', 'auth delete ' || b);
    EXECUTE format($p$CREATE POLICY %I ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = %L AND public.user_is_global_admin(auth.uid()))$p$, 'admin insert ' || b, b);
    EXECUTE format($p$CREATE POLICY %I ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = %L AND public.user_is_global_admin(auth.uid())) WITH CHECK (bucket_id = %L AND public.user_is_global_admin(auth.uid()))$p$, 'admin update ' || b, b, b);
    EXECUTE format($p$CREATE POLICY %I ON storage.objects FOR DELETE TO authenticated USING (bucket_id = %L AND public.user_is_global_admin(auth.uid()))$p$, 'admin delete ' || b, b);
  END LOOP;
END $$;

-- 7. Revoke EXECUTE on SECURITY DEFINER functions from anon (keep authenticated where needed)
REVOKE EXECUTE ON FUNCTION public.commit_damaged_movement(uuid,uuid,numeric,text,text,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.commit_damaged_transfer_approve(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.commit_production_batch(uuid,uuid,numeric,jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.commit_production_batch(uuid,uuid,numeric,jsonb,jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.commit_raw_stock_movement(uuid,uuid,numeric,text,text,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.commit_repurpose(uuid,uuid,numeric,numeric,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.commit_stock_movement(uuid,uuid,numeric,text,text,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.find_user_id_by_email(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_effective_invoice_settings(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_invoice_bundle(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_bootstrap_superadmin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_has_showroom_access(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_is_global_admin(uuid) FROM PUBLIC, anon;
-- has_any_user is intentionally callable pre-signin for bootstrap; keep anon
