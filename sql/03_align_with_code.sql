-- =============================================================
-- Muzahid Food — Align schema with current codebase
-- =============================================================
-- Safe to re-run. No data loss.
-- Run this ONCE on the self-hosted Supabase SQL Editor.
-- =============================================================

BEGIN;

-- 1) raw_materials: threshold -> min_stock (only if needed)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'raw_materials'
      AND column_name = 'threshold'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'raw_materials'
      AND column_name = 'min_stock'
  )
  THEN
    ALTER TABLE public.raw_materials RENAME COLUMN threshold TO min_stock;
  END IF;
END $$;

-- Ensure min_stock exists even on installs that never had `threshold`.
ALTER TABLE public.raw_materials
  ADD COLUMN IF NOT EXISTS min_stock numeric NOT NULL DEFAULT 0;

-- 2) customer_groups: add mode + selling_price_group_id
ALTER TABLE public.customer_groups
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'percentage';

ALTER TABLE public.customer_groups
  ADD COLUMN IF NOT EXISTS selling_price_group_id uuid;

-- Add FK only if not already present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customer_groups_selling_price_group_id_fkey'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'selling_price_groups'
  )
  THEN
    ALTER TABLE public.customer_groups
      ADD CONSTRAINT customer_groups_selling_price_group_id_fkey
      FOREIGN KEY (selling_price_group_id)
      REFERENCES public.selling_price_groups(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 3) Refresh PostgREST schema cache so the new columns are visible immediately.
NOTIFY pgrst, 'reload schema';

COMMIT;
