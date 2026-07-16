-- ============================================================
-- Part 13: Fix "no unique or exclusion constraint matching the
-- ON CONFLICT specification" on batch production approval.
--
-- Root cause on self-hosted:
--   The RPCs commit_stock_movement / commit_raw_stock_movement do:
--     ON CONFLICT (product_id, showroom_id) DO UPDATE ...
--     ON CONFLICT (material_id, showroom_id) DO UPDATE ...
--   PostgREST-style ON CONFLICT needs a plain unique constraint/index
--   on those exact columns. If the DB only has an EXPRESSION unique
--   index (e.g. UNIQUE(product_id, COALESCE(showroom_id, '000...')))
--   or the unique index is missing entirely, PostgreSQL raises
--   "no unique or exclusion constraint matching the ON CONFLICT
--   specification" and the batch approval fails.
--
--   Also: default PG treats NULLs as distinct, so an old-style
--   UNIQUE(product_id, showroom_id) still lets duplicate rows exist
--   when showroom_id IS NULL (factory-level stock). NULLS NOT
--   DISTINCT (PG15+) fixes that so ON CONFLICT resolves even when
--   showroom_id is NULL.
--
-- Safe to run multiple times.
-- Requires PostgreSQL 15+.
-- ============================================================

-- ---------- product_stock ----------
-- Drop any legacy expression-based or misnamed unique indexes/constraints
DROP INDEX IF EXISTS public.product_stock_uniq;
ALTER TABLE public.product_stock
  DROP CONSTRAINT IF EXISTS product_stock_product_id_showroom_id_key;
DROP INDEX IF EXISTS public.product_stock_product_id_showroom_id_key;
DROP INDEX IF EXISTS public.product_stock_product_showroom_uniq;

-- Recreate as a plain unique index with NULLS NOT DISTINCT so
-- (product_id, NULL) rows still de-duplicate for factory stock.
CREATE UNIQUE INDEX product_stock_product_showroom_uniq
  ON public.product_stock (product_id, showroom_id) NULLS NOT DISTINCT;

-- ---------- raw_material_stock ----------
DROP INDEX IF EXISTS public.raw_material_stock_uniq;
ALTER TABLE public.raw_material_stock
  DROP CONSTRAINT IF EXISTS raw_material_stock_material_id_showroom_id_key;
DROP INDEX IF EXISTS public.raw_material_stock_material_id_showroom_id_key;
DROP INDEX IF EXISTS public.raw_material_stock_material_showroom_uniq;

CREATE UNIQUE INDEX raw_material_stock_material_showroom_uniq
  ON public.raw_material_stock (material_id, showroom_id) NULLS NOT DISTINCT;
