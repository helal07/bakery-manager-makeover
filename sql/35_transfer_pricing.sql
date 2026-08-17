-- =====================================================================
-- 35. Factory → showroom supply pricing (idempotent, additive)
--   * products.transfer_price : default supply price per product
--   * transfer_items.unit_price : price actually used on a transfer line
-- Stock movements / RPCs are untouched — this is reporting metadata only.
-- =====================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS transfer_price numeric NOT NULL DEFAULT 0;

ALTER TABLE public.transfer_items
  ADD COLUMN IF NOT EXISTS unit_price numeric;

-- Backfill historical lines so past reports are not blank.
UPDATE public.transfer_items ti
SET unit_price = COALESCE(NULLIF(p.transfer_price, 0), p.cost, 0)
FROM public.products p
WHERE ti.product_id = p.id AND ti.unit_price IS NULL;

NOTIFY pgrst, 'reload schema';
