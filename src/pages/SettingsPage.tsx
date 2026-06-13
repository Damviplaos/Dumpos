import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Save, Store, Phone, MapPin, Receipt, Bell, Percent, Plus, Pencil, Trash2,
  Send, Bot, CheckCircle, XCircle, AlertTriangle, Link2, Copy, Tag,
} from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Category, StoreSettings, StoreRole } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const settingsSchema = z.object({
  store_name: z.string().min(1, 'กรอกชื่อร้าน'),
  address: z.string().optional(),
  phone: z.string().optional(),
  tax_rate: z.coerce.number().min(0).max(100),
  auto_print_receipt: z.boolean(),
  low_stock_threshold: z.coerce.number().int().min(1),
  max_void_per_day: z.coerce.number().int().min(1).max(999),
});
type SettingsForm = z.infer<typeof settingsSchema>;

const telegramSchema = z.object({
  telegram_bot_token: z.string().optional(),
  telegram_chat_id: z.string().optional(),
});
type TelegramForm = z.infer<typeof telegramSchema>;

const catSchema = z.object({
  name: z.string().min(1, 'กรอกชื่อหมวดหมู่'),
  description: z.string().optional(),
  sort_order: z.coerce.number().int().min(0),
});
type CatForm = z.infer<typeof catSchema>;

const badgeSchema = z.object({
  name: z.string().min(1, 'กรอกชื่อ Badge'),
  color: z.string().min(4, 'เลือกสี'),
  emoji: z.string().min(1, 'กรอก Emoji'),
  description: z.string().optional(),
  sort_order: z.coerce.number().int().min(0),
});
type BadgeForm = z.infer<typeof badgeSchema>;

// Preset Discord-like colors
const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#10b981',
  '#06b6d4', '#3b82f6', '#64748b', '#1e293b',
];
const PRESET_EMOJIS = ['🏷️', '⭐', '🔥', '💎', '🚀', '👑', '🎖️', '🛡️', '⚡', '🌟', '🎯', '🦁', '🌈', '🏆', '💪', '🎓'];

