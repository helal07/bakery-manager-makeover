
-- Public read access for landing_content (needed for signed-out landing page).
GRANT SELECT ON public.landing_content TO anon;

DROP POLICY IF EXISTS "public read landing content" ON public.landing_content;
CREATE POLICY "public read landing content"
  ON public.landing_content
  FOR SELECT
  TO anon
  USING (is_current = true);

NOTIFY pgrst, 'reload schema';
