DROP POLICY IF EXISTS "Admins upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Admins update logos" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete logos" ON storage.objects;

CREATE POLICY "Users upload logos for active license"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'logos'
  AND name LIKE ('license-' || public.current_license_id()::text || '/%')
);

CREATE POLICY "Users update logos for active license"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'logos'
  AND name LIKE ('license-' || public.current_license_id()::text || '/%')
)
WITH CHECK (
  bucket_id = 'logos'
  AND name LIKE ('license-' || public.current_license_id()::text || '/%')
);

CREATE POLICY "Users delete logos for active license"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'logos'
  AND name LIKE ('license-' || public.current_license_id()::text || '/%')
);