import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function buildMainMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '📊 วันนี้', callback_data: 'report_today' },
        { text: '📅 เมื่อวาน', callback_data: 'report_yesterday' },
      ],
      [
        { text: '📈 7 วัน', callback_data: 'report_week' },
        { text: '📦 สต็อกต่ำ', callback_data: 'stock_low' },
      ],
      [
        { text: '🚨 แจ้งเตือน', callback_data: 'fraud_recent' },
        { text: '👥 พนักงานวันนี้', callback_data: 'cashiers_today' },
      ],
      [
        { text: '🔢 ยกเลิกบิลวันนี้', callback_data: 'voids_today' },
        { text: '🔄 รีเฟรช', callback_data: 'menu' },
      ],
    ],
  };
}

// Convert base64 data-URL to Uint8Array
function base64ToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const [meta, b64] = dataUrl.split(',');
  const mime = meta.match(/:(.*?);/)?.[1] ?? 'image/png';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, mime };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      bot_token,
      chat_id,
      message,
      with_menu,
      reply_to_message_id,
      // Screenshot mode
      photo_base64,  // data:image/png;base64,xxx
      caption,
    } = body;

    if (!bot_token || !chat_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'bot_token and chat_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── PHOTO mode ─────────────────────────────────────────────────────────
    if (photo_base64) {
      const { bytes, mime } = base64ToBytes(photo_base64);
      const ext = mime === 'image/jpeg' ? 'jpg' : 'png';

      const form = new FormData();
      form.append('chat_id', String(chat_id));
      form.append('photo', new Blob([bytes], { type: mime }), `screenshot.${ext}`);
      if (caption) form.append('caption', caption);
      if (with_menu) form.append('reply_markup', JSON.stringify(buildMainMenuKeyboard()));

      const res = await fetch(`https://api.telegram.org/bot${bot_token}/sendPhoto`, {
        method: 'POST',
        body: form,
      });
      const result = await res.json();

      if (!res.ok) {
        return new Response(
          JSON.stringify({ success: false, error: result.description ?? 'Telegram sendPhoto error' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── TEXT mode ──────────────────────────────────────────────────────────
    if (!message) {
      return new Response(
        JSON.stringify({ success: false, error: 'message or photo_base64 required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const payload: Record<string, unknown> = {
      chat_id,
      text: message,
      parse_mode: 'Markdown',
    };
    if (with_menu) payload.reply_markup = buildMainMenuKeyboard();
    if (reply_to_message_id) payload.reply_to_message_id = reply_to_message_id;

    const res = await fetch(`https://api.telegram.org/bot${bot_token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await res.json();

    if (!res.ok) {
      return new Response(
        JSON.stringify({ success: false, error: result.description ?? 'Telegram API error' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
