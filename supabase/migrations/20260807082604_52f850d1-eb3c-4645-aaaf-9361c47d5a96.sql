-- 25_strict_tenant_isolation.sql

CREATE OR REPLACE FUNCTION public.user_is_factory_user(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _user IS NOT NULL AND (
    public.user_is_global_admin(_user)
    OR EXISTS (
      SELECT 1 FROM public.user_role_assignments a
      JOIN public.showrooms s ON s.id = a.showroom_id
      WHERE a.user_id = _user AND s.is_factory IS TRUE)
  );
$$;

-- Single source of truth: NULL showroom_id == Factory.
CREATE OR REPLACE FUNCTION public.user_can_access_location(_user uuid, _showroom uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN _user IS NULL THEN false
    WHEN _showroom IS NULL THEN public.user_is_factory_user(_user)
    ELSE public.user_has_showroom_access(_user, _showroom)
  END;
$$;

REVOKE ALL ON FUNCTION public.user_is_factory_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_can_access_location(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_is_factory_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_can_access_location(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assert_location_access(_showroom uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN RETURN; END IF;
  IF NOT public.user_can_access_location(auth.uid(), _showroom) THEN
    RAISE EXCEPTION 'Not authorized for this location';
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.assert_location_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_location_access(uuid) TO authenticated, service_role;

-- ---------- direct showroom_id tables ----------
DROP POLICY IF EXISTS product_stock_scope ON public.product_stock;
CREATE POLICY product_stock_scope ON public.product_stock FOR ALL TO authenticated
  USING (public.user_can_access_location((SELECT auth.uid()), showroom_id))
  WITH CHECK (public.user_can_access_location((SELECT auth.uid()), showroom_id));

DROP POLICY IF EXISTS stock_ledger_scope ON public.stock_ledger;
CREATE POLICY stock_ledger_scope ON public.stock_ledger FOR ALL TO authenticated
  USING (public.user_can_access_location((SELECT auth.uid()), showroom_id))
  WITH CHECK (public.user_can_access_location((SELECT auth.uid()), showroom_id));

DROP POLICY IF EXISTS raw_material_stock_scope ON public.raw_material_stock;
CREATE POLICY raw_material_stock_scope ON public.raw_material_stock FOR ALL TO authenticated
  USING (public.user_can_access_location((SELECT auth.uid()), showroom_id))
  WITH CHECK (public.user_can_access_location((SELECT auth.uid()), showroom_id));

DROP POLICY IF EXISTS raw_stock_ledger_scope ON public.raw_stock_ledger;
CREATE POLICY raw_stock_ledger_scope ON public.raw_stock_ledger FOR ALL TO authenticated
  USING (public.user_can_access_location((SELECT auth.uid()), showroom_id))
  WITH CHECK (public.user_can_access_location((SELECT auth.uid()), showroom_id));

DROP POLICY IF EXISTS damaged_stock_scope ON public.damaged_stock;
CREATE POLICY damaged_stock_scope ON public.damaged_stock FOR ALL TO authenticated
  USING (public.user_can_access_location((SELECT auth.uid()), showroom_id))
  WITH CHECK (public.user_can_access_location((SELECT auth.uid()), showroom_id));

DROP POLICY IF EXISTS damaged_ledger_scope ON public.damaged_ledger;
CREATE POLICY damaged_ledger_scope ON public.damaged_ledger FOR ALL TO authenticated
  USING (public.user_can_access_location((SELECT auth.uid()), showroom_id))
  WITH CHECK (public.user_can_access_location((SELECT auth.uid()), showroom_id));

DROP POLICY IF EXISTS expenses_scope ON public.expenses;
CREATE POLICY expenses_scope ON public.expenses FOR ALL TO authenticated
  USING (public.user_can_access_location((SELECT auth.uid()), showroom_id))
  WITH CHECK (public.user_can_access_location((SELECT auth.uid()), showroom_id));

DROP POLICY IF EXISTS customer_payments_scope ON public.customer_payments;
CREATE POLICY customer_payments_scope ON public.customer_payments FOR ALL TO authenticated
  USING (public.user_can_access_location((SELECT auth.uid()), showroom_id))
  WITH CHECK (public.user_can_access_location((SELECT auth.uid()), showroom_id));

DROP POLICY IF EXISTS purchases_scope ON public.purchases;
CREATE POLICY purchases_scope ON public.purchases FOR ALL TO authenticated
  USING (public.user_can_access_location((SELECT auth.uid()), showroom_id))
  WITH CHECK (public.user_can_access_location((SELECT auth.uid()), showroom_id));

DROP POLICY IF EXISTS purchase_returns_scope ON public.purchase_returns;
CREATE POLICY purchase_returns_scope ON public.purchase_returns FOR ALL TO authenticated
  USING (public.user_can_access_location((SELECT auth.uid()), showroom_id))
  WITH CHECK (public.user_can_access_location((SELECT auth.uid()), showroom_id));

DROP POLICY IF EXISTS wastage_log_scope ON public.wastage_log;
CREATE POLICY wastage_log_scope ON public.wastage_log FOR ALL TO authenticated
  USING (public.user_can_access_location((SELECT auth.uid()), showroom_id))
  WITH CHECK (public.user_can_access_location((SELECT auth.uid()), showroom_id));

DROP POLICY IF EXISTS qc_checks_scope ON public.qc_checks;
CREATE POLICY qc_checks_scope ON public.qc_checks FOR ALL TO authenticated
  USING (public.user_can_access_location((SELECT auth.uid()), showroom_id))
  WITH CHECK (public.user_can_access_location((SELECT auth.uid()), showroom_id));

DROP POLICY IF EXISTS work_orders_scope ON public.work_orders;
CREATE POLICY work_orders_scope ON public.work_orders FOR ALL TO authenticated
  USING (public.user_can_access_location((SELECT auth.uid()), showroom_id))
  WITH CHECK (public.user_can_access_location((SELECT auth.uid()), showroom_id));

DROP POLICY IF EXISTS repurpose_queue_scope ON public.repurpose_queue;
CREATE POLICY repurpose_queue_scope ON public.repurpose_queue FOR ALL TO authenticated
  USING (public.user_can_access_location((SELECT auth.uid()), source_showroom_id))
  WITH CHECK (public.user_can_access_location((SELECT auth.uid()), source_showroom_id));

-- ---------- child tables ----------
DROP POLICY IF EXISTS purchase_items_scope ON public.purchase_items;
CREATE POLICY purchase_items_scope ON public.purchase_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = purchase_items.purchase_id
    AND public.user_can_access_location((SELECT auth.uid()), p.showroom_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = purchase_items.purchase_id
    AND public.user_can_access_location((SELECT auth.uid()), p.showroom_id)));

DROP POLICY IF EXISTS purchase_return_items_scope ON public.purchase_return_items;
CREATE POLICY purchase_return_items_scope ON public.purchase_return_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_returns r WHERE r.id = purchase_return_items.return_id
    AND public.user_can_access_location((SELECT auth.uid()), r.showroom_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_returns r WHERE r.id = purchase_return_items.return_id
    AND public.user_can_access_location((SELECT auth.uid()), r.showroom_id)));

-- ---------- transfers: sender creates, receiver accepts ----------
DROP POLICY IF EXISTS transfers_scope ON public.transfers;
CREATE POLICY transfers_select ON public.transfers FOR SELECT TO authenticated
  USING (public.user_can_access_location((SELECT auth.uid()), source_showroom_id)
      OR public.user_can_access_location((SELECT auth.uid()), dest_showroom_id));
CREATE POLICY transfers_insert ON public.transfers FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_location((SELECT auth.uid()), source_showroom_id));
CREATE POLICY transfers_update ON public.transfers FOR UPDATE TO authenticated
  USING (public.user_can_access_location((SELECT auth.uid()), source_showroom_id)
      OR public.user_can_access_location((SELECT auth.uid()), dest_showroom_id))
  WITH CHECK (public.user_can_access_location((SELECT auth.uid()), source_showroom_id)
      OR public.user_can_access_location((SELECT auth.uid()), dest_showroom_id));
CREATE POLICY transfers_delete ON public.transfers FOR DELETE TO authenticated
  USING (public.user_can_access_location((SELECT auth.uid()), source_showroom_id));

DROP POLICY IF EXISTS transfer_items_scope ON public.transfer_items;
CREATE POLICY transfer_items_scope ON public.transfer_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.transfers t WHERE t.id = transfer_items.transfer_id
    AND (public.user_can_access_location((SELECT auth.uid()), t.source_showroom_id)
      OR public.user_can_access_location((SELECT auth.uid()), t.dest_showroom_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.transfers t WHERE t.id = transfer_items.transfer_id
    AND public.user_can_access_location((SELECT auth.uid()), t.source_showroom_id)));

-- ---------- stock RPCs: verify location before writing ----------
CREATE OR REPLACE FUNCTION public.commit_stock_movement(_product_id uuid, _showroom_id uuid, _qty numeric, _kind text, _ref_type text DEFAULT NULL::text, _ref_id uuid DEFAULT NULL::uuid, _note text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _ledger_id uuid;
BEGIN
  PERFORM public.assert_app_staff();
  PERFORM public.assert_location_access(_showroom_id);
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
END; $$;

CREATE OR REPLACE FUNCTION public.commit_raw_stock_movement(_material_id uuid, _showroom_id uuid, _qty numeric, _kind text, _ref_type text DEFAULT NULL::text, _ref_id uuid DEFAULT NULL::uuid, _note text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _ledger_id uuid;
BEGIN
  PERFORM public.assert_app_staff();
  PERFORM public.assert_location_access(_showroom_id);
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
END; $$;

CREATE OR REPLACE FUNCTION public.commit_damaged_movement(_product_id uuid, _showroom_id uuid, _qty numeric, _kind text, _ref_type text DEFAULT NULL::text, _ref_id uuid DEFAULT NULL::uuid, _note text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _ledger_id uuid;
BEGIN
  PERFORM public.assert_app_staff();
  PERFORM public.assert_location_access(_showroom_id);
  INSERT INTO public.damaged_ledger (product_id, showroom_id, qty, kind, ref_type, ref_id, note)
  VALUES (_product_id, _showroom_id, _qty, _kind, _ref_type, _ref_id, _note)
  RETURNING id INTO _ledger_id;
  UPDATE public.damaged_stock SET quantity = quantity + _qty, updated_at = now()
   WHERE product_id = _product_id AND showroom_id IS NOT DISTINCT FROM _showroom_id;
  IF NOT FOUND THEN
    INSERT INTO public.damaged_stock (product_id, showroom_id, quantity) VALUES (_product_id, _showroom_id, _qty);
  END IF;
  RETURN _ledger_id;
END; $$;

CREATE OR REPLACE FUNCTION public.commit_damaged_sale(_product_id uuid, _showroom_id uuid, _qty numeric, _unit_price numeric, _customer_name text DEFAULT NULL::text, _note text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _ledger_id uuid; _available numeric; _amount numeric;
BEGIN
  PERFORM public.assert_app_staff();
  PERFORM public.assert_location_access(_showroom_id);
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
END; $$;

CREATE OR REPLACE FUNCTION public.log_finished_product_wastage(_product_id uuid, _showroom_id uuid, _qty numeric, _reason text, _note text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _available numeric; _queue_id uuid;
BEGIN
  PERFORM public.assert_app_staff();
  PERFORM public.assert_location_access(_showroom_id);
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
END; $$;

CREATE OR REPLACE FUNCTION public.commit_production_batch(_product_id uuid, _showroom_id uuid, _batch numeric, _ingredients jsonb, _overheads jsonb DEFAULT '[]'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _batch_id uuid; _ingredient jsonb; _overhead jsonb; _sub_item record;
  _material_id uuid; _sub_recipe_id uuid; _qty_per_unit numeric; _yield_qty numeric;
  _ratio numeric; _required_qty numeric; _available_qty numeric;
  _shelf_life_days integer; _mfg_date date := current_date;
  _totals jsonb := '{}'::jsonb; _mid text;
BEGIN
  PERFORM public.assert_app_staff();
  PERFORM public.assert_location_access(_showroom_id);
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
END; $$;

-- Damaged-return approval belongs to the factory (destination) side.
CREATE OR REPLACE FUNCTION public.commit_damaged_transfer_approve(_transfer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _t record; _it record;
BEGIN
  PERFORM public.assert_app_staff();
  SELECT * INTO _t FROM public.transfers WHERE id = _transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer % not found', _transfer_id; END IF;
  IF _t.kind IS DISTINCT FROM 'damaged_return' THEN
    RAISE EXCEPTION 'Transfer % is not a damaged return', _transfer_id;
  END IF;
  PERFORM public.assert_location_access(_t.dest_showroom_id);
  FOR _it IN SELECT product_id, qty FROM public.transfer_items WHERE transfer_id = _transfer_id LOOP
    INSERT INTO public.damaged_ledger (product_id, showroom_id, qty, kind, ref_type, ref_id, note)
    VALUES (_it.product_id, _t.source_showroom_id, -abs(_it.qty), 'transfer_out', 'transfer', _transfer_id,
            'Damaged return to factory');
    UPDATE public.damaged_stock SET quantity = quantity - abs(_it.qty), updated_at = now()
     WHERE product_id = _it.product_id AND showroom_id IS NOT DISTINCT FROM _t.source_showroom_id;
    INSERT INTO public.repurpose_queue (product_id, qty, source_showroom_id, transfer_id, status)
    VALUES (_it.product_id, _it.qty, _t.source_showroom_id, _transfer_id, 'pending');
  END LOOP;
  UPDATE public.transfers SET status='received', received_at=now() WHERE id=_transfer_id;
END; $$;

-- Receiving a normal transfer: only the destination may accept it.
CREATE OR REPLACE FUNCTION public.commit_transfer_receive(_transfer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _t record; _it record;
BEGIN
  PERFORM public.assert_app_staff();
  SELECT * INTO _t FROM public.transfers WHERE id = _transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer % not found', _transfer_id; END IF;
  PERFORM public.assert_location_access(_t.dest_showroom_id);
  IF _t.status <> 'sent' THEN RAISE EXCEPTION 'Transfer is not pending receipt'; END IF;
  IF _t.kind IS NOT DISTINCT FROM 'damaged_return' THEN
    RAISE EXCEPTION 'Use damaged-return approval for this transfer';
  END IF;
  FOR _it IN SELECT product_id, qty FROM public.transfer_items WHERE transfer_id = _transfer_id LOOP
    IF _it.product_id IS NULL THEN CONTINUE; END IF;
    INSERT INTO public.stock_ledger (product_id, showroom_id, qty, kind, ref_type, ref_id)
    VALUES (_it.product_id, _t.dest_showroom_id, _it.qty, 'transfer_in', 'transfer', _transfer_id);
    UPDATE public.product_stock SET quantity = quantity + _it.qty, updated_at = now()
     WHERE product_id = _it.product_id AND showroom_id IS NOT DISTINCT FROM _t.dest_showroom_id;
    IF NOT FOUND THEN
      INSERT INTO public.product_stock (product_id, showroom_id, quantity)
      VALUES (_it.product_id, _t.dest_showroom_id, _it.qty);
    END IF;
  END LOOP;
  UPDATE public.transfers SET status='received', received_at=now() WHERE id=_transfer_id;
END; $$;
REVOKE ALL ON FUNCTION public.commit_transfer_receive(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_transfer_receive(uuid) TO authenticated, service_role;

-- ---------- indexes ----------
CREATE INDEX IF NOT EXISTS idx_product_stock_showroom ON public.product_stock (showroom_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_showroom ON public.stock_ledger (showroom_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_material_stock_showroom ON public.raw_material_stock (showroom_id);
CREATE INDEX IF NOT EXISTS idx_raw_stock_ledger_showroom ON public.raw_stock_ledger (showroom_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_showroom ON public.sales (showroom_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_showroom ON public.purchases (showroom_id, purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_showroom ON public.expenses (showroom_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_damaged_stock_showroom ON public.damaged_stock (showroom_id);
CREATE INDEX IF NOT EXISTS idx_damaged_ledger_showroom ON public.damaged_ledger (showroom_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wastage_log_showroom ON public.wastage_log (showroom_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfers_source ON public.transfers (source_showroom_id, status);
CREATE INDEX IF NOT EXISTS idx_transfers_dest ON public.transfers (dest_showroom_id, status);
CREATE INDEX IF NOT EXISTS idx_customer_payments_showroom ON public.customer_payments (showroom_id, paid_on DESC);
CREATE INDEX IF NOT EXISTS idx_repurpose_queue_source ON public.repurpose_queue (source_showroom_id, status);