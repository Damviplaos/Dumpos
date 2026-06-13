import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// -------- Helpers --------
function formatCurrency(v: number) {
  return '฿' + v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function thaiDate(d: Date) {
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

function dateRange(daysBack: number): { start: string; end: string; label: string } {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - daysBack);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const label = daysBack === 0 ? 'วันนี้' : daysBack === 1 ? 'เมื่อวาน' : `${daysBack + 1} วันล่าสุด`;
  return { start: start.toISOString(), end: end.toISOString(), label };
}

// -------- Query daily report --------
async function getDailyReport(
  supabase: ReturnType<typeof createClient>,
  storeId: string,
  daysBack: number,
): Promise<string> {
  const { start, end, label } = dateRange(daysBack);

  const { data: txData } = await supabase
    .from('transactions')
    .select('total, items:transaction_items(unit_price, cost, quantity)')
    .eq('store_id', storeId)
    .eq('status', 'completed')
    .gte('created_at', start)
    .lte('created_at', end);

  const txArr = Array.isArray(txData) ? txData : [];
  const totalSales = txArr.reduce((s: number, t: any) => s + (t.total || 0), 0);
  const totalOrders = txArr.length;
  const totalProfit = txArr.reduce((s: number, t: any) => {
    const items = Array.isArray(t.items) ? t.items : [];
    return s + items.reduce((si: number, i: any) => si + ((i.unit_price - i.cost) * i.quantity), 0);
  }, 0);
  const profitMargin = totalSales > 0 ? ((totalProfit / totalSales) * 100).toFixed(1) : '0.0';

  // Top 3 products
  const productMap: Record<string, { qty: number; revenue: number }> = {};
  txArr.forEach((t: any) => {
    (Array.isArray(t.items) ? t.items : []).forEach((i: any) => {
      if (!productMap[i.product_name]) productMap[i.product_name] = { qty: 0, revenue: 0 };
      productMap[i.product_name].qty += i.quantity;
      productMap[i.product_name].revenue += i.subtotal || (i.unit_price * i.quantity);
    });
  });
  const topProducts = Object.entries(productMap)
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 3);

  const dateLabel = daysBack === 1
    ? thaiDate(new Date(Date.now() - 86400000))
    : thaiDate(new Date());

  let msg = `📊 *รายงาน${label}* — ${dateLabel}\n`;
  msg += `${'─'.repeat(28)}\n`;
  msg += `💰 ยอดขาย: *${formatCurrency(totalSales)}*\n`;
  msg += `🛒 ออเดอร์: *${totalOrders} รายการ*\n`;
  msg += `📈 กำไร: *${formatCurrency(totalProfit)}* (${profitMargin}%)\n`;
  if (totalOrders > 0) {
    msg += `💳 เฉลี่ย/ออเดอร์: *${formatCurrency(totalSales / totalOrders)}*\n`;
  }
  if (topProducts.length > 0) {
    msg += `${'─'.repeat(28)}\n`;
    msg += `🏆 *สินค้าขายดี*\n`;
    topProducts.forEach(([name, d], i) => {
      msg += `${i + 1}. ${name} — ${d.qty} ชิ้น (${formatCurrency(d.revenue)})\n`;
    });
  }
  return msg;
}

// -------- Query week summary --------
async function getWeekReport(
  supabase: ReturnType<typeof createClient>,
  storeId: string,
): Promise<string> {
  const lines: string[] = [];
  let weekSales = 0;
  for (let i = 6; i >= 0; i--) {
    const { start, end } = dateRange(i);
    const { data } = await supabase
      .from('transactions')
      .select('total')
      .eq('store_id', storeId)
      .eq('status', 'completed')
      .gte('created_at', start)
      .lte('created_at', end);
    const arr = Array.isArray(data) ? data : [];
    const sales = arr.reduce((s: number, t: any) => s + (t.total || 0), 0);
    weekSales += sales;
    const d = new Date();
    d.setDate(d.getDate() - i);
    const day = thaiDate(d);
    lines.push(`${i === 0 ? '📍' : '  '} ${day}: *${formatCurrency(sales)}* (${arr.length} ออเดอร์)`);
  }
  let msg = `📈 *ยอดขาย 7 วันล่าสุด*\n`;
  msg += `${'─'.repeat(28)}\n`;
  msg += lines.join('\n') + '\n';
  msg += `${'─'.repeat(28)}\n`;
  msg += `💰 รวม 7 วัน: *${formatCurrency(weekSales)}*\n`;
  return msg;
}

// -------- Query low stock --------
async function getLowStock(
  supabase: ReturnType<typeof createClient>,
  storeId: string,
): Promise<string> {
  const { data: settings } = await supabase
    .from('store_settings')
    .select('low_stock_threshold')
    .eq('store_id', storeId)
    .maybeSingle();
  const threshold = settings?.low_stock_threshold ?? 10;

  const { data: products } = await supabase
    .from('products')
    .select('name, stock')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .lte('stock', threshold)
    .order('stock', { ascending: true })
    .limit(15);

  const arr = Array.isArray(products) ? products : [];
  if (arr.length === 0) {
    return `✅ *สต็อกสินค้า*\n\nสินค้าทุกรายการมีสต็อกเพียงพอ (เกณฑ์ ${threshold} ชิ้น)`;
  }
  let msg = `📦 *สินค้าสต็อกต่ำ* (เกณฑ์ ≤${threshold} ชิ้น)\n`;
  msg += `${'─'.repeat(28)}\n`;
  arr.forEach((p: any) => {
    const icon = p.stock === 0 ? '🔴' : p.stock <= 3 ? '🟠' : '🟡';
    msg += `${icon} ${p.name}: *${p.stock} ชิ้น*\n`;
  });
  return msg;
}

