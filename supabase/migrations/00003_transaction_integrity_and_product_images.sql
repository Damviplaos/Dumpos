
-- 1. Create product-images storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-images', 'product-images', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

-- 2. Storage policies for product-images
CREATE POLICY "Public read product images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

CREATE POLICY "Authenticated upload product images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "Authenticated update product images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'product-images');

CREATE POLICY "Authenticated delete product images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'product-images');

-- 3. Safe void function: blocks completed bills, logs fraud automatically
CREATE OR REPLACE FUNCTION public.void_transaction_safe(
  p_transaction_id uuid,
  p_reason text,
  p_user_id uuid,
  p_username text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status text;
  v_order_number text;
BEGIN
  SELECT status, order_number INTO v_status, v_order_number
  FROM transactions
  WHERE id = p_transaction_id;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ไม่พบรายการ');
  END IF;

  -- Block: completed bill tamper attempt
  IF v_status = 'completed' THEN
    -- Log audit
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

    RETURN jsonb_build_object('success', false, 'blocked', true, 'error', 'ไม่สามารถยกเลิกบิลที่ชำระเงินแล้วได้', 'fraud_logged', true);
  END IF;

  -- Safe to void
  UPDATE transactions SET status = 'voided', notes = COALESCE(notes || ' | ', '') || 'เหตุผลยกเลิก: ' || p_reason
  WHERE id = p_transaction_id;

  -- Log normal void
  INSERT INTO audit_logs (user_id, username, action, details, severity)
  VALUES (
    p_user_id, p_username,
    'void_transaction',
    jsonb_build_object('transaction_id', p_transaction_id, 'order_number', v_order_number, 'reason', p_reason),
    'warning'
  );

  RETURN jsonb_build_object('success', true, 'blocked', false);
END;
$$;

-- 4. DB-level trigger: extra safety net preventing direct status update on completed bills
CREATE OR REPLACE FUNCTION public.prevent_completed_tamper()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.status = 'completed' AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'COMPLETED_BILL_TAMPER: ไม่สามารถแก้ไขบิลที่ชำระเงินแล้วได้ (บิล %)' , OLD.order_number;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_completed_tamper
BEFORE UPDATE ON transactions
FOR EACH ROW
EXECUTE FUNCTION prevent_completed_tamper();

-- 5. Grant execute on void_transaction_safe
GRANT EXECUTE ON FUNCTION public.void_transaction_safe(uuid, text, uuid, text) TO authenticated;
