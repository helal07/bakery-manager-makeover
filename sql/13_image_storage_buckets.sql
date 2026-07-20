-- 13_image_storage_buckets.sql
-- Create the private storage buckets used for customer avatars, product images
-- and company logos, and open read/write access to signed-in users.
--
-- Safe to re-run.

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('customer-avatars', 'customer-avatars', false),
  ('product-images',   'product-images',   false),
  ('company-logos',    'company-logos',    false)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE b text;
BEGIN
  FOREACH b IN ARRAY ARRAY['customer-avatars','product-images','company-logos'] LOOP
    EXECUTE format($p$
      DROP POLICY IF EXISTS "auth read %1$s" ON storage.objects;
      CREATE POLICY "auth read %1$s" ON storage.objects FOR SELECT
        TO authenticated USING (bucket_id = %1$L);
      DROP POLICY IF EXISTS "auth insert %1$s" ON storage.objects;
      CREATE POLICY "auth insert %1$s" ON storage.objects FOR INSERT
        TO authenticated WITH CHECK (bucket_id = %1$L);
      DROP POLICY IF EXISTS "auth update %1$s" ON storage.objects;
      CREATE POLICY "auth update %1$s" ON storage.objects FOR UPDATE
        TO authenticated USING (bucket_id = %1$L) WITH CHECK (bucket_id = %1$L);
      DROP POLICY IF EXISTS "auth delete %1$s" ON storage.objects;
      CREATE POLICY "auth delete %1$s" ON storage.objects FOR DELETE
        TO authenticated USING (bucket_id = %1$L);
    $p$, b);
  END LOOP;
END $$;