export default function SettingsPage() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingTelegram, setSavingTelegram] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [registeringWebhook, setRegisteringWebhook] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [telegramStatus, setTelegramStatus] = useState<'idle' | 'ok' | 'fail'>('idle');

  // Categories
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [showCatForm, setShowCatForm] = useState(false);
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [deleteCat, setDeleteCat] = useState<Category | null>(null);
  const [savingCat, setSavingCat] = useState(false);

  // Store Badges (Discord-style)
  const [storeRoles, setStoreRoles] = useState<StoreRole[]>([]);
  const [loadingBadges, setLoadingBadges] = useState(true);
  const [showBadgeForm, setShowBadgeForm] = useState(false);
  const [editBadge, setEditBadge] = useState<StoreRole | null>(null);
  const [deleteBadge, setDeleteBadge] = useState<StoreRole | null>(null);
  const [savingBadge, setSavingBadge] = useState(false);

  const settingsForm = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: { store_name: 'ร้านของฉัน', address: '', phone: '', tax_rate: 7, auto_print_receipt: false, low_stock_threshold: 10, max_void_per_day: 5 },
  });
  const telegramForm = useForm<TelegramForm>({
    resolver: zodResolver(telegramSchema),
    defaultValues: { telegram_bot_token: '', telegram_chat_id: '' },
  });
  const catForm = useForm<CatForm>({
    resolver: zodResolver(catSchema),
    defaultValues: { name: '', description: '', sort_order: 0 },
  });
  const badgeForm = useForm<BadgeForm>({
    resolver: zodResolver(badgeSchema),
    defaultValues: { name: '', color: '#6366f1', emoji: '🏷️', description: '', sort_order: 0 },
  });

  const watchColor = badgeForm.watch('color');
  const watchEmoji = badgeForm.watch('emoji');
  const watchName = badgeForm.watch('name');

  useEffect(() => { loadSettings(); loadCategories(); loadBadges(); }, []);

  const loadSettings = async () => {
    setLoadingSettings(true);
    const { data } = await supabase.from('store_settings').select('*').maybeSingle();
    if (data) {
      const s = data as StoreSettings;
      setSettings(s);
      settingsForm.reset({
        store_name: s.store_name, address: s.address || '', phone: s.phone || '',
        tax_rate: s.tax_rate, auto_print_receipt: s.auto_print_receipt,
        low_stock_threshold: s.low_stock_threshold, max_void_per_day: s.max_void_per_day || 5,
      });
      telegramForm.reset({
        telegram_bot_token: s.telegram_bot_token || '',
        telegram_chat_id: s.telegram_chat_id || '',
      });
      if (s.telegram_bot_token && s.telegram_chat_id) setTelegramStatus('ok');
    }
    setLoadingSettings(false);
  };

  const loadCategories = async () => {
    setLoadingCats(true);
    const { data } = await supabase.from('categories').select('*').order('sort_order');
    setCategories(Array.isArray(data) ? data as Category[] : []);
    setLoadingCats(false);
  };

  const loadBadges = async () => {
    setLoadingBadges(true);
    const { data } = await supabase.from('store_roles').select('*').order('sort_order');
    setStoreRoles(Array.isArray(data) ? data as StoreRole[] : []);
    setLoadingBadges(false);
  };

  const onSaveSettings = async (data: SettingsForm) => {
    setSavingSettings(true);
    const payload = {
      store_name: data.store_name, address: data.address || '', phone: data.phone || '',
      tax_rate: data.tax_rate, auto_print_receipt: data.auto_print_receipt,
      low_stock_threshold: data.low_stock_threshold, max_void_per_day: data.max_void_per_day,
      updated_at: new Date().toISOString(), store_id: profile?.store_id ?? null,
    };
    const { error } = settings?.id
      ? await supabase.from('store_settings').update(payload).eq('id', settings.id)
      : await supabase.from('store_settings').insert(payload);
    setSavingSettings(false);
    if (error) { toast.error(t('common.error')); return; }
    toast.success(t('settings.saveSuccess'));
    loadSettings();
  };

  const onSaveTelegram = async (data: TelegramForm) => {
    if (!settings?.id) { toast.error(t('settings.saveFirst')); return; }
    setSavingTelegram(true);
    const { error } = await supabase.from('store_settings').update({
      telegram_bot_token: data.telegram_bot_token || null,
      telegram_chat_id: data.telegram_chat_id || null,
      updated_at: new Date().toISOString(),
    }).eq('id', settings.id);
    setSavingTelegram(false);
    if (error) { toast.error(t('common.error')); return; }
    toast.success(t('settings.saveSuccess'));
    setTelegramStatus(data.telegram_bot_token && data.telegram_chat_id ? 'ok' : 'idle');
    loadSettings();
  };

  const onTestTelegram = async () => {
    const { telegram_bot_token, telegram_chat_id } = telegramForm.getValues();
    if (!telegram_bot_token || !telegram_chat_id) {
      toast.error(t('settings.enterTokenFirst')); return;
    }
    setTestingTelegram(true);
    const { data, error } = await supabase.functions.invoke('send-telegram', {
      body: {
        bot_token: telegram_bot_token, chat_id: telegram_chat_id, with_menu: true,
        message: `✅ *ทดสอบการเชื่อมต่อ Telegram*\n\nการเชื่อมต่อ Telegram Bot สำเร็จ!\nร้าน: ${settings?.store_name || 'ร้านของฉัน'}\nเวลา: ${new Date().toLocaleString('th-TH')}\n\nกดปุ่มด้านล่างเพื่อดูรายงาน 👇`,
      },
    });
    setTestingTelegram(false);
    if (error || !data?.success) {
      setTelegramStatus('fail'); toast.error(t('settings.telegramFailed'));
    } else {
      setTelegramStatus('ok'); toast.success(t('settings.telegramConnected'));
    }
  };

  const onRegisterWebhook = async () => {
    const { telegram_bot_token } = telegramForm.getValues();
    if (!telegram_bot_token) { toast.error(t('settings.enterTokenFirst')); return; }
    setRegisteringWebhook(true);
    const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-webhook`;
    try {
      const res = await fetch(`https://api.telegram.org/bot${telegram_bot_token}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl }),
      });
      const result = await res.json();
      setRegisteringWebhook(false);
      if (result.ok) { setWebhookStatus('ok'); toast.success(t('settings.webhookOk')); }
      else { setWebhookStatus('fail'); toast.error(t('settings.webhookFail') + (result.description || 'unknown error')); }
    } catch (e) {
      setRegisteringWebhook(false); setWebhookStatus('fail'); toast.error(t('settings.webhookError') + String(e));
    }
  };

  // ── Categories ──────────────────────────────────────────────────────────
  const openCatCreate = () => {
    setEditCat(null);
    catForm.reset({ name: '', description: '', sort_order: categories.length });
    setShowCatForm(true);
  };
  const openCatEdit = (cat: Category) => {
    setEditCat(cat);
    catForm.reset({ name: cat.name, description: cat.description || '', sort_order: cat.sort_order });
    setShowCatForm(true);
  };
  const onSaveCat = async (data: CatForm) => {
    setSavingCat(true);
    const payload = { name: data.name, description: data.description || '', sort_order: data.sort_order, store_id: profile?.store_id ?? null };
    const { error } = editCat
      ? await supabase.from('categories').update(payload).eq('id', editCat.id)
      : await supabase.from('categories').insert(payload);
    setSavingCat(false);
    if (error) { toast.error(t('settings.saveFailed') + error.message); return; }
    toast.success(editCat ? t('settings.categoryEdited') : t('settings.categoryAdded'));
    setShowCatForm(false); loadCategories();
  };
  const handleDeleteCat = async () => {
    if (!deleteCat) return;
    const { error } = await supabase.from('categories').delete().eq('id', deleteCat.id);
    if (error) { toast.error(t('settings.categoryDeleteFailed')); return; }
    toast.success(t('settings.categoryDeleted')); setDeleteCat(null); loadCategories();
  };

  // ── Store Badges ─────────────────────────────────────────────────────────
  const openBadgeCreate = () => {
    setEditBadge(null);
    badgeForm.reset({ name: '', color: '#6366f1', emoji: '🏷️', description: '', sort_order: storeRoles.length });
    setShowBadgeForm(true);
  };
  const openBadgeEdit = (badge: StoreRole) => {
    setEditBadge(badge);
    badgeForm.reset({
      name: badge.name, color: badge.color, emoji: badge.emoji,
      description: badge.description || '', sort_order: badge.sort_order,
    });
    setShowBadgeForm(true);
  };
  const onSaveBadge = async (data: BadgeForm) => {
    setSavingBadge(true);
    const payload = {
      name: data.name, color: data.color, emoji: data.emoji,
      description: data.description || null, sort_order: data.sort_order,
      store_id: profile?.store_id ?? null,
    };
    const { error } = editBadge
      ? await supabase.from('store_roles').update(payload).eq('id', editBadge.id)
      : await supabase.from('store_roles').insert(payload);
    setSavingBadge(false);
    if (error) { toast.error(t('settings.saveFailed') + error.message); return; }
    toast.success(editBadge ? t('settings.badgeEdited') : t('settings.badgeAdded'));
    setShowBadgeForm(false); loadBadges();
  };
  const handleDeleteBadge = async () => {
    if (!deleteBadge) return;
    const { error } = await supabase.from('store_roles').delete().eq('id', deleteBadge.id);
    if (error) { toast.error(t('settings.badgeDeleteFailed')); return; }
    toast.success(t('settings.badgeDeleted')); setDeleteBadge(null); loadBadges();
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold text-foreground text-balance">{t('settings.title')}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{t('settings.subtitle')}</p>
      </div>

      {/* Store Settings Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Store className="w-4 h-4 text-primary" />{t('settings.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingSettings ? (
            <div className="space-y-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 bg-muted" />)}</div>
          ) : (
            <Form {...settingsForm}>
              <form onSubmit={settingsForm.handleSubmit(onSaveSettings)} className="space-y-4">
                <FormField control={settingsForm.control} name="store_name" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal flex items-center gap-1.5"><Store className="w-3.5 h-3.5" />{t('settings.storeName')}</FormLabel>
                    <FormControl><Input {...field} placeholder={t('settings.storeNamePlaceholder')} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={settingsForm.control} name="address" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />ที่อยู่</FormLabel>
                    <FormControl><Input {...field} placeholder="123 ถนน..." /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={settingsForm.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />เบอร์โทรศัพท์</FormLabel>
                    <FormControl><Input {...field} placeholder="02-xxx-xxxx" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <Separator />
                <FormField control={settingsForm.control} name="tax_rate" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal flex items-center gap-1.5"><Percent className="w-3.5 h-3.5" />ภาษี VAT (%)</FormLabel>
                    <FormControl><Input {...field} type="number" min={0} max={100} step="0.01" className="w-32" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={settingsForm.control} name="low_stock_threshold" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal flex items-center gap-1.5"><Bell className="w-3.5 h-3.5" />สต็อกขั้นต่ำสำหรับแจ้งเตือน</FormLabel>
                    <FormControl><Input {...field} type="number" min={1} className="w-32" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={settingsForm.control} name="max_void_per_day" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-yellow-600" />จำนวนยกเลิกบิลสูงสุด/วัน
                    </FormLabel>
                    <FormControl><Input {...field} type="number" min={1} max={999} className="w-32" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={settingsForm.control} name="auto_print_receipt" render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                    <div>
                      <FormLabel className="text-sm font-normal flex items-center gap-1.5 cursor-pointer"><Receipt className="w-3.5 h-3.5" />พิมพ์ใบเสร็จอัตโนมัติ</FormLabel>
                      <p className="text-xs text-muted-foreground mt-0.5">เปิดหน้าต่างพิมพ์ทันทีหลังชำระเงิน</p>
                    </div>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />
                <Button type="submit" disabled={savingSettings} className="w-full md:w-auto">
                  <Save className="w-4 h-4 mr-1.5" />{savingSettings ? t('settings.saving') : t('settings.saveSettings')}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>

      {/* Telegram Integration Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Bot className="w-4 h-4 text-primary" />Telegram Bot แจ้งเตือน
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {telegramStatus === 'ok' && <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 gap-1 text-xs"><CheckCircle className="w-3 h-3" />{t('settings.telegramConnected')}</Badge>}
              {telegramStatus === 'fail' && <Badge className="bg-destructive/10 text-destructive gap-1 text-xs"><XCircle className="w-3 h-3" />{t('settings.telegramFailed')}</Badge>}
              {webhookStatus === 'ok' && <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 gap-1 text-xs"><Link2 className="w-3 h-3" />{t('settings.webhookActive')}</Badge>}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">รับแจ้งเตือนและสั่งดูรายงาน + ส่งรูปหน้าจอผ่าน Telegram Bot ได้โดยตรง</p>
        </CardHeader>
        <CardContent>
          {loadingSettings ? (
            <div className="space-y-3"><Skeleton className="h-10 bg-muted" /><Skeleton className="h-10 bg-muted" /></div>
          ) : (
            <Form {...telegramForm}>
              <form onSubmit={telegramForm.handleSubmit(onSaveTelegram)} className="space-y-4">
                <FormField control={telegramForm.control} name="telegram_bot_token" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">Telegram Bot Token</FormLabel>
                    <FormControl><Input {...field} placeholder="1234567890:AAxxxxxxxxxxxxxxxxxxxxxx" type="password" /></FormControl>
                    <p className="text-xs text-muted-foreground">สร้าง Bot ผ่าน @BotFather แล้วคัดลอก Token มาใส่</p>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={telegramForm.control} name="telegram_chat_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">Telegram Chat ID</FormLabel>
                    <FormControl><Input {...field} placeholder="-1001234567890 หรือ 123456789" /></FormControl>
                    <p className="text-xs text-muted-foreground">ส่ง /start ให้ Bot แล้วใช้ @userinfobot เพื่อรับ Chat ID</p>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={savingTelegram}><Save className="w-4 h-4 mr-1.5" />{savingTelegram ? t('settings.saving') : t('settings.saveTelegram')}</Button>
                  <Button type="button" variant="outline" disabled={testingTelegram} onClick={onTestTelegram}>
                    <Send className="w-4 h-4 mr-1.5" />{testingTelegram ? t('settings.saving') : t('settings.testMenu')}
                  </Button>
                  <Button type="button" variant="outline" disabled={registeringWebhook} onClick={onRegisterWebhook}>
                    <Link2 className="w-4 h-4 mr-1.5" />{registeringWebhook ? t('settings.registeringWebhook') : t('settings.registerWebhook')}
                  </Button>
                </div>
                <div className="p-3 bg-muted rounded-lg space-y-2">
                  <p className="text-xs font-medium text-foreground">{t('settings.webhookUrl')}</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-muted-foreground bg-background border border-border rounded px-2 py-1 flex-1 min-w-0 truncate">
                      {`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-webhook`}
                    </code>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                      onClick={() => { navigator.clipboard.writeText(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-webhook`); toast.success(t('settings.urlCopied')); }}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="p-3 bg-muted rounded-lg space-y-1.5">
                  <p className="text-xs font-medium text-foreground">คำสั่งที่รองรับใน Telegram:</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                    {[
                      ['/start', 'เมนูหลัก'], ['/today', 'รายงานวันนี้'], ['/yesterday', 'รายงานเมื่อวาน'],
                      ['/week', 'ยอดขาย 7 วัน (พร้อมกราฟ)'], ['/stock', 'สต็อกสินค้าต่ำ'], ['/alerts', 'แจ้งเตือนล่าสุด'],
                      ['/cashiers', 'พนักงานวันนี้'], ['/voids', 'บิลยกเลิกวันนี้'], ['/summary', 'สรุปด่วน'],
                    ].map(([cmd, desc]) => (
                      <div key={cmd} className="flex items-center gap-1.5">
                        <code className="text-xs text-primary font-mono">{cmd}</code>
                        <span className="text-xs text-muted-foreground">— {desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-3 bg-muted rounded-lg space-y-1">
                  <p className="text-xs font-medium text-foreground">แจ้งเตือนอัตโนมัติ + ส่งรูปหน้าจอ:</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                    <li>ตรวจพบ Fraud Alert / การยักยอกทรัพย์</li>
                    <li>ออกใบเตือนพนักงาน (ใบเหลือง/ใบแดง)</li>
                    <li>กด 📸 บน Dashboard/Reports เพื่อส่งรูปหน้าจอ</li>
                  </ul>
                </div>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>

      {/* Discord-style Badges Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Tag className="w-4 h-4 text-primary" />{t('settings.badgeTitle')}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">{t('settings.badgeSubtitle')}</p>
            </div>
            <Button size="sm" onClick={openBadgeCreate}><Plus className="w-4 h-4 mr-1" />{t('settings.createBadge')}</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto w-full max-w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">{t('settings.badgeName')}</TableHead>
                  <TableHead className="whitespace-nowrap">{t('settings.badgeNameCol')}</TableHead>
                  <TableHead className="whitespace-nowrap">{t('settings.badgeDesc')}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t('settings.badgeOrder')}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t('settings.badgeManage')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingBadges ? (
                  [...Array(3)].map((_, i) => (
                    <TableRow key={i}>{[...Array(5)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 bg-muted" /></TableCell>)}</TableRow>
                  ))
                ) : storeRoles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-muted-foreground text-sm">
                      {t('settings.noBadges')}
                    </TableCell>
                  </TableRow>
                ) : storeRoles.map(badge => (
                  <TableRow key={badge.id} className="hover:bg-muted/30">
                    <TableCell className="whitespace-nowrap">
                      <span
                        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium"
                        style={{ backgroundColor: badge.color + '22', color: badge.color, border: `1px solid ${badge.color}44` }}
                      >
                        {badge.emoji} {badge.name}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm font-medium text-foreground">{badge.name}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground max-w-[200px] truncate">{badge.description || '-'}</TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm text-muted-foreground">{badge.sort_order}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => openBadgeEdit(badge)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="w-8 h-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteBadge(badge)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Categories Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">{t('settings.categoriesTitle')}</CardTitle>
            <Button size="sm" onClick={openCatCreate}><Plus className="w-4 h-4 mr-1" />{t('settings.addCategory')}</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto w-full max-w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">{t('settings.categoryName')}</TableHead>
                  <TableHead className="whitespace-nowrap">{t('settings.badgeDesc')}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t('settings.badgeOrder')}</TableHead>
                  <TableHead className="whitespace-nowrap text-right">{t('settings.badgeManage')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingCats ? (
                  [...Array(3)].map((_, i) => (
                    <TableRow key={i}>{[...Array(4)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 bg-muted" /></TableCell>)}</TableRow>
                  ))
                ) : categories.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">{t('settings.noCategories')}</TableCell>
                  </TableRow>
                ) : categories.map(cat => (
                  <TableRow key={cat.id} className="hover:bg-muted/30">
                    <TableCell className="whitespace-nowrap font-medium text-sm text-foreground">{cat.name}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{cat.description || '-'}</TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm text-muted-foreground">{cat.sort_order}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => openCatEdit(cat)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="w-8 h-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteCat(cat)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Badge Form Dialog */}
      <Dialog open={showBadgeForm} onOpenChange={v => { if (!v) setShowBadgeForm(false); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5" />{editBadge ? t('settings.editBadgeTitle') : t('settings.newBadge')}
            </DialogTitle>
          </DialogHeader>
          {/* Preview */}
          <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
            <span className="text-xs text-muted-foreground">{t('settings.preview')}</span>
            <span
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium"
              style={{ backgroundColor: (watchColor || '#6366f1') + '33', color: watchColor || '#6366f1', border: `1px solid ${watchColor || '#6366f1'}66` }}
            >
              {watchEmoji || '🏷️'} {watchName || 'Badge Name'}
            </span>
          </div>
          <Form {...badgeForm}>
            <form onSubmit={badgeForm.handleSubmit(onSaveBadge)} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <FormField control={badgeForm.control} name="emoji" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">{t('settings.emojiLabel')}</FormLabel>
                    <FormControl><Input {...field} placeholder="🏷️" className="text-center text-lg" maxLength={4} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={badgeForm.control} name="name" render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel className="text-sm font-normal">{t('settings.badgeNameCol')} *</FormLabel>
                    <FormControl><Input {...field} placeholder="เช่น Senior Staff, MVP" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={badgeForm.control} name="color" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-normal">{t('settings.badgeColorLabel')}</FormLabel>
                  <div className="space-y-2">
                    {/* Preset colors */}
                    <div className="flex flex-wrap gap-2">
                      {PRESET_COLORS.map(c => (
                        <button
                          key={c} type="button"
                          onClick={() => badgeForm.setValue('color', c)}
                          className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                          style={{ backgroundColor: c, borderColor: field.value === c ? 'hsl(var(--foreground))' : 'transparent' }}
                        />
                      ))}
                    </div>
                    <FormControl>
                      <div className="flex items-center gap-2">
                        <input type="color" value={field.value} onChange={e => field.onChange(e.target.value)}
                          className="w-10 h-10 rounded cursor-pointer border border-border bg-transparent p-0.5" />
                        <Input {...field} placeholder="#6366f1" className="w-32 font-mono text-sm" />
                      </div>
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )} />
              {/* Preset emojis */}
              <div>
                <p className="text-sm font-normal mb-2">{t('settings.presetEmojis')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_EMOJIS.map(e => (
                    <button key={e} type="button" onClick={() => badgeForm.setValue('emoji', e)}
                      className={`text-lg w-9 h-9 rounded-lg flex items-center justify-center transition-colors hover:bg-muted ${badgeForm.watch('emoji') === e ? 'bg-muted ring-2 ring-primary' : ''}`}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
              <FormField control={badgeForm.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-normal">คำอธิบาย</FormLabel>
                  <FormControl><Input {...field} placeholder="คำอธิบาย Badge นี้" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={badgeForm.control} name="sort_order" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-normal">{t('settings.displayOrder')}</FormLabel>
                  <FormControl><Input {...field} type="number" min={0} className="w-24" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowBadgeForm(false)} disabled={savingBadge}>{t('common.cancel')}</Button>
                <Button type="submit" disabled={savingBadge}>{savingBadge ? t('settings.saving') : t('common.save')}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Category Form Dialog */}
      <Dialog open={showCatForm} onOpenChange={v => { if (!v) setShowCatForm(false); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <DialogHeader><DialogTitle>{editCat ? t('settings.editCategoryTitle') : t('settings.addCategoryTitle')}</DialogTitle></DialogHeader>
          <Form {...catForm}>
            <form onSubmit={catForm.handleSubmit(onSaveCat)} className="space-y-4">
              <FormField control={catForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-normal">{t('settings.categoryName')}</FormLabel>
                  <FormControl><Input {...field} placeholder={t('settings.categoryNamePlaceholder')} autoFocus /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={catForm.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-normal">คำอธิบาย</FormLabel>
                  <FormControl><Input {...field} placeholder="คำอธิบายเพิ่มเติม" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={catForm.control} name="sort_order" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-normal">{t('settings.displayOrder')}</FormLabel>
                  <FormControl><Input {...field} type="number" min={0} className="w-24" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setShowCatForm(false)} disabled={savingCat}>{t('common.cancel')}</Button>
                <Button type="submit" disabled={savingCat}>{savingCat ? t('settings.saving') : t('common.save')}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Badge Confirm */}
      <AlertDialog open={!!deleteBadge} onOpenChange={v => { if (!v) setDeleteBadge(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.deleteBadgeTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.deleteBadgeDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteBadge} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Category Confirm */}
      <AlertDialog open={!!deleteCat} onOpenChange={v => { if (!v) setDeleteCat(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.deleteCategory')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.deleteCategoryDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCat} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
