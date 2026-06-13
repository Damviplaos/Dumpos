import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Build the main menu inline keyboard
function buildMainMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '📊 รายงานวันนี้', callback_data: 'report_today' },
        { text: '📅 รายงานเมื่อวาน', callback_data: 'report_yesterday' },
      ],
      [
        { text: '📈 ยอดขาย 7 วัน', callback_data: 'report_week' },
        { text: '📦 สต็อกต่ำ', callback_data: 'stock_low' },
      ],
      [
        { text: '🚨 แจ้งเตือนล่าสุด', callback_data: 'fraud_recent' },
        { text: '🔄 รีเฟรช', callback_data: 'menu' },
      ],
    ],
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { bot_token, chat_id, message, with_menu, reply_to_message_id } = body;

    if (!bot_token || !chat_id || !message) {
      return new Response(
        JSON.stringify({ success: false, error: 'bot_token, chat_id, message required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const payload: Record<string, unknown> = {
      chat_id,
      text: message,
      parse_mode: 'Markdown',
    };

    // Attach main menu keyboard when requested
    if (with_menu) {
      payload.reply_markup = buildMainMenuKeyboard();
    }

    if (reply_to_message_id) {
      payload.reply_to_message_id = reply_to_message_id;
    }

    const telegramUrl = `https://api.telegram.org/bot${bot_token}/sendMessage`;
    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      return new Response(
        JSON.stringify({ success: false, error: result.description || 'Telegram API error' }),
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
