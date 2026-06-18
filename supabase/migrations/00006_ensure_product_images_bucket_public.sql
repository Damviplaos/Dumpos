
-- Ensure product-images bucket is public
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880;

-- RLS: allow authenticated users to upload
DROP POLICY IF EXISTS "product_images_insert" ON storage.objects;
DROP POLICY IF EXISTS "product_images_select" ON storage.objects;
DROP POLICY IF EXISTS "product_images_update" ON storage.objects;
DROP POLICY IF EXISTS "product_images_delete" ON storage.objects;

CREATE POLICY "product_images_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'product-images');

CREATE POLICY "product_images_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'product-images' AND auth.role() = 'authenticated');

CREATE POLICY "product_images_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'product-images' AND auth.role() = 'authenticated');

CREATE POLICY "product_images_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'product-images' AND auth.role() = 'authenticated');
