import { useCallback } from 'react';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { AuditSeverity } from '@/types/types';

export function useAuditLog() {
  const { profile } = useAuth();

  const log = useCallback(async (
    action: string,
    options?: {
      entityType?: string;
      entityId?: string;
      details?: Record<string, unknown>;
      severity?: AuditSeverity;
    }
  ) => {
    try {
      await supabase.from('audit_logs').insert({
        user_id: profile?.id ?? null,
        username: profile?.username ?? 'unknown',
        store_id: profile?.store_id ?? null,
        action,
        entity_type: options?.entityType ?? null,
        entity_id: options?.entityId ?? null,
        details: options?.details ?? {},
        severity: options?.severity ?? 'info',
      });
    } catch (err) {
      console.error('บันทึก audit log ไม่สำเร็จ:', err);
    }
  }, [profile]);

  return { log };
}
