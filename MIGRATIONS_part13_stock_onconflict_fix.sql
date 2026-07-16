-- ============================================================
-- Part 13: Fix batch production stock commits
--
-- Fixes:
--   1) "no unique or exclusion constraint matching the ON CONFLICT
--      specification" on batch approval.
--   2) Raw materials being deducted even when finished product stock
--      movement fails.
--
-- Root cause:
--   Older/self-hosted databases may have plain UNIQUE(product_id,
--   showroom_id) constraints. PostgreSQL treats NULL showroom_id values
--   as distinct in those constraints, so factory-level stock can still
--   duplicate and ON CONFLICT can fail or miss the intended row. Some
--   installs also had expression unique indexes that are not valid
--   arbiters for ON CONFLICT(product_id, showroom_id).
--
-- Approach:
--   - Merge any duplicate stock rows first.
--   - Replace legacy unique constraints/indexes with NULLS NOT DISTINCT
--     indexes on the real columns.
--   - Replace stock movement RPCs so they use UPDATE ... IS NOT DISTINCT
--     FROM ... INSERT instead of relying on ON CONFLICT.
--   - Add commit_production_batch(), a single transactional RPC. If any
--     step fails, raw material deductions roll back automatically.
--
-- Safe to run multiple times.
-- Requires PostgreSQL 15+ for NULLS NOT DISTINCT indexes.
-- ============================================================

-- ---------- de-duplicate product_stock ----------
WITH ranked AS (
  SELECT
    id,
    product_id,
    showroom_id,
    row_number() OVER (
      PARTITION BY product_id, showroom_id
      ORDER BY id
    ) AS rn,
    first_value(id) OVER (
      PARTITION BY product_id, showroom_id
      ORDER BY id
    ) AS keep_id,
    sum(quantity) OVER (PARTITION BY product_id, showroom_id) AS total_quantity,
    max(min_stock) OVER (PARTITION BY product_id, showroom_id) AS max_min_stock
  FROM public.product_stock
)
UPDATE public.product_stock ps
SET
  quantity = ranked.total_quantity,
  min_stock = ranked.max_min_stock,
  updated_at = now()
FROM ranked
WHERE ps.id = ranked.keep_id
  AND ranked.rn = 1;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY product_id, showroom_id
      ORDER BY created_at, id
    ) AS rn
  FROM public.product_stock
)
DELETE FROM public.product_stock ps
USING ranked
WHERE ps.id = ranked.id
  AND ranked.rn > 1;

-- ---------- de-duplicate raw_material_stock ----------
WITH ranked AS (
  SELECT
    id,
    material_id,
    showroom_id,
    row_number() OVER (
      PARTITION BY material_id, showroom_id
      ORDER BY created_at, id
    ) AS rn,
    first_value(id) OVER (
      PARTITION BY material_id, showroom_id
      ORDER BY created_at, id
    ) AS keep_id,
    sum(quantity) OVER (PARTITION BY material_id, showroom_id) AS total_quantity,
    max(min_stock) OVER (PARTITION BY material_id, showroom_id) AS max_min_stock
  FROM public.raw_material_stock
)
UPDATE public.raw_material_stock rms
SET
  quantity = ranked.total_quantity,
  min_stock = ranked.max_min_stock,
  updated_at = now()
FROM ranked
WHERE rms.id = ranked.keep_id
  AND ranked.rn = 1;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY material_id, showroom_id
      ORDER BY created_at, id
    ) AS rn
  FROM public.raw_material_stock
)
DELETE FROM public.raw_material_stock rms
USING ranked
WHERE rms.id = ranked.id
  AND ranked.rn > 1;

-- ---------- product_stock uniqueness ----------
DROP INDEX IF EXISTS public.product_stock_uniq;
ALTER TABLE public.product_stock
  DROP CONSTRAINT IF EXISTS product_stock_product_id_showroom_id_key;
DROP INDEX IF EXISTS public.product_stock_product_id_showroom_id_key;
DROP INDEX IF EXISTS public.product_stock_product_showroom_uniq;

CREATE UNIQUE INDEX product_stock_product_showroom_uniq
  ON public.product_stock (product_id, showroom_id) NULLS NOT DISTINCT;

-- ---------- raw_material_stock uniqueness ----------
DROP INDEX IF EXISTS public.raw_material_stock_uniq;
ALTER TABLE public.raw_material_stock
  DROP CONSTRAINT IF EXISTS raw_material_stock_material_id_showroom_id_key;
DROP INDEX IF EXISTS public.raw_material_stock_material_id_showroom_id_key;
DROP INDEX IF EXISTS public.raw_material_stock_material_showroom_uniq;

CREATE UNIQUE INDEX raw_material_stock_material_showroom_uniq
  ON public.raw_material_stock (material_id, showroom_id) NULLS NOT DISTINCT;

