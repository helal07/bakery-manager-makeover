ALTER TABLE public.customer_groups
  ADD COLUMN IF NOT EXISTS pricing_mode text NOT NULL DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS selling_price_group_id uuid NULL REFERENCES public.selling_price_groups(id) ON DELETE SET NULL;

ALTER TABLE public.customer_groups
  DROP CONSTRAINT IF EXISTS customer_groups_pricing_mode_check;

ALTER TABLE public.customer_groups
  ADD CONSTRAINT customer_groups_pricing_mode_check
  CHECK (pricing_mode IN ('percentage', 'price_group'));

UPDATE public.customer_groups
SET pricing_mode = 'percentage'
WHERE pricing_mode IS NULL;

NOTIFY pgrst, 'reload schema';