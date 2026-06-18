
-- 1. Add warning_status to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS warning_status text NOT NULL DEFAULT 'normal'
    CHECK (warning_status IN ('normal', 'yellow_card', 'red_card'));

-- 2. warning_records table
CREATE TABLE warning_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  issued_by uuid NOT NULL REFERENCES profiles(id),
  warning_type text NOT NULL CHECK (warning_type IN ('yellow_card', 'red_card')),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE warning_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read warning_records"
  ON warning_records FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin manage warning_records"
  ON warning_records FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin')
    )
  );

-- 3. Add Telegram fields + max_void_per_day to store_settings
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS telegram_bot_token text,
  ADD COLUMN IF NOT EXISTS telegram_chat_id text,
  ADD COLUMN IF NOT EXISTS max_void_per_day integer NOT NULL DEFAULT 5;

-- 4. system_settings table (for super_admin)
CREATE TABLE system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read system_settings"
  ON system_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admin write system_settings"
  ON system_settings FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

-- Insert default system settings
INSERT INTO system_settings (key, value, description) VALUES
  ('app_name', 'ระบบขายหน้าร้าน POS', 'ชื่อแอปพลิเคชัน'),
  ('app_version', '3.0', 'เวอร์ชันระบบ'),
  ('max_void_per_day', '5', 'จำนวนการยกเลิกบิลสูงสุดต่อวัน'),
  ('max_failed_login', '5', 'จำนวนครั้ง login ผิดพลาดสูงสุด'),
  ('session_timeout_hours', '8', 'ระยะเวลา session (ชั่วโมง)'),
  ('telegram_alert_enabled', 'true', 'เปิดใช้การแจ้งเตือน Telegram'),
  ('fraud_alert_threshold', '3', 'จำนวนครั้ง void ก่อนสร้าง fraud alert');
