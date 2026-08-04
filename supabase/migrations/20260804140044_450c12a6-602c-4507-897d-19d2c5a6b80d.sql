DROP VIEW IF EXISTS public.company_branding_public;

REVOKE ALL ON public.company_settings FROM anon;
GRANT SELECT (name, tagline, logo_url, address, footer_note, currency, is_current, updated_at)
  ON public.company_settings TO anon;

DROP POLICY IF EXISTS company_settings_public_branding ON public.company_settings;
CREATE POLICY company_settings_public_branding ON public.company_settings FOR SELECT TO anon
USING (is_current = true);