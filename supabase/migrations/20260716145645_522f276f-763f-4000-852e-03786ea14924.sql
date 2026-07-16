
-- Align schema with production app code
ALTER TABLE public.recipe_categories
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- recipe_categories unique name for ON CONFLICT
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='recipe_categories_name_key') THEN
    ALTER TABLE public.recipe_categories ADD CONSTRAINT recipe_categories_name_key UNIQUE (name);
  END IF;
END $$;

-- wastage_log expected columns
ALTER TABLE public.wastage_log
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS ref_ledger_id UUID,
  ADD COLUMN IF NOT EXISTS logged_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- work_orders assigned_to as text (staff name or id)
ALTER TABLE public.work_orders
  ALTER COLUMN assigned_to TYPE TEXT USING assigned_to::text;

-- products unique sku for seed idempotency
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_sku_key') THEN
    ALTER TABLE public.products ADD CONSTRAINT products_sku_key UNIQUE (sku);
  END IF;
END $$;
