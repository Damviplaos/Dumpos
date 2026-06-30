import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ตรวจสอบ Authorization header (ต้องเป็น admin/super_admin เท่านั้น)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl  = Deno.env.get('SUPABASE_URL')!;
    const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey      = Deno.env.get('SUPABASE_ANON_KEY')!;

    // สร้าง client ด้วย user token เพื่อตรวจสอบสิทธิ์
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // ตรวจสอบว่า user ที่ขอ reset เป็น admin หรือ super_admin
    const { data: { user: caller }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: callerProfile } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .maybeSingle();

    const allowedRoles = ['admin', 'super_admin', 'store_owner'];
    if (!callerProfile || !allowedRoles.includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'Permission denied' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // รับ target_user_id และ new_password
    const { target_user_id, new_password } = await req.json();
    if (!target_user_id || !new_password) {
      return new Response(JSON.stringify({ error: 'target_user_id and new_password required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (new_password.length < 8) {
      return new Response(JSON.stringify({ error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ใช้ service role เพื่อ reset password
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { error: updateErr } = await adminClient.auth.admin.updateUserById(target_user_id, {
      password: new_password,
    });

    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // บันทึก audit log
    await adminClient.from('audit_logs').insert({
      user_id: caller.id,
      username: caller.email?.replace('@miaoda.com', '') ?? 'unknown',
      action: 'reset_password',
      entity_type: 'profile',
      entity_id: target_user_id,
      details: { reset_by: caller.id },
      severity: 'warning',
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
