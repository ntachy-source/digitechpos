DROP POLICY IF EXISTS "Public read logos" ON storage.objects;

CREATE POLICY "Public read invoice logos by path"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'logos'
  AND name LIKE 'license-%'
);