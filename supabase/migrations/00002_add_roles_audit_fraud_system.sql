
-- ==================== ตาราง roles ====================
CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT '#6B7280',
  is_system boolean NOT NULL DEFAULT false,
  permissions jsonb NOT NULL DEFAULT '{}',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roles_select_authenticated" ON roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "roles_insert_admin" ON roles FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "roles_update_admin" ON roles FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "roles_delete_admin" ON roles FOR DELETE TO authenticated USING (
  is_system = false AND
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ==================== เพิ่ม role_id ในตาราง profiles ====================
ALTER TABLE profiles ADD COLUMN role_id uuid REFERENCES roles(id) ON DELETE SET NULL;

-- ==================== ตาราง audit_logs ====================
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  username text,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  details jsonb DEFAULT '{}',
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_user_id_idx ON audit_logs(user_id);
CREATE INDEX audit_logs_action_idx ON audit_logs(action);
CREATE INDEX audit_logs_created_at_idx ON audit_logs(created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_select_admin" ON audit_logs FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "audit_logs_insert_authenticated" ON audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- ==================== ตาราง fraud_alerts ====================
CREATE TABLE fraud_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  username text,
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  description text NOT NULL,
  details jsonb DEFAULT '{}',
  is_reviewed boolean NOT NULL DEFAULT false,
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX fraud_alerts_user_id_idx ON fraud_alerts(user_id);
CREATE INDEX fraud_alerts_severity_idx ON fraud_alerts(severity);
CREATE INDEX fraud_alerts_created_at_idx ON fraud_alerts(created_at DESC);
CREATE INDEX fraud_alerts_is_reviewed_idx ON fraud_alerts(is_reviewed);

ALTER TABLE fraud_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fraud_alerts_select_admin" ON fraud_alerts FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "fraud_alerts_insert_authenticated" ON fraud_alerts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "fraud_alerts_update_admin" ON fraud_alerts FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ==================== ตาราง failed_logins ====================
CREATE TABLE failed_logins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX failed_logins_username_idx ON failed_logins(username);
CREATE INDEX failed_logins_created_at_idx ON failed_logins(created_at DESC);

ALTER TABLE failed_logins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "failed_logins_insert_any" ON failed_logins FOR INSERT WITH CHECK (true);
CREATE POLICY "failed_logins_select_admin" ON failed_logins FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ==================== Function: บันทึก audit log ====================
CREATE OR REPLACE FUNCTION log_audit(
  p_user_id uuid,
  p_username text,
  p_action text,
  p_entity_type text DEFAULT NULL,
  p_entity_id text DEFAULT NULL,
  p_details jsonb DEFAULT '{}',
  p_severity text DEFAULT 'info'
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, details, severity)
  VALUES (p_user_id, p_username, p_action, p_entity_type, p_entity_id, p_details, p_severity);
END;
$$;

-- ==================== Function: ตรวจจับพฤติกรรมน่าสงสัย (void) ====================
CREATE OR REPLACE FUNCTION check_void_fraud(p_user_id uuid, p_username text, p_max_voids int DEFAULT 5)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  void_count int;
BEGIN
  SELECT COUNT(*) INTO void_count
  FROM audit_logs
  WHERE user_id = p_user_id
    AND action = 'void_transaction'
    AND created_at >= now() - interval '1 day';

  IF void_count >= p_max_voids THEN
    INSERT INTO fraud_alerts (user_id, username, alert_type, severity, description, details)
    VALUES (
      p_user_id, p_username,
      'excessive_voids',
      'high',
      'พนักงาน ' || p_username || ' ยกเลิกรายการเกิน ' || p_max_voids || ' ครั้งใน 24 ชั่วโมง (ยกเลิกแล้ว ' || void_count || ' ครั้ง)',
      jsonb_build_object('void_count', void_count, 'threshold', p_max_voids, 'period', '24h')
    )
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- ==================== Function: ตรวจจับการแก้ไขสต็อกบ่อย ====================
CREATE OR REPLACE FUNCTION check_stock_fraud(p_user_id uuid, p_username text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  edit_count int;
  sale_count int;
BEGIN
  SELECT COUNT(*) INTO edit_count
  FROM audit_logs
  WHERE user_id = p_user_id
    AND action = 'adjust_stock'
    AND created_at >= now() - interval '1 day';

  SELECT COUNT(*) INTO sale_count
  FROM audit_logs
  WHERE user_id = p_user_id
    AND action = 'process_sale'
    AND created_at >= now() - interval '1 day';

  IF edit_count >= 5 AND (sale_count = 0 OR edit_count > sale_count * 2) THEN
    INSERT INTO fraud_alerts (user_id, username, alert_type, severity, description, details)
    VALUES (
      p_user_id, p_username,
      'suspicious_stock_edit',
      'medium',
      'พนักงาน ' || p_username || ' แก้ไขสต็อก ' || edit_count || ' ครั้งใน 24 ชั่วโมง (ขายได้เพียง ' || sale_count || ' รายการ)',
      jsonb_build_object('edit_count', edit_count, 'sale_count', sale_count)
    )
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- ==================== Function: ตรวจจับ brute force login ====================
CREATE OR REPLACE FUNCTION check_brute_force(p_username text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  fail_count int;
BEGIN
  SELECT COUNT(*) INTO fail_count
  FROM failed_logins
  WHERE username = p_username
    AND created_at >= now() - interval '1 hour';

  IF fail_count >= 5 THEN
    INSERT INTO fraud_alerts (user_id, username, alert_type, severity, description, details)
    SELECT
      p.id, p_username,
      'brute_force_login',
      'high',
      'มีการพยายาม login ผิดพลาด ' || fail_count || ' ครั้งในชั่วโมงที่ผ่านมาสำหรับ ' || p_username,
      jsonb_build_object('fail_count', fail_count, 'username', p_username)
    FROM profiles p
    WHERE p.username = p_username
    LIMIT 1
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- ==================== เปิด realtime สำหรับ fraud_alerts ====================
ALTER PUBLICATION supabase_realtime ADD TABLE fraud_alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE audit_logs;