-- ---------- stock movement RPCs without ON CONFLICT ----------
CREATE OR REPLACE FUNCTION public.commit_stock_movement(
  _product_id uuid,
  _showroom_id uuid,
  _qty numeric,
  _kind text,
  _ref_type text DEFAULT NULL::text,
  _ref_id uuid DEFAULT NULL::uuid,
  _note text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _ledger_id uuid;
BEGIN
  INSERT INTO public.stock_ledger (product_id, showroom_id, qty, kind, ref_type, ref_id, note)
  VALUES (_product_id, _showroom_id, _qty, _kind, _ref_type, _ref_id, _note)
  RETURNING id INTO _ledger_id;

  UPDATE public.product_stock
  SET quantity = quantity + _qty,
      updated_at = now()
  WHERE product_id = _product_id
    AND showroom_id IS NOT DISTINCT FROM _showroom_id;

  IF NOT FOUND THEN
    INSERT INTO public.product_stock (product_id, showroom_id, quantity)
    VALUES (_product_id, _showroom_id, _qty);
  END IF;

  RETURN _ledger_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.commit_raw_stock_movement(
  _material_id uuid,
  _showroom_id uuid,
  _qty numeric,
  _kind text,
  _ref_type text DEFAULT NULL::text,
  _ref_id uuid DEFAULT NULL::uuid,
  _note text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _ledger_id uuid;
BEGIN
  INSERT INTO public.raw_stock_ledger (material_id, showroom_id, qty, kind, ref_type, ref_id, note)
  VALUES (_material_id, _showroom_id, _qty, _kind, _ref_type, _ref_id, _note)
  RETURNING id INTO _ledger_id;

  UPDATE public.raw_material_stock
  SET quantity = quantity + _qty,
      updated_at = now()
  WHERE material_id = _material_id
    AND showroom_id IS NOT DISTINCT FROM _showroom_id;

  IF NOT FOUND THEN
    INSERT INTO public.raw_material_stock (material_id, showroom_id, quantity)
    VALUES (_material_id, _showroom_id, _qty);
  END IF;

  RETURN _ledger_id;
END;
$function$;

-- ---------- atomic batch production RPC ----------
CREATE OR REPLACE FUNCTION public.commit_production_batch(
  _product_id uuid,
  _showroom_id uuid,
  _batch numeric,
  _ingredients jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _batch_id uuid;
  _ingredient jsonb;
  _material_id uuid;
  _qty_per_unit numeric;
  _required_qty numeric;
  _available_qty numeric;
  _shelf_life_days integer;
  _mfg_date date := current_date;
BEGIN
  IF _product_id IS NULL THEN
    RAISE EXCEPTION 'Product is required';
  END IF;

  IF _batch IS NULL OR _batch <= 0 THEN
    RAISE EXCEPTION 'Batch quantity must be greater than zero';
  END IF;

  IF _ingredients IS NULL OR jsonb_typeof(_ingredients) <> 'array' OR jsonb_array_length(_ingredients) = 0 THEN
    RAISE EXCEPTION 'At least one ingredient is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(_ingredients) AS item
    WHERE NULLIF(item->>'materialId', '') IS NULL
       OR COALESCE((item->>'qty')::numeric, 0) <= 0
  ) THEN
    RAISE EXCEPTION 'Each ingredient needs a material and quantity greater than zero';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(_ingredients) AS item
    GROUP BY item->>'materialId'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate ingredients are not allowed in one recipe';
  END IF;

  -- Lock and check every raw stock row before any ledger writes.
  FOR _ingredient IN SELECT * FROM jsonb_array_elements(_ingredients)
  LOOP
    _material_id := (_ingredient->>'materialId')::uuid;
    _qty_per_unit := (_ingredient->>'qty')::numeric;
    _required_qty := abs(_qty_per_unit * _batch);

    SELECT quantity
    INTO _available_qty
    FROM public.raw_material_stock
    WHERE material_id = _material_id
      AND showroom_id IS NOT DISTINCT FROM _showroom_id
    FOR UPDATE;

    IF COALESCE(_available_qty, 0) < _required_qty THEN
      RAISE EXCEPTION 'Insufficient raw materials for this batch';
    END IF;
  END LOOP;

  _batch_id := gen_random_uuid();

  FOR _ingredient IN SELECT * FROM jsonb_array_elements(_ingredients)
  LOOP
    _material_id := (_ingredient->>'materialId')::uuid;
    _qty_per_unit := (_ingredient->>'qty')::numeric;
    _required_qty := abs(_qty_per_unit * _batch);

    PERFORM public.commit_raw_stock_movement(
      _material_id,
      _showroom_id,
      -_required_qty,
      'production_consume',
      'production',
      _batch_id,
      NULL
    );
  END LOOP;

  PERFORM public.commit_stock_movement(
    _product_id,
    _showroom_id,
    _batch,
    'production',
    'production',
    _batch_id,
    NULL
  );

  SELECT shelf_life_days
  INTO _shelf_life_days
  FROM public.products
  WHERE id = _product_id;

  UPDATE public.products
  SET mfg_date = _mfg_date,
      expiry_date = CASE
        WHEN COALESCE(_shelf_life_days, 0) > 0 THEN _mfg_date + _shelf_life_days
        ELSE expiry_date
      END,
      updated_at = now()
  WHERE id = _product_id;

  RETURN _batch_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.commit_stock_movement(uuid, uuid, numeric, text, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_stock_movement(uuid, uuid, numeric, text, text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.commit_stock_movement(uuid, uuid, numeric, text, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commit_stock_movement(uuid, uuid, numeric, text, text, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.commit_raw_stock_movement(uuid, uuid, numeric, text, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_raw_stock_movement(uuid, uuid, numeric, text, text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.commit_raw_stock_movement(uuid, uuid, numeric, text, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commit_raw_stock_movement(uuid, uuid, numeric, text, text, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.commit_production_batch(uuid, uuid, numeric, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_production_batch(uuid, uuid, numeric, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.commit_production_batch(uuid, uuid, numeric, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commit_production_batch(uuid, uuid, numeric, jsonb) TO service_role;
