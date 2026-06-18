
-- Fix check_void_fraud: add p_store_id so fraud alerts are visible to the store
CREATE OR REPLACE FUNCTION check_void_fraud(
  p_user_id uuid,
  p_username text,
  p_max_voids int,
  p_store_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  void_count int;
BEGIN
  SELECT COUNT(*) INTO void_count
  FROM audit_logs
  WHERE user_id = p_user_id
    AND action IN ('void_transaction', 'admin_void_completed_bill')
    AND created_at >= now() - interval '1 day';

  IF void_count >= p_max_voids THEN
    INSERT INTO fraud_alerts (user_id, username, alert_type, severity, description, details, store_id)
    VALUES (
      p_user_id, p_username,
      'excessive_voids',
      'high',
      'พนักงาน ' || p_username || ' ยกเลิกรายการเกิน ' || p_max_voids || ' ครั้งใน 24 ชั่วโมง (ยกเลิกแล้ว ' || void_count || ' ครั้ง)',
      jsonb_build_object('void_count', void_count, 'threshold', p_max_voids, 'period', '24h'),
      p_store_id
    );
  END IF;
END;
$$;

-- Fix check_stock_fraud: add p_store_id
CREATE OR REPLACE FUNCTION check_stock_fraud(
  p_user_id uuid,
  p_username text,
  p_store_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
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
    INSERT INTO fraud_alerts (user_id, username, alert_type, severity, description, details, store_id)
    VALUES (
      p_user_id, p_username,
      'suspicious_stock_edit',
      'medium',
      'พนักงาน ' || p_username || ' แก้ไขสต็อก ' || edit_count || ' ครั้งใน 24 ชั่วโมง (ขายได้เพียง ' || sale_count || ' รายการ)',
      jsonb_build_object('edit_count', edit_count, 'sale_count', sale_count),
      p_store_id
    );
  END IF;
END;
$$;
