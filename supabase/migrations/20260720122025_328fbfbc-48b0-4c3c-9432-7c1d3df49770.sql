-- Storage RLS for image buckets: authenticated users can read/write.
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