SET search_path TO public;

-- Units: old DB had short_name; current code expects code + is_active.
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS code text;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='units' AND column_name='short_name') THEN
    UPDATE public.units SET code = COALESCE(NULLIF(code,''), NULLIF(short_name,''), NULLIF(name,''), id::text) WHERE code IS NULL OR code='';
  ELSE
    UPDATE public.units SET code = COALESCE(NULLIF(code,''), NULLIF(name,''), id::text) WHERE code IS NULL OR code='';
  END IF;
END $$;
ALTER TABLE public.units ALTER COLUMN code SET NOT NULL;
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='units_code_key' AND conrelid='public.units'::regclass) THEN
    ALTER TABLE public.units ADD CONSTRAINT units_code_key UNIQUE (code);
  END IF;
END $$;

-- Raw materials
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='raw_materials' AND column_name='threshold')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='raw_materials' AND column_name='min_stock') THEN
    ALTER TABLE public.raw_materials RENAME COLUMN threshold TO min_stock;
  END IF;
END $$;
ALTER TABLE public.raw_materials ADD COLUMN IF NOT EXISTS min_stock numeric DEFAULT 0 NOT NULL;
ALTER TABLE public.raw_materials ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL;

-- Customer groups
ALTER TABLE public.customer_groups ADD COLUMN IF NOT EXISTS pricing_mode text DEFAULT 'percentage' NOT NULL;
ALTER TABLE public.customer_groups ADD COLUMN IF NOT EXISTS selling_price_group_id uuid;

-- Product selling prices
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='product_selling_prices' AND column_name='price_group_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='product_selling_prices' AND column_name='selling_price_group_id') THEN
    ALTER TABLE public.product_selling_prices RENAME COLUMN price_group_id TO selling_price_group_id;
  END IF;
END $$;
ALTER TABLE public.product_selling_prices ADD COLUMN IF NOT EXISTS selling_price_group_id uuid;
ALTER TABLE public.product_selling_prices DROP CONSTRAINT IF EXISTS product_selling_prices_product_id_price_group_id_key;
ALTER TABLE public.product_selling_prices DROP CONSTRAINT IF EXISTS product_selling_prices_product_id_selling_price_group_id_key;
ALTER TABLE public.product_selling_prices ADD CONSTRAINT product_selling_prices_product_id_selling_price_group_id_key UNIQUE (product_id, selling_price_group_id);

-- Category soft-delete flags
ALTER TABLE public.expense_categories ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL;
ALTER TABLE public.purchase_categories ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL;

-- Payment/return audit fields
ALTER TABLE public.customer_payments ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.supplier_payments ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.sale_returns ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE public.sale_returns ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.purchase_returns ADD COLUMN IF NOT EXISTS invoice_ref text;
ALTER TABLE public.purchase_returns ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE public.purchase_returns ADD COLUMN IF NOT EXISTS created_by uuid;

-- Transfers
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfers' AND column_name='from_showroom_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfers' AND column_name='source_showroom_id') THEN
    ALTER TABLE public.transfers RENAME COLUMN from_showroom_id TO source_showroom_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfers' AND column_name='to_showroom_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='transfers' AND column_name='dest_showroom_id') THEN
    ALTER TABLE public.transfers RENAME COLUMN to_showroom_id TO dest_showroom_id;
  END IF;
END $$;
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS source_showroom_id uuid;
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS dest_showroom_id uuid;
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS sent_at timestamp with time zone;
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS received_at timestamp with time zone;
ALTER TABLE public.transfers ALTER COLUMN status SET DEFAULT 'draft';

-- User profile settings
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS language text;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS timezone text;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS software jsonb DEFAULT '{}'::jsonb NOT NULL;

NOTIFY pgrst, 'reload schema';