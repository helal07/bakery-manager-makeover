DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='product_selling_prices' AND column_name='price_group_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='product_selling_prices' AND column_name='selling_price_group_id'
  ) THEN
    ALTER TABLE public.product_selling_prices RENAME COLUMN price_group_id TO selling_price_group_id;
  END IF;
END $$;

ALTER TABLE public.product_selling_prices
  ADD COLUMN IF NOT EXISTS selling_price_group_id uuid;

ALTER TABLE public.product_selling_prices
  DROP CONSTRAINT IF EXISTS product_selling_prices_product_id_price_group_id_key;
ALTER TABLE public.product_selling_prices
  DROP CONSTRAINT IF EXISTS product_selling_prices_product_id_selling_price_group_id_key;
ALTER TABLE public.product_selling_prices
  ADD CONSTRAINT product_selling_prices_product_id_selling_price_group_id_key
  UNIQUE (product_id, selling_price_group_id);

NOTIFY pgrst, 'reload schema';