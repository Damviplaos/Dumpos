import html2canvas from 'html2canvas';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';

interface ScreenshotOptions {
  elementId: string;   // id of DOM element to capture
  caption?: string;
}

export async function sendScreenshotToTelegram(opts: ScreenshotOptions): Promise<void> {
  // 1. Fetch store settings (bot_token + chat_id)
  const { data: settings } = await supabase
    .from('store_settings')
    .select('telegram_bot_token, telegram_chat_id')
    .maybeSingle();

  if (!settings?.telegram_bot_token || !settings?.telegram_chat_id) {
    toast.error('ยังไม่ได้ตั้งค่า Telegram Bot Token / Chat ID');
    return;
  }

  // 2. Capture element
  const el = document.getElementById(opts.elementId);
  if (!el) {
    toast.error('ไม่พบ element ที่จะถ่ายภาพ');
    return;
  }

  toast.loading('กำลังถ่ายภาพหน้าจอ...', { id: 'screenshot' });

  try {
    const canvas = await html2canvas(el, {
      backgroundColor: document.documentElement.classList.contains('dark') ? '#1a1a2e' : '#ffffff',
      scale: 1.5,
      useCORS: true,
      logging: false,
    });

    const dataUrl = canvas.toDataURL('image/png');

    // 3. Send to edge function
    const { data, error } = await supabase.functions.invoke('send-telegram', {
      body: {
        bot_token: settings.telegram_bot_token,
        chat_id: settings.telegram_chat_id,
        photo_base64: dataUrl,
        caption: opts.caption ?? `📸 หน้าจอจาก POS — ${new Date().toLocaleString('th-TH')}`,
        with_menu: true,
      },
    });

    if (error || !data?.success) {
      toast.error('ส่งรูปไม่สำเร็จ: ' + (error?.message ?? 'unknown'), { id: 'screenshot' });
    } else {
      toast.success('ส่งรูปหน้าจอไป Telegram แล้ว! 📸', { id: 'screenshot' });
    }
  } catch (e) {
    toast.error('เกิดข้อผิดพลาด: ' + String(e), { id: 'screenshot' });
  }
}
