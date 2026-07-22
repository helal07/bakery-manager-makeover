-- ============================================================================
-- Part 14 — Production Overheads (Gas, Electricity, Labor, Packaging, etc.)
-- ============================================================================
-- Self-hosted Supabase Studio → SQL Editor → paste → Run
-- ============================================================================

BEGIN;

-- 1) Overhead categories (production-specific, separate from expense_categories)
CREATE TABLE IF NOT EXISTS public.production_overhead_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_overhead_categories TO authenticated;
GRANT ALL ON public.production_overhead_categories TO service_role;

ALTER TABLE public.production_overhead_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "overhead_categories_all" ON public.production_overhead_categories;
CREATE POLICY "overhead_categories_all"
  ON public.production_overhead_categories
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 2) Recipe-level default overheads (per_unit or per_batch)
CREATE TABLE IF NOT EXISTS public.recipe_overheads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  category_id  uuid NOT NULL REFERENCES public.production_overhead_categories(id) ON DELETE RESTRICT,
  amount       numeric(14,4) NOT NULL DEFAULT 0,
  mode         text NOT NULL DEFAULT 'per_unit' CHECK (mode IN ('per_unit','per_batch')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, category_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipe_overheads TO authenticated;
GRANT ALL ON public.recipe_overheads TO service_role;

ALTER TABLE public.recipe_overheads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recipe_overheads_all" ON public.recipe_overheads;
CREATE POLICY "recipe_overheads_all"
  ON public.recipe_overheads
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS recipe_overheads_product_idx
  ON public.recipe_overheads (product_id);

-- 3) Batch overhead entries (actual overheads logged per production batch)
CREATE TABLE IF NOT EXISTS public.production_overheads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id     uuid NOT NULL,
  product_id   uuid REFERENCES public.products(id) ON DELETE SET NULL,
  category_id  uuid NOT NULL REFERENCES public.production_overhead_categories(id) ON DELETE RESTRICT,
  amount       numeric(14,4) NOT NULL DEFAULT 0,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_overheads TO authenticated;
GRANT ALL ON public.production_overheads TO service_role;

ALTER TABLE public.production_overheads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "production_overheads_all" ON public.production_overheads;
CREATE POLICY "production_overheads_all"
  ON public.production_overheads
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS production_overheads_batch_idx
  ON public.production_overheads (batch_id);
CREATE INDEX IF NOT EXISTS production_overheads_created_idx
  ON public.production_overheads (created_at DESC);

-- 4) updated_at triggers
DROP TRIGGER IF EXISTS trg_overhead_cat_updated ON public.production_overhead_categories;
CREATE TRIGGER trg_overhead_cat_updated
  BEFORE UPDATE ON public.production_overhead_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_recipe_overheads_updated ON public.recipe_overheads;
CREATE TRIGGER trg_recipe_overheads_updated
  BEFORE UPDATE ON public.recipe_overheads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Extend commit_production_batch RPC to accept overheads
CREATE OR REPLACE FUNCTION public.commit_production_batch(
  _product_id  uuid,
  _showroom_id uuid,
  _batch       numeric,
  _ingredients jsonb,
  _overheads   jsonb DEFAULT '[]'::jsonb
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
  _material_id uuid;
  _qty_per_unit numeric;
  _required_qty numeric;
  _available_qty numeric;
  _shelf_life_days integer;
  _mfg_date date := current_date;
BEGIN
  IF _product_id IS NULL THEN RAISE EXCEPTION 'Product is required'; END IF;
  IF _batch IS NULL OR _batch <= 0 THEN RAISE EXCEPTION 'Batch quantity must be greater than zero'; END IF;
  IF _ingredients IS NULL OR jsonb_typeof(_ingredients) <> 'array' OR jsonb_array_length(_ingredients) = 0 THEN
    RAISE EXCEPTION 'At least one ingredient is required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_ingredients) AS item
    WHERE NULLIF(item->>'materialId','') IS NULL OR COALESCE((item->>'qty')::numeric,0) <= 0
  ) THEN
    RAISE EXCEPTION 'Each ingredient needs a material and quantity greater than zero';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_ingredients) AS item
    GROUP BY item->>'materialId' HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate ingredients are not allowed in one recipe';
  END IF;

  FOR _ingredient IN SELECT * FROM jsonb_array_elements(_ingredients) LOOP
    _material_id := (_ingredient->>'materialId')::uuid;
    _qty_per_unit := (_ingredient->>'qty')::numeric;
    _required_qty := abs(_qty_per_unit * _batch);
    SELECT quantity INTO _available_qty
      FROM public.raw_material_stock
     WHERE material_id = _material_id AND showroom_id IS NOT DISTINCT FROM _showroom_id
     FOR UPDATE;
    IF COALESCE(_available_qty,0) < _required_qty THEN
      RAISE EXCEPTION 'Insufficient raw materials for this batch';
    END IF;
  END LOOP;

  _batch_id := gen_random_uuid();

  FOR _ingredient IN SELECT * FROM jsonb_array_elements(_ingredients) LOOP
    _material_id := (_ingredient->>'materialId')::uuid;
    _qty_per_unit := (_ingredient->>'qty')::numeric;
    _required_qty := abs(_qty_per_unit * _batch);
    PERFORM public.commit_raw_stock_movement(
      _material_id, _showroom_id, -_required_qty,
      'production_consume', 'production', _batch_id, NULL
    );
  END LOOP;

  PERFORM public.commit_stock_movement(
    _product_id, _showroom_id, _batch, 'production', 'production', _batch_id, NULL
  );

  IF _overheads IS NOT NULL AND jsonb_typeof(_overheads) = 'array' THEN
    FOR _overhead IN SELECT * FROM jsonb_array_elements(_overheads) LOOP
      IF NULLIF(_overhead->>'categoryId','') IS NOT NULL
         AND COALESCE((_overhead->>'amount')::numeric,0) > 0 THEN
        INSERT INTO public.production_overheads (batch_id, product_id, category_id, amount, note)
        VALUES (
          _batch_id, _product_id,
          (_overhead->>'categoryId')::uuid,
          (_overhead->>'amount')::numeric,
          NULLIF(_overhead->>'note','')
        );
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

-- 6) Seed default categories
INSERT INTO public.production_overhead_categories (name) VALUES
  ('Gas'), ('Electricity'), ('Labor'), ('Packaging'), ('Maintenance')
ON CONFLICT (name) DO NOTHING;

COMMIT;

-- ============================================================================
-- Done. Refresh PostgREST schema cache:
--   NOTIFY pgrst, 'reload schema';
-- অথবা Supabase Studio → Settings → API → Reload schema
-- ============================================================================
