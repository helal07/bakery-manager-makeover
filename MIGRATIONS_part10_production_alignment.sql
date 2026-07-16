-- ============================================================
-- Part 10: Production workflow alignment
-- Apply on self-hosted Supabase after Parts 1–9.
-- Safe to re-run (idempotent).
-- ============================================================

-- 1) recipe_categories: color + is_active + unique(name)
ALTER TABLE public.recipe_categories
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='recipe_categories_name_key') THEN
    ALTER TABLE public.recipe_categories ADD CONSTRAINT recipe_categories_name_key UNIQUE (name);
  END IF;
END $$;

-- 2) wastage_log: notes / ref_ledger_id / logged_at
ALTER TABLE public.wastage_log
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS ref_ledger_id UUID,
  ADD COLUMN IF NOT EXISTS logged_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 3) work_orders.assigned_to as TEXT (staff name / free-form)
ALTER TABLE public.work_orders
  ALTER COLUMN assigned_to TYPE TEXT USING assigned_to::text;

-- 4) products.sku unique for idempotent seeding & upserts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_sku_key') THEN
    ALTER TABLE public.products ADD CONSTRAINT products_sku_key UNIQUE (sku);
  END IF;
END $$;
