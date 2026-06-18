
-- ============ attendance_logs table ============
CREATE TABLE attendance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  username text NOT NULL,
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  clock_in_at timestamptz NOT NULL DEFAULT now(),
  clock_out_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store members can view own store attendance"
  ON attendance_logs FOR SELECT
  TO authenticated
  USING (
    store_id IN (
      SELECT store_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "users can insert own attendance"
  ON attendance_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users can update own attendance"
  ON attendance_logs FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "service role full access attendance"
  ON attendance_logs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============ logo_url on store_settings ============
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS logo_url text DEFAULT NULL;

-- ============ logos storage bucket ============
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logos',
  'logos',
  true,
  2097152,
  ARRAY['image/png','image/jpeg','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "anyone can view logos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'logos');

CREATE POLICY "authenticated can upload logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'logos');

CREATE POLICY "authenticated can update logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'logos');

CREATE POLICY "authenticated can delete logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'logos');
