-- Fix: PostgREST upsert on product_stock fails with
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- because the existing unique index is on an EXPRESSION
-- (product_id, COALESCE(showroom_id, '000...')) not on the raw columns.
-- PostgREST's onConflict="product_id,showroom_id" needs a real unique
-- constraint/index on those exact columns. In PG15+ we can use
-- NULLS NOT DISTINCT so NULL showroom_id (factory) still de-duplicates.

DROP INDEX IF EXISTS public.product_stock_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS product_stock_product_showroom_uniq
  ON public.product_stock (product_id, showroom_id) NULLS NOT DISTINCT;
