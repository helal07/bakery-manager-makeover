-- =============================================================
-- Align transfers table with current codebase
-- Renames from_showroom_id → source_showroom_id, to_showroom_id → dest_showroom_id
-- Adds sent_at, received_at, kind columns; sets status default to 'draft'
-- Safe to run multiple times (idempotent).
-- =============================================================

BEGIN;

SET search_path TO public;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='transfers' AND column_name='from_showroom_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='transfers' AND column_name='source_showroom_id'
  ) THEN
    ALTER TABLE public.transfers RENAME COLUMN from_showroom_id TO source_showroom_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='transfers' AND column_name='to_showroom_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='transfers' AND column_name='dest_showroom_id'
  ) THEN
    ALTER TABLE public.transfers RENAME COLUMN to_showroom_id TO dest_showroom_id;
  END IF;
END $$;

ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS source_showroom_id uuid;
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS dest_showroom_id uuid;
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS sent_at timestamp with time zone;
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS received_at timestamp with time zone;
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE public.transfers ALTER COLUMN status SET DEFAULT 'draft';

NOTIFY pgrst, 'reload schema';

COMMIT;
