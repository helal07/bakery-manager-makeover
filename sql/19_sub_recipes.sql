-- ============================================================
-- Patch 19: Sub-Recipe (Intermediate Product) support
--
-- Enables master mixes (e.g. "বেসিক খামির") that final products can
-- reference as an ingredient. Production auto-expands the sub-recipe to
-- raw materials and deducts stock accordingly.
--
-- Idempotent: safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sub_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  yield_qty numeric NOT NULL CHECK (yield_qty > 0),
  yield_unit text NOT NULL DEFAULT 'kg',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sub_recipe_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_recipe_id uuid NOT NULL REFERENCES public.sub_recipes(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.raw_materials(id) ON DELETE RESTRICT,
  qty numeric NOT NULL CHECK (qty > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sub_recipe_id, material_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sub_recipes TO authenticated;
GRANT ALL ON public.sub_recipes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sub_recipe_items TO authenticated;
GRANT ALL ON public.sub_recipe_items TO service_role;

ALTER TABLE public.sub_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_recipe_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sub_recipes_all ON public.sub_recipes;
CREATE POLICY sub_recipes_all ON public.sub_recipes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS sub_recipe_items_all ON public.sub_recipe_items;
CREATE POLICY sub_recipe_items_all ON public.sub_recipe_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_sub_recipes_updated_at ON public.sub_recipes;
CREATE TRIGGER trg_sub_recipes_updated_at BEFORE UPDATE ON public.sub_recipes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_sub_recipe_items_updated_at ON public.sub_recipe_items;
CREATE TRIGGER trg_sub_recipe_items_updated_at BEFORE UPDATE ON public.sub_recipe_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- recipes table: add sub_recipe_id ----------
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS sub_recipe_id uuid REFERENCES public.sub_recipes(id) ON DELETE RESTRICT;

ALTER TABLE public.recipes ALTER COLUMN material_id DROP NOT NULL;

ALTER TABLE public.recipes DROP CONSTRAINT IF EXISTS recipes_source_check;
ALTER TABLE public.recipes ADD CONSTRAINT recipes_source_check
  CHECK ((material_id IS NOT NULL)::int + (sub_recipe_id IS NOT NULL)::int = 1);

CREATE UNIQUE INDEX IF NOT EXISTS recipes_product_material_uniq
  ON public.recipes (product_id, material_id) WHERE material_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS recipes_product_subrecipe_uniq
  ON public.recipes (product_id, sub_recipe_id) WHERE sub_recipe_id IS NOT NULL;

-- ---------- Updated commit_production_batch (sub-recipe aware) ----------
CREATE OR REPLACE FUNCTION public.commit_production_batch(
  _product_id uuid,
  _showroom_id uuid,
  _batch numeric,
  _ingredients jsonb,
  _overheads jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _batch_id uuid;
  _ingredient jsonb;
  _overhead jsonb;
  _sub_item record;
  _material_id uuid;
  _sub_recipe_id uuid;
  _qty_per_unit numeric;
  _yield_qty numeric;
  _ratio numeric;
  _required_qty numeric;
  _available_qty numeric;
  _shelf_life_days integer;
  _mfg_date date := current_date;
  _totals jsonb := '{}'::jsonb;
  _mid text;
BEGIN
  IF _product_id IS NULL THEN RAISE EXCEPTION 'Product is required'; END IF;
  IF _batch IS NULL OR _batch <= 0 THEN RAISE EXCEPTION 'Batch quantity must be greater than zero'; END IF;
  IF _ingredients IS NULL OR jsonb_typeof(_ingredients) <> 'array' OR jsonb_array_length(_ingredients) = 0 THEN
    RAISE EXCEPTION 'At least one ingredient is required';
  END IF;

  FOR _ingredient IN SELECT * FROM jsonb_array_elements(_ingredients) LOOP
    _material_id := NULLIF(_ingredient->>'materialId','')::uuid;
    _sub_recipe_id := NULLIF(_ingredient->>'subRecipeId','')::uuid;
    _qty_per_unit := COALESCE((_ingredient->>'qty')::numeric, 0);

    IF _qty_per_unit <= 0 THEN
      RAISE EXCEPTION 'Ingredient quantity must be greater than zero';
    END IF;
    IF _material_id IS NOT NULL AND _sub_recipe_id IS NOT NULL THEN
      RAISE EXCEPTION 'Ingredient can only reference either material or sub-recipe';
    END IF;

    IF _material_id IS NOT NULL THEN
      _required_qty := _qty_per_unit * _batch;
      _mid := _material_id::text;
      _totals := jsonb_set(_totals, ARRAY[_mid],
        to_jsonb(COALESCE((_totals->>_mid)::numeric, 0) + _required_qty));
    ELSIF _sub_recipe_id IS NOT NULL THEN
      SELECT yield_qty INTO _yield_qty FROM public.sub_recipes WHERE id = _sub_recipe_id AND is_active = true;
      IF _yield_qty IS NULL THEN RAISE EXCEPTION 'Sub-recipe not found or inactive'; END IF;
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

  FOR _mid, _required_qty IN
    SELECT key, value::numeric FROM jsonb_each_text(_totals)
  LOOP
    SELECT quantity INTO _available_qty
      FROM public.raw_material_stock
     WHERE material_id = _mid::uuid AND showroom_id IS NOT DISTINCT FROM _showroom_id
     FOR UPDATE;
    IF COALESCE(_available_qty, 0) < _required_qty THEN
      RAISE EXCEPTION 'Insufficient raw materials for this batch';
    END IF;
  END LOOP;

  _batch_id := gen_random_uuid();

  FOR _mid, _required_qty IN
    SELECT key, value::numeric FROM jsonb_each_text(_totals)
  LOOP
    PERFORM public.commit_raw_stock_movement(
      _mid::uuid, _showroom_id, -_required_qty,
      'production_consume', 'production', _batch_id, NULL
    );
  END LOOP;

  PERFORM public.commit_stock_movement(
    _product_id, _showroom_id, _batch, 'production', 'production', _batch_id, NULL
  );

  IF _overheads IS NOT NULL AND jsonb_typeof(_overheads) = 'array' THEN
    FOR _overhead IN SELECT * FROM jsonb_array_elements(_overheads) LOOP
      IF NULLIF(_overhead->>'categoryId','') IS NOT NULL
         AND COALESCE((_overhead->>'amount')::numeric, 0) > 0 THEN
        INSERT INTO public.production_overheads (batch_id, product_id, category_id, amount, note)
        VALUES (_batch_id, _product_id, (_overhead->>'categoryId')::uuid,
                (_overhead->>'amount')::numeric, NULLIF(_overhead->>'note',''));
      END IF;
    END LOOP;
  END IF;

  SELECT shelf_life_days INTO _shelf_life_days FROM public.products WHERE id = _product_id;
  UPDATE public.products
     SET mfg_date = _mfg_date,
         expiry_date = CASE WHEN COALESCE(_shelf_life_days,0) > 0
                            THEN _mfg_date + _shelf_life_days ELSE expiry_date END,
         updated_at = now()
   WHERE id = _product_id;

  RETURN _batch_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.commit_production_batch(uuid, uuid, numeric, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commit_production_batch(uuid, uuid, numeric, jsonb, jsonb) TO service_role;
