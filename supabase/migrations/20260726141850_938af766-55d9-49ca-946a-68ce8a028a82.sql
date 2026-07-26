DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.company_settings'::regclass
      AND polname = 'company_settings_public_branding'
  ) THEN
    CREATE POLICY company_settings_public_branding
      ON public.company_settings
      FOR SELECT
      TO anon
      USING (true);
  END IF;
END $$;
GRANT SELECT ON public.company_settings TO anon;