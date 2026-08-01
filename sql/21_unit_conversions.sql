-- ============================================================
-- Patch 21: Unit conversions (Ultimate POS style)
-- Purely ADDITIVE — no existing row/value is modified.
-- Existing units keep base_unit_id = NULL => they are base units
-- with factor 1, so all current quantities/ratios stay identical.
-- Safe to re-run (idempotent).
-- ============================================================

ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS base_unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conversion_factor numeric,
  ADD COLUMN IF NOT EXISTS allow_decimal boolean NOT NULL DEFAULT true;

-- A sub-unit must have a positive factor; base units keep NULL.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'units_conversion_factor_chk'
  ) THEN
    ALTER TABLE public.units
      ADD CONSTRAINT units_conversion_factor_chk
      CHECK (
        (base_unit_id IS NULL)
        OR (conversion_factor IS NOT NULL AND conversion_factor > 0)
      );
  END IF;
END $$;

-- A unit cannot be its own base.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'units_base_not_self_chk'
  ) THEN
    ALTER TABLE public.units
      ADD CONSTRAINT units_base_not_self_chk
      CHECK (base_unit_id IS NULL OR base_unit_id <> id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS units_base_unit_id_idx ON public.units(base_unit_id);

-- Grants already exist for public.units; re-assert to be safe.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units TO authenticated;
GRANT ALL ON public.units TO service_role;
