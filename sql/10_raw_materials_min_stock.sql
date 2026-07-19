-- Align raw_materials with production schema and app code.
-- Renames legacy "threshold" column to "min_stock" (idempotent).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'raw_materials'
      AND column_name = 'threshold'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'raw_materials'
      AND column_name = 'min_stock'
  ) THEN
    ALTER TABLE public.raw_materials RENAME COLUMN threshold TO min_stock;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'raw_materials'
      AND column_name = 'min_stock'
  ) THEN
    ALTER TABLE public.raw_materials ADD COLUMN min_stock numeric NOT NULL DEFAULT 0;
  END IF;
END $$;
