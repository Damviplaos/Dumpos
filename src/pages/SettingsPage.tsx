import { useEffect, useState } from 'react';
import { Save, Store, Phone, MapPin, Receipt, Bell, Percent, Plus, Pencil, Trash2, Send, Bot, CheckCircle, XCircle, AlertTriangle, Link2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Category, StoreSettings } from '@/types/types';
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

export default function SettingsPage() {
  const { profile } = useAuth();
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingTelegram, setSavingTelegram] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [registeringWebhook, setRegisteringWebhook] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [telegramStatus, setTelegramStatus] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [showCatForm, setShowCatForm] = useState(false);
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [deleteCat, setDeleteCat] = useState<Category | null>(null);
  const [savingCat, setSavingCat] = useState(false);

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

  useEffect(() => { loadSettings(); loadCategories(); }, []);

  const loadSettings = async () => {
    setLoadingSettings(true);
    const { data } = await supabase.from('store_settings').select('*').maybeSingle();
    if (data) {
      const s = data as StoreSettings;
      setSettings(s);
      settingsForm.reset({
        store_name: s.store_name,
        address: s.address || '',
        phone: s.phone || '',
        tax_rate: s.tax_rate,
        auto_print_receipt: s.auto_print_receipt,
        low_stock_threshold: s.low_stock_threshold,
        max_void_per_day: s.max_void_per_day || 5,
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

  const onSaveSettings = async (data: SettingsForm) => {
    setSavingSettings(true);
    const payload = {
      store_name: data.store_name,
      address: data.address || '',
      phone: data.phone || '',
      tax_rate: data.tax_rate,
      auto_print_receipt: data.auto_print_receipt,
      low_stock_threshold: data.low_stock_threshold,
      max_void_per_day: data.max_void_per_day,
      updated_at: new Date().toISOString(),
      store_id: profile?.store_id ?? null,
    };
    const { error } = settings?.id
      ? await supabase.from('store_settings').update(payload).eq('id', settings.id)
      : await supabase.from('store_settings').insert(payload);
    setSavingSettings(false);
    if (error) { toast.error('บันทึกการตั้งค่าไม่สำเร็จ'); return; }
    toast.success('บันทึกการตั้งค่าแล้ว');
    loadSettings();
  };

  const onSaveTelegram = async (data: TelegramForm) => {
    if (!settings?.id) { toast.error('กรุณาบันทึกข้อมูลร้านก่อน'); return; }
    setSavingTelegram(true);
    const { error } = await supabase.from('store_settings').update({
      telegram_bot_token: data.telegram_bot_token || null,
      telegram_chat_id: data.telegram_chat_id || null,
      updated_at: new Date().toISOString(),
    }).eq('id', settings.id);
    setSavingTelegram(false);
    if (error) { toast.error('บันทึก Telegram ไม่สำเร็จ'); return; }
    toast.success('บันทึกการตั้งค่า Telegram แล้ว');
    setTelegramStatus(data.telegram_bot_token && data.telegram_chat_id ? 'ok' : 'idle');
    loadSettings();
  };

  const onTestTelegram = async () => {
    const { telegram_bot_token, telegram_chat_id } = telegramForm.getValues();
    if (!telegram_bot_token || !telegram_chat_id) {
      toast.error('กรุณากรอก Bot Token และ Chat ID ก่อนทดสอบ');
      return;
    }
    setTestingTelegram(true);
    const { data, error } = await supabase.functions.invoke('send-telegram', {
      body: {
        bot_token: telegram_bot_token,
        chat_id: telegram_chat_id,
        with_menu: true,
        message: `✅ *ทดสอบการเชื่อมต่อ Telegram*\n\nการเชื่อมต่อ Telegram Bot สำเร็จ!\nร้าน: ${settings?.store_name || 'ร้านของฉัน'}\nเวลา: ${new Date().toLocaleString('th-TH')}\n\nกดปุ่มด้านล่างเพื่อดูรายงาน 👇`,
      },
    });
    setTestingTelegram(false);
    if (error || !data?.success) {
      setTelegramStatus('fail');
      toast.error('ทดสอบ Telegram ไม่สำเร็จ: Token หรือ Chat ID ไม่ถูกต้อง');
    } else {
      setTelegramStatus('ok');
      toast.success('ส่งข้อความทดสอบพร้อมปุ่มเมนูไปยัง Telegram สำเร็จ!');
    }
  };

  // Register telegram webhook with Telegram API
  const onRegisterWebhook = async () => {
    const { telegram_bot_token } = telegramForm.getValues();
    if (!telegram_bot_token) {
      toast.error('กรุณากรอก Bot Token ก่อน');
      return;
    }
    setRegisteringWebhook(true);
    // Webhook URL = our edge function URL
    const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-webhook`;
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${telegram_bot_token}/setWebhook`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: webhookUrl }),
        },
      );
      const result = await res.json();
      setRegisteringWebhook(false);
      if (result.ok) {
        setWebhookStatus('ok');
        toast.success('ลงทะเบียน Webhook สำเร็จ! Bot รับคำสั่งได้แล้ว');
      } else {
        setWebhookStatus('fail');
        toast.error('ลงทะเบียน Webhook ไม่สำเร็จ: ' + (result.description || 'unknown error'));
      }
    } catch (e) {
      setRegisteringWebhook(false);
      setWebhookStatus('fail');
      toast.error('เกิดข้อผิดพลาด: ' + String(e));
    }
  };

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
    if (error) { toast.error(`บันทึกไม่สำเร็จ: ${error.message}`); return; }
    toast.success(editCat ? 'แก้ไขหมวดหมู่แล้ว' : 'เพิ่มหมวดหมู่แล้ว');
    setShowCatForm(false);
    loadCategories();
  };

  const handleDeleteCat = async () => {
    if (!deleteCat) return;
    const { error } = await supabase.from('categories').delete().eq('id', deleteCat.id);
    if (error) { toast.error('ลบหมวดหมู่ไม่สำเร็จ: มีสินค้าอยู่ในหมวดหมู่นี้'); return; }
    toast.success('ลบหมวดหมู่แล้ว');
    setDeleteCat(null);
    loadCategories();
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold text-foreground text-balance">ตั้งค่าร้าน</h2>
        <p className="text-sm text-muted-foreground mt-0.5">จัดการข้อมูลร้านและการตั้งค่าระบบ</p>
      </div>

      {/* Store Settings Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Store className="w-4 h-4 text-primary" />
            ข้อมูลร้านและการตั้งค่า
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingSettings ? (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10 bg-muted" />)}
            </div>
          ) : (
            <Form {...settingsForm}>
              <form onSubmit={settingsForm.handleSubmit(onSaveSettings)} className="space-y-4">
                <FormField control={settingsForm.control} name="store_name" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal flex items-center gap-1.5"><Store className="w-3.5 h-3.5" />ชื่อร้าน *</FormLabel>
                    <FormControl><Input {...field} placeholder="ร้านของฉัน" /></FormControl>
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
                    <FormLabel className="text-sm font-normal flex items-center gap-1.5"><Bell className="w-3.5 h-3.5" />จำนวนสต็อกขั้นต่ำสำหรับแจ้งเตือน</FormLabel>
                    <FormControl><Input {...field} type="number" min={1} className="w-32" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={settingsForm.control} name="max_void_per_day" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-yellow-600" />
                      จำนวนการยกเลิกบิลสูงสุดต่อวัน (ก่อนแจ้งเตือน Fraud)
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
                  <Save className="w-4 h-4 mr-1.5" />
                  {savingSettings ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
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
              <Bot className="w-4 h-4 text-primary" />
              Telegram Bot แจ้งเตือน
            </CardTitle>
            <div className="flex items-center gap-2">
              {telegramStatus === 'ok' && (
                <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 gap-1 text-xs">
                  <CheckCircle className="w-3 h-3" /> เชื่อมต่อแล้ว
                </Badge>
              )}
              {telegramStatus === 'fail' && (
                <Badge className="bg-destructive/10 text-destructive gap-1 text-xs">
                  <XCircle className="w-3 h-3" /> เชื่อมต่อไม่ได้
                </Badge>
              )}
              {webhookStatus === 'ok' && (
                <Badge className="bg-info/10 text-info gap-1 text-xs">
                  <Link2 className="w-3 h-3" /> Webhook ใช้งานได้
                </Badge>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            รับแจ้งเตือนและสั่งดูรายงานผ่าน Telegram Bot ได้โดยตรง
          </p>
        </CardHeader>
        <CardContent>
          {loadingSettings ? (
            <div className="space-y-3">
              <Skeleton className="h-10 bg-muted" />
              <Skeleton className="h-10 bg-muted" />
            </div>
          ) : (
            <Form {...telegramForm}>
              <form onSubmit={telegramForm.handleSubmit(onSaveTelegram)} className="space-y-4">
                <FormField control={telegramForm.control} name="telegram_bot_token" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">Telegram Bot Token</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="1234567890:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        type="password"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">สร้าง Bot ผ่าน @BotFather แล้วคัดลอก Token มาใส่</p>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={telegramForm.control} name="telegram_chat_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">Telegram Chat ID</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="-1001234567890 หรือ 123456789" />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">ส่ง /start ให้ Bot แล้วใช้ @userinfobot เพื่อรับ Chat ID</p>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={savingTelegram}>
                    <Save className="w-4 h-4 mr-1.5" />
                    {savingTelegram ? 'กำลังบันทึก...' : 'บันทึก'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={testingTelegram}
                    onClick={onTestTelegram}
                  >
                    <Send className="w-4 h-4 mr-1.5" />
                    {testingTelegram ? 'กำลังทดสอบ...' : 'ทดสอบ + เมนู'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={registeringWebhook}
                    onClick={onRegisterWebhook}
                  >
                    <Link2 className="w-4 h-4 mr-1.5" />
                    {registeringWebhook ? 'กำลังลงทะเบียน...' : 'ตั้งค่า Webhook'}
                  </Button>
                </div>

                {/* Webhook URL display */}
                <div className="p-3 bg-muted rounded-lg space-y-2">
                  <p className="text-xs font-medium text-foreground">Webhook URL (สำหรับอ้างอิง):</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-muted-foreground bg-background border border-border rounded px-2 py-1 flex-1 min-w-0 truncate">
                      {`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-webhook`}
                    </code>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/telegram-webhook`,
                        );
                        toast.success('คัดลอก URL แล้ว');
                      }}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Bot commands info */}
                <div className="p-3 bg-muted rounded-lg space-y-1.5">
                  <p className="text-xs font-medium text-foreground">คำสั่งที่รองรับใน Telegram:</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                    {[
                      ['/start', 'เมนูหลัก'],
                      ['/today', 'รายงานวันนี้'],
                      ['/yesterday', 'รายงานเมื่อวาน'],
                      ['/week', 'ยอดขาย 7 วัน'],
                      ['/stock', 'สต็อกสินค้าต่ำ'],
                      ['/alerts', 'แจ้งเตือนล่าสุด'],
                    ].map(([cmd, desc]) => (
                      <div key={cmd} className="flex items-center gap-1.5">
                        <code className="text-xs text-primary font-mono">{cmd}</code>
                        <span className="text-xs text-muted-foreground">— {desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-3 bg-muted rounded-lg space-y-1">
                  <p className="text-xs font-medium text-foreground">ระบบจะส่งแจ้งเตือนอัตโนมัติเมื่อ:</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                    <li>ตรวจพบการพยายามยักยอกทรัพย์ (Critical Alert)</li>
                    <li>มี Fraud Alert ใหม่ทุกระดับความเสี่ยง</li>
                    <li>ออกใบเตือนพนักงาน (ใบเหลือง/ใบแดง)</li>
                  </ul>
                </div>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>

      {/* Categories Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">หมวดหมู่สินค้า</CardTitle>
            <Button size="sm" onClick={openCatCreate}>
              <Plus className="w-4 h-4 mr-1" />เพิ่ม
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto w-full max-w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">ชื่อหมวดหมู่</TableHead>
                  <TableHead className="whitespace-nowrap">คำอธิบาย</TableHead>
                  <TableHead className="whitespace-nowrap text-right">ลำดับ</TableHead>
                  <TableHead className="whitespace-nowrap text-right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingCats ? (
                  [...Array(3)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(4)].map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-5 bg-muted" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : categories.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                      ยังไม่มีหมวดหมู่ คลิก "เพิ่ม" เพื่อสร้าง
                    </TableCell>
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

      {/* Category Form Dialog */}
      <Dialog open={showCatForm} onOpenChange={v => { if (!v) setShowCatForm(false); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editCat ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่'}</DialogTitle>
          </DialogHeader>
          <Form {...catForm}>
            <form onSubmit={catForm.handleSubmit(onSaveCat)} className="space-y-4">
              <FormField control={catForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-normal">ชื่อหมวดหมู่ *</FormLabel>
                  <FormControl><Input {...field} placeholder="เช่น อาหาร, เครื่องดื่ม" autoFocus /></FormControl>
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
                  <FormLabel className="text-sm font-normal">ลำดับการแสดงผล</FormLabel>
                  <FormControl><Input {...field} type="number" min={0} className="w-24" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setShowCatForm(false)} disabled={savingCat}>ยกเลิก</Button>
                <Button type="submit" disabled={savingCat}>{savingCat ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Category Confirm */}
      <AlertDialog open={!!deleteCat} onOpenChange={v => { if (!v) setDeleteCat(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>ลบหมวดหมู่</AlertDialogTitle>
            <AlertDialogDescription>
              ต้องการลบหมวดหมู่ <strong>{deleteCat?.name}</strong>?<br />
              สินค้าในหมวดหมู่นี้จะไม่มีหมวดหมู่
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCat} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              ลบหมวดหมู่
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
