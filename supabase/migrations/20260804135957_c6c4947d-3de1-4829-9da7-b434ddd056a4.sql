-- ============================================================
-- Staff authorization helper
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_app_staff(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user)
    OR EXISTS (SELECT 1 FROM public.user_role_assignments WHERE user_id = _user)
  );
$$;
REVOKE ALL ON FUNCTION public.is_app_staff(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_app_staff(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_app_staff(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assert_app_staff()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN RETURN; END IF;
  IF NOT public.is_app_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.assert_app_staff() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_app_staff() FROM anon;
GRANT EXECUTE ON FUNCTION public.assert_app_staff() TO authenticated, service_role;

-- ============================================================
-- Lock anon out of SECURITY DEFINER functions
-- ============================================================
REVOKE ALL ON FUNCTION public.has_any_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_any_user() FROM anon;
GRANT EXECUTE ON FUNCTION public.has_any_user() TO service_role;

REVOKE ALL ON FUNCTION public.commit_damaged_sale(uuid, uuid, numeric, numeric, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_damaged_sale(uuid, uuid, numeric, numeric, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.commit_damaged_sale(uuid, uuid, numeric, numeric, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.log_finished_product_wastage(uuid, uuid, numeric, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_finished_product_wastage(uuid, uuid, numeric, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.log_finished_product_wastage(uuid, uuid, numeric, text, text) TO authenticated, service_role;

-- ============================================================
-- In-function access checks on SECURITY DEFINER routines
-- ============================================================
CREATE OR REPLACE FUNCTION public.find_user_id_by_email(_email text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM auth.users
   WHERE lower(email) = lower(_email)
     AND (COALESCE(auth.role(), '') = 'service_role' OR public.user_is_global_admin(auth.uid()))
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.commit_stock_movement(_product_id uuid, _showroom_id uuid, _qty numeric, _kind text, _ref_type text DEFAULT NULL::text, _ref_id uuid DEFAULT NULL::uuid, _note text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _ledger_id uuid;
BEGIN
  PERFORM public.assert_app_staff();
  INSERT INTO public.stock_ledger (product_id, showroom_id, qty, kind, ref_type, ref_id, note)
  VALUES (_product_id, _showroom_id, _qty, _kind, _ref_type, _ref_id, _note)
  RETURNING id INTO _ledger_id;
  UPDATE public.product_stock SET quantity = quantity + _qty, updated_at = now()
   WHERE product_id = _product_id AND showroom_id IS NOT DISTINCT FROM _showroom_id;
  IF NOT FOUND THEN
    INSERT INTO public.product_stock (product_id, showroom_id, quantity)
    VALUES (_product_id, _showroom_id, _qty);
  END IF;
  RETURN _ledger_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.commit_raw_stock_movement(_material_id uuid, _showroom_id uuid, _qty numeric, _kind text, _ref_type text DEFAULT NULL::text, _ref_id uuid DEFAULT NULL::uuid, _note text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _ledger_id uuid;
BEGIN
  PERFORM public.assert_app_staff();
  INSERT INTO public.raw_stock_ledger (material_id, showroom_id, qty, kind, ref_type, ref_id, note)
  VALUES (_material_id, _showroom_id, _qty, _kind, _ref_type, _ref_id, _note)
  RETURNING id INTO _ledger_id;
  UPDATE public.raw_material_stock SET quantity = quantity + _qty, updated_at = now()
   WHERE material_id = _material_id AND showroom_id IS NOT DISTINCT FROM _showroom_id;
  IF NOT FOUND THEN
    INSERT INTO public.raw_material_stock (material_id, showroom_id, quantity)
    VALUES (_material_id, _showroom_id, _qty);
  END IF;
  RETURN _ledger_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.commit_damaged_movement(_product_id uuid, _showroom_id uuid, _qty numeric, _kind text, _ref_type text DEFAULT NULL::text, _ref_id uuid DEFAULT NULL::uuid, _note text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _ledger_id uuid;
BEGIN
  PERFORM public.assert_app_staff();
  INSERT INTO public.damaged_ledger (product_id, showroom_id, qty, kind, ref_type, ref_id, note)
  VALUES (_product_id, _showroom_id, _qty, _kind, _ref_type, _ref_id, _note)
  RETURNING id INTO _ledger_id;
  UPDATE public.damaged_stock SET quantity = quantity + _qty, updated_at = now()
   WHERE product_id = _product_id AND showroom_id IS NOT DISTINCT FROM _showroom_id;
  IF NOT FOUND THEN
    INSERT INTO public.damaged_stock (product_id, showroom_id, quantity) VALUES (_product_id, _showroom_id, _qty);
  END IF;
  RETURN _ledger_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.commit_damaged_transfer_approve(_transfer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _t record; _it record;
BEGIN
  PERFORM public.assert_app_staff();
  SELECT * INTO _t FROM public.transfers WHERE id = _transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer % not found', _transfer_id; END IF;
  IF _t.kind IS DISTINCT FROM 'damaged_return' THEN
    RAISE EXCEPTION 'Transfer % is not a damaged return', _transfer_id;
  END IF;
  FOR _it IN SELECT product_id, qty FROM public.transfer_items WHERE transfer_id = _transfer_id LOOP
    PERFORM public.commit_damaged_movement(_it.product_id, _t.source_showroom_id, -abs(_it.qty),
      'transfer_out', 'transfer', _transfer_id, 'Damaged return to factory');
    INSERT INTO public.repurpose_queue (product_id, qty, source_showroom_id, transfer_id, status)
    VALUES (_it.product_id, _it.qty, _t.source_showroom_id, _transfer_id, 'pending');
  END LOOP;
  UPDATE public.transfers SET status='received', received_at=now() WHERE id=_transfer_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.commit_damaged_sale(_product_id uuid, _showroom_id uuid, _qty numeric, _unit_price numeric, _customer_name text DEFAULT NULL::text, _note text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _ledger_id uuid; _available numeric; _amount numeric;
BEGIN
  PERFORM public.assert_app_staff();
  IF _qty IS NULL OR _qty <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero'; END IF;
  IF _unit_price IS NULL OR _unit_price < 0 THEN RAISE EXCEPTION 'Unit price must be zero or greater'; END IF;
  SELECT quantity INTO _available FROM public.damaged_stock
   WHERE product_id = _product_id AND showroom_id IS NOT DISTINCT FROM _showroom_id FOR UPDATE;
  IF COALESCE(_available, 0) < _qty THEN
    RAISE EXCEPTION 'Insufficient damaged stock (have %, need %)', COALESCE(_available, 0), _qty;
  END IF;
  _amount := _qty * _unit_price;
  INSERT INTO public.damaged_ledger (product_id, showroom_id, qty, kind, ref_type, note, sale_amount, customer_name)
  VALUES (_product_id, _showroom_id, -abs(_qty), 'sale_out', 'damaged_sale', _note, _amount, _customer_name)
  RETURNING id INTO _ledger_id;
  UPDATE public.damaged_stock SET quantity = quantity - _qty, updated_at = now()
   WHERE product_id = _product_id AND showroom_id IS NOT DISTINCT FROM _showroom_id;
  RETURN _ledger_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.commit_repurpose(_queue_id uuid, _material_id uuid, _yield_qty numeric, _wastage_qty numeric, _note text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _q record;
BEGIN
  PERFORM public.assert_app_staff();
  SELECT * INTO _q FROM public.repurpose_queue WHERE id=_queue_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Queue item % not found', _queue_id; END IF;
  IF _q.status <> 'pending' THEN RAISE EXCEPTION 'Queue item already processed'; END IF;
  IF _material_id IS NOT NULL THEN
    IF _yield_qty IS NULL OR _yield_qty <= 0 THEN RAISE EXCEPTION 'Yield quantity must be greater than zero'; END IF;
    PERFORM public.commit_raw_stock_movement(_material_id, NULL, _yield_qty, 'repurpose_in',
      'repurpose', _queue_id, COALESCE(_note, 'Repurposed from damaged product'));
  END IF;
  IF _wastage_qty IS NOT NULL AND _wastage_qty > 0 THEN
    INSERT INTO public.wastage_log (material_id, showroom_id, qty, reason, notes)
    VALUES (COALESCE(_material_id, (SELECT id FROM public.raw_materials LIMIT 1)), NULL, _wastage_qty,
      CASE WHEN _material_id IS NULL THEN 'repurpose_discard' ELSE 'repurpose_wastage' END, _note);
  END IF;
  INSERT INTO public.damaged_ledger (product_id, showroom_id, qty, kind, ref_type, ref_id, note)
  VALUES (_q.product_id, NULL, -abs(_q.qty),
    CASE WHEN _material_id IS NULL THEN 'discard' ELSE 'repurpose_out' END, 'repurpose', _queue_id, _note);
  UPDATE public.repurpose_queue
     SET status = CASE WHEN _material_id IS NULL THEN 'discarded' ELSE 'converted' END,
         converted_material_id=_material_id, yield_qty=_yield_qty, wastage_qty=_wastage_qty,
         note=COALESCE(_note, note), processed_at=now()
   WHERE id=_queue_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.log_finished_product_wastage(_product_id uuid, _showroom_id uuid, _qty numeric, _reason text, _note text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _available numeric; _queue_id uuid;
BEGIN
  PERFORM public.assert_app_staff();
  IF _qty IS NULL OR _qty <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero'; END IF;
  SELECT quantity INTO _available FROM public.product_stock
   WHERE product_id = _product_id AND showroom_id IS NOT DISTINCT FROM _showroom_id FOR UPDATE;
  IF COALESCE(_available, 0) < _qty THEN
    RAISE EXCEPTION 'Insufficient finished-product stock (have %, need %)', COALESCE(_available, 0), _qty;
  END IF;
  PERFORM public.commit_stock_movement(_product_id, _showroom_id, -abs(_qty),
    'wastage_out', 'wastage', NULL, COALESCE(_reason, 'Finished-product wastage'));
  PERFORM public.commit_damaged_movement(_product_id, _showroom_id, abs(_qty),
    'damaged_in', 'wastage', NULL, COALESCE(_note, _reason));
  INSERT INTO public.repurpose_queue (product_id, qty, source_showroom_id, status, note)
  VALUES (_product_id, _qty, _showroom_id, 'pending', COALESCE(_note, _reason))
  RETURNING id INTO _queue_id;
  RETURN _queue_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.commit_production_batch(_product_id uuid, _showroom_id uuid, _batch numeric, _ingredients jsonb, _overheads jsonb DEFAULT '[]'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _batch_id uuid; _ingredient jsonb; _overhead jsonb; _sub_item record;
  _material_id uuid; _sub_recipe_id uuid; _qty_per_unit numeric; _yield_qty numeric;
  _ratio numeric; _required_qty numeric; _available_qty numeric;
  _shelf_life_days integer; _mfg_date date := current_date;
  _totals jsonb := '{}'::jsonb; _mid text;
BEGIN
  PERFORM public.assert_app_staff();
  IF _product_id IS NULL THEN RAISE EXCEPTION 'Product is required'; END IF;
  IF _batch IS NULL OR _batch <= 0 THEN RAISE EXCEPTION 'Batch quantity must be greater than zero'; END IF;
  IF _ingredients IS NULL OR jsonb_typeof(_ingredients) <> 'array' OR jsonb_array_length(_ingredients) = 0 THEN
    RAISE EXCEPTION 'At least one ingredient is required';
  END IF;

  FOR _ingredient IN SELECT * FROM jsonb_array_elements(_ingredients) LOOP
    _material_id := NULLIF(_ingredient->>'materialId','')::uuid;
    _sub_recipe_id := NULLIF(_ingredient->>'subRecipeId','')::uuid;
    _qty_per_unit := COALESCE((_ingredient->>'qty')::numeric, 0);
    IF _qty_per_unit <= 0 THEN RAISE EXCEPTION 'Ingredient quantity must be greater than zero'; END IF;
    IF _material_id IS NOT NULL AND _sub_recipe_id IS NOT NULL THEN
      RAISE EXCEPTION 'Ingredient can only reference either material or sub-recipe';
    END IF;
    IF _material_id IS NOT NULL THEN
      _required_qty := _qty_per_unit * _batch;
      _mid := _material_id::text;
      _totals := jsonb_set(_totals, ARRAY[_mid], to_jsonb(COALESCE((_totals->>_mid)::numeric, 0) + _required_qty));
    ELSIF _sub_recipe_id IS NOT NULL THEN
      SELECT yield_qty INTO _yield_qty FROM public.sub_recipes WHERE id = _sub_recipe_id AND is_active = true;
      IF _yield_qty IS NULL THEN RAISE EXCEPTION 'Sub-recipe not found or inactive'; END IF;
      IF _yield_qty <= 0 THEN RAISE EXCEPTION 'Sub-recipe yield must be greater than zero'; END IF;
      _ratio := (_qty_per_unit * _batch) / _yield_qty;
      FOR _sub_item IN SELECT material_id, qty FROM public.sub_recipe_items WHERE sub_recipe_id = _sub_recipe_id LOOP
        _mid := _sub_item.material_id::text;
        _totals := jsonb_set(_totals, ARRAY[_mid], to_jsonb(COALESCE((_totals->>_mid)::numeric, 0) + (_sub_item.qty * _ratio)));
      END LOOP;
    ELSE
      RAISE EXCEPTION 'Ingredient needs either material or sub-recipe';
    END IF;
  END LOOP;

  FOR _mid, _required_qty IN SELECT key, value::numeric FROM jsonb_each_text(_totals) LOOP
    SELECT quantity INTO _available_qty FROM public.raw_material_stock
     WHERE material_id = _mid::uuid AND showroom_id IS NOT DISTINCT FROM _showroom_id FOR UPDATE;
    IF COALESCE(_available_qty, 0) < _required_qty THEN
      RAISE EXCEPTION 'Insufficient raw materials for this batch';
    END IF;
  END LOOP;

  _batch_id := gen_random_uuid();

  FOR _mid, _required_qty IN SELECT key, value::numeric FROM jsonb_each_text(_totals) LOOP
    PERFORM public.commit_raw_stock_movement(_mid::uuid, _showroom_id, -_required_qty,
      'production_consume', 'production', _batch_id, NULL);
  END LOOP;

  PERFORM public.commit_stock_movement(_product_id, _showroom_id, _batch, 'production', 'production', _batch_id, NULL);

  IF _overheads IS NOT NULL AND jsonb_typeof(_overheads) = 'array' THEN
    FOR _overhead IN SELECT * FROM jsonb_array_elements(_overheads) LOOP
      IF NULLIF(_overhead->>'categoryId','') IS NOT NULL AND COALESCE((_overhead->>'amount')::numeric, 0) > 0 THEN
        INSERT INTO public.production_overheads (batch_id, product_id, category_id, amount, note)
        VALUES (_batch_id, _product_id, (_overhead->>'categoryId')::uuid,
                (_overhead->>'amount')::numeric, NULLIF(_overhead->>'note',''));
      END IF;
    END LOOP;
  END IF;

  SELECT shelf_life_days INTO _shelf_life_days FROM public.products WHERE id = _product_id;
  UPDATE public.products
     SET mfg_date = _mfg_date,
         expiry_date = CASE WHEN COALESCE(_shelf_life_days,0) > 0 THEN _mfg_date + _shelf_life_days ELSE expiry_date END,
         updated_at = now()
   WHERE id = _product_id;

  RETURN _batch_id;
END; $function$;

DROP FUNCTION IF EXISTS public.commit_production_batch(uuid, uuid, numeric, jsonb);

-- ============================================================
-- customers: branch-scoped reads
-- ============================================================
DROP POLICY IF EXISTS customers_read ON public.customers;
CREATE POLICY customers_read ON public.customers FOR SELECT TO authenticated
USING (
  public.user_is_global_admin((SELECT auth.uid()))
  OR (
    public.is_app_staff((SELECT auth.uid()))
    AND (
      EXISTS (
        SELECT 1 FROM public.sales s
         WHERE s.customer_id = customers.id
           AND public.user_has_showroom_access((SELECT auth.uid()), s.showroom_id)
      )
      OR EXISTS (
        SELECT 1 FROM public.customer_payments cp
         WHERE cp.customer_id = customers.id
           AND public.user_has_showroom_access((SELECT auth.uid()), cp.showroom_id)
      )
      OR NOT EXISTS (SELECT 1 FROM public.sales s2 WHERE s2.customer_id = customers.id)
    )
  )
);

-- ============================================================
-- suppliers: branch-scoped reads
-- ============================================================
DROP POLICY IF EXISTS suppliers_read ON public.suppliers;
CREATE POLICY suppliers_read ON public.suppliers FOR SELECT TO authenticated
USING (
  public.user_is_global_admin((SELECT auth.uid()))
  OR (
    public.is_app_staff((SELECT auth.uid()))
    AND (
      EXISTS (
        SELECT 1 FROM public.purchases p
         WHERE p.supplier_id = suppliers.id
           AND public.user_has_showroom_access((SELECT auth.uid()), p.showroom_id)
      )
      OR NOT EXISTS (SELECT 1 FROM public.purchases p2 WHERE p2.supplier_id = suppliers.id)
    )
  )
);

-- ============================================================
-- user_profiles: own row or admin
-- ============================================================
DROP POLICY IF EXISTS user_profiles_select ON public.user_profiles;
CREATE POLICY user_profiles_select ON public.user_profiles FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) OR public.user_is_global_admin((SELECT auth.uid())));

-- ============================================================
-- company_settings: no anon access to full row; public branding view
-- ============================================================
DROP POLICY IF EXISTS company_settings_public_branding ON public.company_settings;
DROP POLICY IF EXISTS company_settings_select ON public.company_settings;
CREATE POLICY company_settings_select ON public.company_settings FOR SELECT TO authenticated
USING (public.is_app_staff((SELECT auth.uid())));
REVOKE SELECT ON public.company_settings FROM anon;

CREATE OR REPLACE VIEW public.company_branding_public AS
  SELECT name, tagline, logo_url, address, footer_note, currency
    FROM public.company_settings
   WHERE is_current = true
   ORDER BY updated_at DESC NULLS LAST
   LIMIT 1;
GRANT SELECT ON public.company_branding_public TO anon, authenticated;

-- ============================================================
-- landing_carousels: drafts admin-only
-- ============================================================
DROP POLICY IF EXISTS "auth read carousels" ON public.landing_carousels;
CREATE POLICY "auth read carousels" ON public.landing_carousels FOR SELECT TO authenticated
USING (is_active = true OR public.user_is_global_admin((SELECT auth.uid())));

-- ============================================================
-- sub_recipes / sub_recipe_items: no always-true writes
-- ============================================================
DROP POLICY IF EXISTS sub_recipes_all ON public.sub_recipes;
CREATE POLICY sub_recipes_select ON public.sub_recipes FOR SELECT TO authenticated
USING (public.is_app_staff((SELECT auth.uid())));
CREATE POLICY sub_recipes_write ON public.sub_recipes FOR ALL TO authenticated
USING (public.user_is_global_admin((SELECT auth.uid())))
WITH CHECK (public.user_is_global_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS sub_recipe_items_all ON public.sub_recipe_items;
CREATE POLICY sub_recipe_items_select ON public.sub_recipe_items FOR SELECT TO authenticated
USING (public.is_app_staff((SELECT auth.uid())));
CREATE POLICY sub_recipe_items_write ON public.sub_recipe_items FOR ALL TO authenticated
USING (public.user_is_global_admin((SELECT auth.uid())))
WITH CHECK (public.user_is_global_admin((SELECT auth.uid())));

-- ============================================================
-- storage: customer avatars ownership check, landing images admin writes
-- ============================================================
DROP POLICY IF EXISTS "auth read customer-avatars" ON storage.objects;
CREATE POLICY "auth read customer-avatars" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'customer-avatars'
  AND (
    public.user_is_global_admin((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.customers c
       WHERE c.avatar_url IS NOT NULL
         AND c.avatar_url LIKE '%' || storage.objects.name || '%'
    )
  )
);

DROP POLICY IF EXISTS "landing-images insert" ON storage.objects;
CREATE POLICY "landing-images insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'landing-images' AND public.user_is_global_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "landing-images update" ON storage.objects;
CREATE POLICY "landing-images update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'landing-images' AND public.user_is_global_admin((SELECT auth.uid())))
WITH CHECK (bucket_id = 'landing-images' AND public.user_is_global_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "landing-images delete" ON storage.objects;
CREATE POLICY "landing-images delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'landing-images' AND public.user_is_global_admin((SELECT auth.uid())));