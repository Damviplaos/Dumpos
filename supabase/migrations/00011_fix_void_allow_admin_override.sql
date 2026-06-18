
-- 1. Update trigger: allow admin/store_owner to change completed transaction status
CREATE OR REPLACE FUNCTION prevent_completed_tamper()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'completed' AND NEW.status <> OLD.status THEN
    -- admin/store_owner/super_admin are allowed to void completed bills
    IF is_store_owner_or_super() THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'COMPLETED_BILL_TAMPER: ไม่สามารถแก้ไขบิลที่ชำระเงินแล้วได้ (บิล %)', OLD.order_number;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Update void_transaction_safe: allow admin/store_owner to void completed bills
CREATE OR REPLACE FUNCTION void_transaction_safe(
  p_transaction_id uuid,
  p_reason text,
  p_user_id uuid,
  p_username text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_status text;
  v_order_number text;
  v_is_admin boolean;
BEGIN
  SELECT status, order_number INTO v_status, v_order_number
  FROM transactions
  WHERE id = p_transaction_id;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ไม่พบรายการ');
  END IF;

  IF v_status = 'voided' THEN
    RETURN jsonb_build_object('success', false, 'error', 'รายการนี้ถูกยกเลิกไปแล้ว');
  END IF;

  -- Check if caller is admin/store_owner/super_admin
  SELECT EXISTS(
    SELECT 1 FROM profiles
    WHERE id = p_user_id AND role IN ('super_admin','store_owner','admin')
  ) INTO v_is_admin;

  -- Completed bill: block cashiers, allow admin with audit log
  IF v_status = 'completed' AND NOT v_is_admin THEN
    -- Log tamper attempt
    INSERT INTO audit_logs (user_id, username, action, details, severity)
    VALUES (
      p_user_id, p_username,
      'tamper_completed_bill',
      jsonb_build_object(
        'transaction_id', p_transaction_id,
        'order_number', v_order_number,
        'attempted_action', 'void',
        'reason_given', p_reason
      ),
      'critical'
    );
    -- Create fraud alert
    INSERT INTO fraud_alerts (user_id, username, alert_type, severity, description, details)
    VALUES (
      p_user_id, p_username,
      'transaction_tampering',
      'critical',
      'พนักงาน ' || p_username || ' พยายามยกเลิกบิล ' || v_order_number || ' ที่ชำระเงินแล้ว — สงสัยยักยอกทรัพย์',
      jsonb_build_object(
        'transaction_id', p_transaction_id,
        'order_number', v_order_number,
        'attempted_action', 'void',
        'reason_given', p_reason
      )
    );
    RETURN jsonb_build_object('success', false, 'blocked', true,
      'error', 'ไม่สามารถยกเลิกบิลที่ชำระเงินแล้วได้', 'fraud_logged', true);
  END IF;

  -- Admin voiding completed bill: log with warning severity
  IF v_status = 'completed' AND v_is_admin THEN
    INSERT INTO audit_logs (user_id, username, action, details, severity)
    VALUES (
      p_user_id, p_username,
      'admin_void_completed_bill',
      jsonb_build_object(
        'transaction_id', p_transaction_id,
        'order_number', v_order_number,
        'reason', p_reason
      ),
      'warning'
    );
  END IF;

  -- Perform the void (trigger now allows admin to change completed status)
  UPDATE transactions
  SET status = 'voided',
      notes = COALESCE(notes || ' | ', '') || 'เหตุผลยกเลิก: ' || p_reason
  WHERE id = p_transaction_id;

  -- Log normal void for non-completed bills
  IF v_status <> 'completed' THEN
    INSERT INTO audit_logs (user_id, username, action, details, severity)
    VALUES (
      p_user_id, p_username,
      'void_transaction',
      jsonb_build_object('transaction_id', p_transaction_id, 'order_number', v_order_number, 'reason', p_reason),
      'warning'
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'blocked', false);
END;
$$;