// -------- Query recent fraud alerts --------
async function getRecentFraud(
  supabase: ReturnType<typeof createClient>,
  storeId: string,
): Promise<string> {
  const { data } = await supabase
    .from('fraud_alerts')
    .select('username, alert_type, severity, description, created_at')
    .eq('store_id', storeId)
    .eq('is_reviewed', false)
    .order('created_at', { ascending: false })
    .limit(5);

  const arr = Array.isArray(data) ? data : [];
  if (arr.length === 0) {
    return `🛡️ *การแจ้งเตือนล่าสุด*\n\nไม่มีการแจ้งเตือนที่ยังไม่ได้ตรวจสอบ ✅`;
  }
  const sevIcon: Record<string, string> = { critical: '🚨', high: '🔴', medium: '🟠', low: '🟡' };
  let msg = `🚨 *แจ้งเตือนที่ยังไม่ตรวจสอบ* (${arr.length} รายการ)\n`;
  msg += `${'─'.repeat(28)}\n`;
  arr.forEach((a: any) => {
    const icon = sevIcon[a.severity] ?? '⚠️';
    const time = new Date(a.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    msg += `${icon} *${a.username}* [${time}]\n${a.description}\n\n`;
  });
  return msg;
}

// -------- Answer callback / answer inline keyboard press --------
async function answerCallback(botToken: string, callbackQueryId: string, text?: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text: text ?? '' }),
  });
}

// -------- Send reply with menu --------
async function sendReply(
  botToken: string,
  chatId: number | string,
  text: string,
  withMenu = true,
  replyToMessageId?: number,
) {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
  };
  if (withMenu) {
    payload.reply_markup = {
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
          { text: '🏠 เมนูหลัก', callback_data: 'menu' },
        ],
      ],
    };
  }
  if (replyToMessageId) payload.reply_to_message_id = replyToMessageId;

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// -------- Main handler --------
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Health check / webhook register endpoint
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ ok: true, service: 'telegram-webhook' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const update = await req.json();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Determine what triggered this — message or callback_query
    const message = update.message;
    const callbackQuery = update.callback_query;

    // Identify chat_id
    const chatId: number = message?.chat?.id ?? callbackQuery?.message?.chat?.id;
    if (!chatId) {
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Look up store settings by chat_id (telegram_chat_id)
    const { data: settings } = await supabase
      .from('store_settings')
      .select('store_id, store_name, telegram_bot_token, telegram_chat_id')
      .eq('telegram_chat_id', String(chatId))
      .maybeSingle();

    if (!settings?.store_id || !settings?.telegram_bot_token) {
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const botToken = settings.telegram_bot_token;
    const storeId = settings.store_id;

    // -------- Handle text commands --------
    if (message?.text) {
      const cmd = message.text.trim().toLowerCase();
      let replyText = '';

      if (cmd === '/start' || cmd === '/menu' || cmd === '/help') {
        replyText = `👋 *สวัสดี! POS Bot พร้อมให้บริการ*\n\n🏪 *${settings.store_name || 'ร้านของฉัน'}*\n\nเลือกคำสั่งที่ต้องการจากเมนูด้านล่าง หรือพิมพ์:\n/today — รายงานวันนี้\n/yesterday — รายงานเมื่อวาน\n/week — ยอดขาย 7 วัน\n/stock — สต็อกสินค้าต่ำ\n/alerts — แจ้งเตือนล่าสุด`;
      } else if (cmd === '/today' || cmd === 'รายงานวันนี้') {
        replyText = await getDailyReport(supabase, storeId, 0);
      } else if (cmd === '/yesterday' || cmd === 'รายงานเมื่อวาน') {
        replyText = await getDailyReport(supabase, storeId, 1);
      } else if (cmd === '/week' || cmd === 'ยอดขาย 7 วัน') {
        replyText = await getWeekReport(supabase, storeId);
      } else if (cmd === '/stock' || cmd === 'สต็อกต่ำ') {
        replyText = await getLowStock(supabase, storeId);
      } else if (cmd === '/alerts' || cmd === 'แจ้งเตือน') {
        replyText = await getRecentFraud(supabase, storeId);
      } else {
        replyText = `ไม่เข้าใจคำสั่ง\nพิมพ์ /menu เพื่อดูเมนู`;
      }

      await sendReply(botToken, chatId, replyText, true, message.message_id);
    }

    // -------- Handle inline keyboard button presses --------
    if (callbackQuery) {
      const data = callbackQuery.data as string;
      let replyText = '';

      await answerCallback(botToken, callbackQuery.id, '⏳ กำลังโหลด...');

      if (data === 'menu') {
        replyText = `🏠 *เมนูหลัก* — ${settings.store_name || 'ร้านของฉัน'}\n\nเลือกรายงานที่ต้องการ:`;
      } else if (data === 'report_today') {
        replyText = await getDailyReport(supabase, storeId, 0);
      } else if (data === 'report_yesterday') {
        replyText = await getDailyReport(supabase, storeId, 1);
      } else if (data === 'report_week') {
        replyText = await getWeekReport(supabase, storeId);
      } else if (data === 'stock_low') {
        replyText = await getLowStock(supabase, storeId);
      } else if (data === 'fraud_recent') {
        replyText = await getRecentFraud(supabase, storeId);
      } else {
        replyText = 'ไม่รู้จักคำสั่งนี้';
      }

      await sendReply(botToken, chatId, replyText, true);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('telegram-webhook error:', err);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
