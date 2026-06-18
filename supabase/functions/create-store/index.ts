import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
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
    // ตรวจสอบว่าผู้เรียกเป็น super_admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'ไม่ได้รับอนุญาต' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ใช้ service role client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ตรวจสอบ token ของผู้เรียก
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    );
    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: 'Token ไม่ถูกต้อง' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .maybeSingle();

    if (callerProfile?.role !== 'super_admin') {
      return new Response(JSON.stringify({ error: 'เฉพาะ Super Admin เท่านั้น' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { store_name, store_address, store_phone, owner_username, owner_password, owner_full_name } = body;

    if (!store_name || !owner_username || !owner_password) {
      return new Response(JSON.stringify({ error: 'กรุณากรอกข้อมูลให้ครบ' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ตรวจสอบ username ซ้ำ
    const { data: existingUser } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('username', owner_username)
      .maybeSingle();

    if (existingUser) {
      return new Response(JSON.stringify({ error: `ชื่อผู้ใช้ "${owner_username}" ถูกใช้งานแล้ว` }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. สร้าง store ก่อน
    const { data: newStore, error: storeError } = await supabaseAdmin
      .from('stores')
      .insert({
        name: store_name,
        address: store_address || '',
        phone: store_phone || '',
        is_active: true,
      })
      .select()
      .single();

    if (storeError || !newStore) {
      return new Response(JSON.stringify({ error: `สร้างร้านไม่สำเร็จ: ${storeError?.message}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. สร้าง auth user ด้วย service role (ไม่ส่งผลต่อ session ปัจจุบัน)
    const email = `${owner_username}@miaoda.com`;
    const { data: newAuthUser, error: authCreateError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: owner_password,
      email_confirm: true,
      user_metadata: {
        username: owner_username,
        full_name: owner_full_name || owner_username,
        store_id: newStore.id,
        role: 'store_owner',
      },
    });

    if (authCreateError || !newAuthUser.user) {
      // rollback store
      await supabaseAdmin.from('stores').delete().eq('id', newStore.id);
      return new Response(JSON.stringify({ error: `สร้างบัญชีไม่สำเร็จ: ${authCreateError?.message}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. อัพเดท profile ที่ trigger สร้างอัตโนมัติ
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        username: owner_username,
        full_name: owner_full_name || owner_username,
        role: 'store_owner',
        store_id: newStore.id,
        is_active: true,
      })
      .eq('id', newAuthUser.user.id);

    if (profileError) {
      console.error('อัพเดท profile ไม่สำเร็จ:', profileError);
    }

    // 4. สร้าง store_settings สำหรับร้านใหม่
    await supabaseAdmin.from('store_settings').insert({
      store_name: store_name,
      address: store_address || '',
      phone: store_phone || '',
      store_id: newStore.id,
    });

    return new Response(JSON.stringify({
      success: true,
      store: newStore,
      owner_id: newAuthUser.user.id,
      message: `สร้างร้าน "${store_name}" และบัญชีเจ้าของร้าน "${owner_username}" สำเร็จ`,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('create-store error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
