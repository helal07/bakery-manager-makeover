-- 09_showroom_settings.sql
-- Per-showroom settings override (invoice customization, future prefs).
-- Safe to re-run.

-- 1) Add a jsonb settings column on showrooms if not present
ALTER TABLE public.showrooms
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.showrooms.settings IS
  'Per-showroom overrides. Shape: { "invoice": { ...partial InvoiceSettings } }. Keys omitted here fall back to company_settings.settings.invoice.';

-- 2) Helper: merge company invoice settings with a showroom override.
--    Usage in app / RPC:
--      select public.get_effective_invoice_settings(<showroom_id>);
CREATE OR REPLACE FUNCTION public.get_effective_invoice_settings(_showroom_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(
      (SELECT settings->'invoice' FROM public.company_settings ORDER BY updated_at DESC NULLS LAST LIMIT 1),
      '{}'::jsonb
    )
    ||
    COALESCE(
      (SELECT settings->'invoice' FROM public.showrooms WHERE id = _showroom_id),
      '{}'::jsonb
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_effective_invoice_settings(uuid) TO authenticated, anon;

-- 3) No RLS change required: showrooms already has RLS; the new column
--    is read/written through the existing SELECT/UPDATE policies.
--    (Only users who can UPDATE a showroom row can change its overrides.)
