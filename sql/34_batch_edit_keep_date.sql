-- ============================================================================
-- Patch 34 — Edited production batches keep their ORIGINAL production date
--
-- Problem: edit_production_batch() reverses and re-applies the batch, so the
-- new ledger rows were stamped with now(). Reports then showed the batch on
-- the edit date instead of the day it was actually produced.
--
-- Fix: capture the batch's first production timestamp and stamp every ledger
-- row / overhead of that batch (including the reversal rows) with it, so the
-- whole batch stays on its production date and nets out inside the same day.
-- Idempotent — safe to re-run.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.edit_production_batch(
  _batch_id uuid,
  _batch numeric,
  _ingredients jsonb,
  _overheads jsonb DEFAULT '[]'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _product_id uuid; _showroom_id uuid; _orig_at timestamptz;
  _ingredient jsonb; _overhead jsonb; _sub_item record;
  _material_id uuid; _sub_recipe_id uuid; _qty_per_unit numeric; _yield_qty numeric;
  _ratio numeric; _required_qty numeric; _available_qty numeric;
  _totals jsonb := '{}'::jsonb; _mid text;
BEGIN
  PERFORM public.assert_app_staff();
  PERFORM public.assert_permission('production.batches.edit');

  SELECT product_id, showroom_id, created_at
    INTO _product_id, _showroom_id, _orig_at
    FROM public.stock_ledger
   WHERE ref_id = _batch_id AND ref_type = 'production' AND kind = 'production'
   ORDER BY created_at ASC
   LIMIT 1;
  IF _product_id IS NULL THEN RAISE EXCEPTION 'Batch % not found', _batch_id; END IF;
  PERFORM public.assert_location_access(_showroom_id);

  IF _batch IS NULL OR _batch <= 0 THEN RAISE EXCEPTION 'Batch quantity must be greater than zero'; END IF;
  IF _ingredients IS NULL OR jsonb_typeof(_ingredients) <> 'array' OR jsonb_array_length(_ingredients) = 0 THEN
    RAISE EXCEPTION 'At least one ingredient is required';
  END IF;

  -- Reverse the old movements first, so the availability check below sees the
  -- restored raw material balances.
  PERFORM public.reverse_production_batch_internal(_batch_id, 'Batch edited — previous entry reversed');

  -- Expand ingredients (materials + sub-recipes) into per-material totals
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

  -- Standard accounting rule: a correction does not move the transaction date.
  -- Pin every row of this batch back to the original production timestamp.
  IF _orig_at IS NOT NULL THEN
    UPDATE public.stock_ledger SET created_at = _orig_at
     WHERE ref_id = _batch_id AND ref_type = 'production' AND created_at <> _orig_at;
    UPDATE public.raw_stock_ledger SET created_at = _orig_at
     WHERE ref_id = _batch_id AND ref_type = 'production' AND created_at <> _orig_at;
    UPDATE public.production_overheads SET created_at = _orig_at
     WHERE batch_id = _batch_id AND created_at <> _orig_at;
  END IF;

  RETURN _batch_id;
END; $$;

REVOKE ALL ON FUNCTION public.edit_production_batch(uuid, numeric, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_production_batch(uuid, numeric, jsonb, jsonb) TO authenticated, service_role;

COMMIT;
