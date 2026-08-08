CREATE OR REPLACE FUNCTION public.user_has_permission(_user uuid, _key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _user IS NOT NULL AND (
    public.is_bootstrap_superadmin(_user)
    OR EXISTS (
      SELECT 1
      FROM public.user_role_assignments a
      JOIN public.app_roles r ON r.id = a.role_id AND r.is_active IS TRUE
      JOIN public.role_permissions rp ON rp.role_id = r.id
      WHERE a.user_id = _user AND rp.permission_key = _key)
  );
$$;

REVOKE ALL ON FUNCTION public.user_has_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_permission(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assert_permission(_key text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN RETURN; END IF;
  IF NOT public.user_has_permission(auth.uid(), _key) THEN
    RAISE EXCEPTION 'Not authorized: % permission required', _key;
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.assert_permission(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_permission(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reverse_production_batch_internal(_batch_id uuid, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _prod record; _row record; _available numeric;
BEGIN
  SELECT product_id, showroom_id, SUM(qty) AS qty
    INTO _prod
    FROM public.stock_ledger
   WHERE ref_id = _batch_id AND ref_type = 'production' AND kind = 'production'
   GROUP BY product_id, showroom_id;

  IF _prod.product_id IS NULL THEN
    RAISE EXCEPTION 'Batch % not found', _batch_id;
  END IF;

  PERFORM public.assert_location_access(_prod.showroom_id);

  SELECT quantity INTO _available FROM public.product_stock
   WHERE product_id = _prod.product_id
     AND showroom_id IS NOT DISTINCT FROM _prod.showroom_id
   FOR UPDATE;
  IF COALESCE(_available, 0) < _prod.qty THEN
    RAISE EXCEPTION 'Cannot reverse this batch: only % of % produced units are still in stock (the rest was sold, transferred or wasted)',
      COALESCE(_available, 0), _prod.qty;
  END IF;

  FOR _row IN
    SELECT material_id, SUM(qty) AS qty
      FROM public.raw_stock_ledger
     WHERE ref_id = _batch_id AND ref_type = 'production' AND kind = 'production_consume'
     GROUP BY material_id
  LOOP
    PERFORM public.commit_raw_stock_movement(_row.material_id, _prod.showroom_id, -_row.qty,
      'production_reverse', 'production', _batch_id, COALESCE(_note, 'Batch reversed'));
  END LOOP;

  PERFORM public.commit_stock_movement(_prod.product_id, _prod.showroom_id, -_prod.qty,
    'production_void', 'production', _batch_id, COALESCE(_note, 'Batch reversed'));

  DELETE FROM public.production_overheads WHERE batch_id = _batch_id;
END; $$;

REVOKE ALL ON FUNCTION public.reverse_production_batch_internal(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_production_batch_internal(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.void_production_batch(_batch_id uuid, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.assert_app_staff();
  PERFORM public.assert_permission('production.batches.delete');
  PERFORM public.reverse_production_batch_internal(_batch_id, COALESCE(_note, 'Batch deleted'));
END; $$;

REVOKE ALL ON FUNCTION public.void_production_batch(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_production_batch(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.edit_production_batch(
  _batch_id uuid,
  _batch numeric,
  _ingredients jsonb,
  _overheads jsonb DEFAULT '[]'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _product_id uuid; _showroom_id uuid;
  _ingredient jsonb; _overhead jsonb; _sub_item record;
  _material_id uuid; _sub_recipe_id uuid; _qty_per_unit numeric; _yield_qty numeric;
  _ratio numeric; _required_qty numeric; _available_qty numeric;
  _totals jsonb := '{}'::jsonb; _mid text;
BEGIN
  PERFORM public.assert_app_staff();
  PERFORM public.assert_permission('production.batches.edit');

  SELECT product_id, showroom_id INTO _product_id, _showroom_id
    FROM public.stock_ledger
   WHERE ref_id = _batch_id AND ref_type = 'production' AND kind = 'production'
   LIMIT 1;
  IF _product_id IS NULL THEN RAISE EXCEPTION 'Batch % not found', _batch_id; END IF;
  PERFORM public.assert_location_access(_showroom_id);

  IF _batch IS NULL OR _batch <= 0 THEN RAISE EXCEPTION 'Batch quantity must be greater than zero'; END IF;
  IF _ingredients IS NULL OR jsonb_typeof(_ingredients) <> 'array' OR jsonb_array_length(_ingredients) = 0 THEN
    RAISE EXCEPTION 'At least one ingredient is required';
  END IF;

  PERFORM public.reverse_production_batch_internal(_batch_id, 'Batch edited — previous entry reversed');

  FOR _ingredient IN SELECT * FROM jsonb_array_elements(_ingredients) LOOP
    _material_id := NULLIF(_ingredient->>'materialId','')::uuid;
    _sub_recipe_id := NULLIF(_ingredient->>'subRecipeId','')::uuid;
    _qty_per_unit := COALESCE((_ingredient->>'qty')::numeric, 0);
    IF _qty_per_unit <= 0 THEN RAISE EXCEPTION 'Ingredient quantity must be greater than zero'; END IF;
    IF _material_id IS NOT NULL AND _sub_recipe_id IS NOT NULL THEN
      RAISE EXCEPTION 'Ingredient can only reference either material or sub-recipe';
    END IF;
    IF _material_id IS NOT NULL THEN
      _mid := _material_id::text;
      _totals := jsonb_set(_totals, ARRAY[_mid],
        to_jsonb(COALESCE((_totals->>_mid)::numeric, 0) + (_qty_per_unit * _batch)));
    ELSIF _sub_recipe_id IS NOT NULL THEN
      SELECT yield_qty INTO _yield_qty FROM public.sub_recipes WHERE id = _sub_recipe_id AND is_active = true;
      IF _yield_qty IS NULL THEN RAISE EXCEPTION 'Sub-recipe not found or inactive'; END IF;
      IF _yield_qty <= 0 THEN RAISE EXCEPTION 'Sub-recipe yield must be greater than zero'; END IF;
      _ratio := (_qty_per_unit * _batch) / _yield_qty;
      FOR _sub_item IN SELECT material_id, qty FROM public.sub_recipe_items WHERE sub_recipe_id = _sub_recipe_id LOOP
        _mid := _sub_item.material_id::text;
        _totals := jsonb_set(_totals, ARRAY[_mid],
          to_jsonb(COALESCE((_totals->>_mid)::numeric, 0) + (_sub_item.qty * _ratio)));
      END LOOP;
    ELSE
      RAISE EXCEPTION 'Ingredient needs either material or sub-recipe';
    END IF;
  END LOOP;

  FOR _mid, _required_qty IN SELECT key, value::numeric FROM jsonb_each_text(_totals) LOOP
    SELECT quantity INTO _available_qty FROM public.raw_material_stock
     WHERE material_id = _mid::uuid AND showroom_id IS NOT DISTINCT FROM _showroom_id FOR UPDATE;
    IF COALESCE(_available_qty, 0) < _required_qty THEN
      RAISE EXCEPTION 'Insufficient raw materials for the corrected batch';
    END IF;
  END LOOP;

  FOR _mid, _required_qty IN SELECT key, value::numeric FROM jsonb_each_text(_totals) LOOP
    PERFORM public.commit_raw_stock_movement(_mid::uuid, _showroom_id, -_required_qty,
      'production_consume', 'production', _batch_id, 'Batch edited');
  END LOOP;

  PERFORM public.commit_stock_movement(_product_id, _showroom_id, _batch,
    'production', 'production', _batch_id, 'Batch edited');

  IF _overheads IS NOT NULL AND jsonb_typeof(_overheads) = 'array' THEN
    FOR _overhead IN SELECT * FROM jsonb_array_elements(_overheads) LOOP
      IF NULLIF(_overhead->>'categoryId','') IS NOT NULL AND COALESCE((_overhead->>'amount')::numeric, 0) > 0 THEN
        INSERT INTO public.production_overheads (batch_id, product_id, category_id, amount, note)
        VALUES (_batch_id, _product_id, (_overhead->>'categoryId')::uuid,
                (_overhead->>'amount')::numeric, NULLIF(_overhead->>'note',''));
      END IF;
    END LOOP;
  END IF;

  RETURN _batch_id;
END; $$;

REVOKE ALL ON FUNCTION public.edit_production_batch(uuid, numeric, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_production_batch(uuid, numeric, jsonb, jsonb) TO authenticated, service_role;

INSERT INTO public.permissions (permission_key, label, module) VALUES
  ('production.batches.edit',   'Edit production batches',   'Production'),
  ('production.batches.delete', 'Delete production batches', 'Production')
ON CONFLICT (permission_key) DO UPDATE
  SET label = EXCLUDED.label, module = EXCLUDED.module;

INSERT INTO public.role_permissions (role_id, permission_key)
SELECT r.id, k.key
FROM public.app_roles r
CROSS JOIN (VALUES ('production.batches.edit'), ('production.batches.delete')) AS k(key)
WHERE lower(r.name) IN ('admin', 'superadmin', 'owner')
ON CONFLICT DO NOTHING;