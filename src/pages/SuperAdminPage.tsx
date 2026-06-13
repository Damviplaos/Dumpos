import { useEffect, useState, useCallback } from 'react';
import {
  Users, ShieldAlert, FileText, Settings2, Bot,
  CheckCircle, XCircle, Send, RefreshCw, AlertTriangle,
  Eye, EyeOff, Activity, Globe, Lock, Unlock, Save, TrendingUp, Plus,
  Building2, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/db/supabase';
import { formatDate, formatCurrency } from '@/lib/utils';
import type { Profile, Store as StoreType, StoreSettings, WarningRecord } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';

// ----- Types -----
interface StoreWithStats extends StoreSettings {
  user_count?: number;
  total_sales?: number;
}

interface StoreRow extends StoreType {
  user_count?: number;
  total_sales?: number;
  owner?: Pick<Profile, 'username' | 'full_name'> | null;
}

interface FraudAlert {
  id: string;
  created_at: string;
  alert_type: string;
  severity: string;
  description: string;
  cashier_id: string | null;
  transaction_id: string | null;
  is_reviewed: boolean;
  cashier?: Pick<Profile, 'username' | 'full_name'> | null;
}

interface AuditLog {
  id: string;
  created_at: string;
  user_id: string | null;
  username: string | null;
  action: string;
  entity_type: string;
  details: Record<string, unknown>;
  severity: string;
}

// ----- Schemas -----
const createStoreSchema = z.object({
  store_name: z.string().min(1, 'กรุณากรอกชื่อร้าน'),
  store_address: z.string().optional(),
  store_phone: z.string().optional(),
  owner_username: z.string().min(3, 'ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร').regex(/^[a-zA-Z0-9_]+$/, 'ใช้ได้เฉพาะ a-z, 0-9, _'),
  owner_password: z.string().min(6, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'),
  owner_full_name: z.string().optional(),
});
type CreateStoreForm = z.infer<typeof createStoreSchema>;

// ----- Sub-components -----
function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    critical: 'bg-destructive text-destructive-foreground',
    warning: 'bg-yellow-500 text-white',
    info: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  };
  return <Badge className={`text-xs ${map[severity] || 'bg-muted text-muted-foreground'}`}>{severity}</Badge>;
}

function WarningBadge({ status }: { status: string }) {
  if (status === 'red_card') return <Badge className="bg-destructive text-destructive-foreground text-xs gap-1"><XCircle className="w-3 h-3" /> ใบแดง</Badge>;
  if (status === 'yellow_card') return <Badge className="bg-yellow-500 text-white text-xs gap-1"><AlertTriangle className="w-3 h-3" /> ใบเหลือง</Badge>;
  return <Badge variant="secondary" className="bg-green-500/10 text-green-700 dark:text-green-400 text-xs">ปกติ</Badge>;
}

const telegramSchema = z.object({
  telegram_bot_token: z.string().optional(),
  telegram_chat_id: z.string().optional(),
});
type TelegramForm = z.infer<typeof telegramSchema>;

const sysSchema = z.object({ value: z.string() });
type SysForm = z.infer<typeof sysSchema>;

// ----- Main Component -----
export default function SuperAdminPage() {
  const [activeTab, setActiveTab] = useState('overview');

  // Legacy store settings (single store)
  const [store, setStore] = useState<StoreWithStats | null>(null);
  const [loadingStore, setLoadingStore] = useState(true);

  // Multi-tenant stores
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [loadingStores, setLoadingStores] = useState(false);
  const [showCreateStore, setShowCreateStore] = useState(false);
  const [creatingStore, setCreatingStore] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<StoreRow | null>(null);

  const createStoreForm = useForm<CreateStoreForm>({
    resolver: zodResolver(createStoreSchema),
    defaultValues: { store_name: '', store_address: '', store_phone: '', owner_username: '', owner_password: '', owner_full_name: '' },
  });

  // Users
  const [users, setUsers] = useState<Profile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [warningHistory, setWarningHistory] = useState<WarningRecord[]>([]);
  const [historyUser, setHistoryUser] = useState<Profile | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [resetTarget, setResetTarget] = useState<Profile | null>(null);

  // Audit Log
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Fraud Alerts
  const [fraudAlerts, setFraudAlerts] = useState<FraudAlert[]>([]);
  const [loadingFraud, setLoadingFraud] = useState(false);

  // Telegram mgmt
  const [telegramStatus, setTelegramStatus] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [savingTelegram, setSavingTelegram] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [showToken, setShowToken] = useState(false);

  // System settings
  const [sysSettings, setSysSettings] = useState<Record<string, string>>({});
  const [loadingSys, setLoadingSys] = useState(false);
  const [savingSys, setSavingSys] = useState<string | null>(null);

  const telegramForm = useForm<TelegramForm>({
    resolver: zodResolver(telegramSchema),
    defaultValues: { telegram_bot_token: '', telegram_chat_id: '' },
  });

  const sysForm = useForm<SysForm>({ defaultValues: { value: '' } });

  // ---------- Data loading ----------
  const loadStore = useCallback(async () => {
    setLoadingStore(true);
    const { data } = await supabase.from('store_settings').select('*').maybeSingle();
    if (data) {
      const s = data as StoreSettings;
      const [usersRes, salesRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('transactions').select('total').eq('status', 'completed'),
      ]);
      const total = Array.isArray(salesRes.data)
        ? salesRes.data.reduce((sum, t) => sum + (t.total || 0), 0)
        : 0;
      setStore({ ...s, user_count: usersRes.count || 0, total_sales: total });
      telegramForm.reset({
        telegram_bot_token: s.telegram_bot_token || '',
        telegram_chat_id: s.telegram_chat_id || '',
      });
      if (s.telegram_bot_token && s.telegram_chat_id) setTelegramStatus('ok');
    }
    setLoadingStore(false);
  }, [telegramForm]);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    const { data } = await supabase.from('profiles').select('*, custom_role:roles(*)').order('role').order('created_at');
    setUsers(Array.isArray(data) ? data as Profile[] : []);
    setLoadingUsers(false);
  }, []);

  // ---------- Multi-tenant Stores ----------
  const loadStores = useCallback(async () => {
    setLoadingStores(true);
    const { data: storeRows } = await supabase
      .from('stores')
      .select('*')
      .order('created_at', { ascending: false });

    if (!Array.isArray(storeRows)) { setLoadingStores(false); return; }

    // เพิ่มสถิติแต่ละร้าน
    const enriched: StoreRow[] = await Promise.all(
      storeRows.map(async (s) => {
        const [usersRes, salesRes, ownerRes] = await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('store_id', s.id),
          supabase.from('transactions').select('total').eq('store_id', s.id).eq('status', 'completed'),
          supabase.from('profiles').select('username, full_name').eq('store_id', s.id).eq('role', 'store_owner').maybeSingle(),
        ]);
        const total = Array.isArray(salesRes.data)
          ? salesRes.data.reduce((sum: number, t: { total: number }) => sum + (t.total || 0), 0)
          : 0;
        return {
          ...s,
          user_count: usersRes.count || 0,
          total_sales: total,
          owner: ownerRes.data as Pick<Profile, 'username' | 'full_name'> | null,
        } as StoreRow;
      }),
    );
    setStores(enriched);
    setLoadingStores(false);
  }, []);

  const onCreateStore = async (data: CreateStoreForm) => {
    setCreatingStore(true);
    const { data: result, error } = await supabase.functions.invoke('create-store', {
      body: {
        store_name: data.store_name,
        store_address: data.store_address || '',
        store_phone: data.store_phone || '',
        owner_username: data.owner_username,
        owner_password: data.owner_password,
        owner_full_name: data.owner_full_name || '',
      },
    });
    setCreatingStore(false);
    if (error || !result?.success) {
      const msg = result?.error || (await error?.context?.text?.()) || 'สร้างร้านไม่สำเร็จ';
      toast.error(msg);
      return;
    }
    toast.success(result.message || 'สร้างร้านและบัญชีเจ้าของร้านสำเร็จ');
    setShowCreateStore(false);
    createStoreForm.reset();
    loadStores();
  };

  const toggleStoreActive = async (s: StoreRow) => {
    const { error } = await supabase.from('stores').update({ is_active: !s.is_active }).eq('id', s.id);
    if (error) { toast.error('เปลี่ยนสถานะร้านไม่สำเร็จ'); return; }
    toast.success(`${!s.is_active ? 'เปิด' : 'ปิด'}ร้าน "${s.name}" แล้ว`);
    setToggleTarget(null);
    loadStores();
  };

  const loadAudit = useCallback(async () => {
    setLoadingAudit(true);
    const { data } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100);
    setAuditLogs(Array.isArray(data) ? data as AuditLog[] : []);
    setLoadingAudit(false);
  }, []);

  const loadFraud = useCallback(async () => {
    setLoadingFraud(true);
    const { data } = await supabase
      .from('fraud_alerts')
      .select('*, cashier:profiles!fraud_alerts_cashier_id_fkey(username, full_name)')
      .order('created_at', { ascending: false })
      .limit(100);
    setFraudAlerts(Array.isArray(data) ? data as FraudAlert[] : []);
    setLoadingFraud(false);
  }, []);

  const loadSysSettings = useCallback(async () => {
    setLoadingSys(true);
    const { data } = await supabase.from('system_settings').select('*');
    if (Array.isArray(data)) {
      const map: Record<string, string> = {};
      data.forEach((s: { key: string; value: string | null }) => { map[s.key] = s.value || ''; });
      setSysSettings(map);
    }
    setLoadingSys(false);
  }, []);

  useEffect(() => {
    loadStore();
    loadUsers();
    loadStores();
  }, [loadStore, loadUsers, loadStores]);

  useEffect(() => {
    if (activeTab === 'audit') loadAudit();
    if (activeTab === 'fraud') loadFraud();
    if (activeTab === 'system') loadSysSettings();
    if (activeTab === 'stores') loadStores();
  }, [activeTab, loadAudit, loadFraud, loadSysSettings, loadStores]);

  // ---------- Telegram ----------
  const onSaveTelegram = async (data: TelegramForm) => {
    if (!store?.id) return;
    setSavingTelegram(true);
    const { error } = await supabase.from('store_settings').update({
      telegram_bot_token: data.telegram_bot_token || null,
      telegram_chat_id: data.telegram_chat_id || null,
      updated_at: new Date().toISOString(),
    }).eq('id', store.id);
    setSavingTelegram(false);
    if (error) { toast.error('บันทึกไม่สำเร็จ'); return; }
    toast.success('บันทึกการตั้งค่า Telegram แล้ว');
    setTelegramStatus(data.telegram_bot_token && data.telegram_chat_id ? 'ok' : 'idle');
    loadStore();
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
        message: `✅ *ทดสอบจาก Super Admin*\n\nการเชื่อมต่อ Telegram Bot สำเร็จ!\nร้าน: ${store?.store_name || 'ร้านของฉัน'}\nเวลา: ${new Date().toLocaleString('th-TH')}`,
      },
    });
    setTestingTelegram(false);
    if (error || !data?.success) {
      setTelegramStatus('fail');
      toast.error('ทดสอบไม่สำเร็จ: Token หรือ Chat ID ไม่ถูกต้อง');
    } else {
      setTelegramStatus('ok');
      toast.success('ส่งข้อความทดสอบสำเร็จ!');
    }
  };

  // ---------- Fraud Alert review ----------
  const reviewFraud = async (id: string, reviewed: boolean) => {
    await supabase.from('fraud_alerts').update({ is_reviewed: reviewed }).eq('id', id);
    setFraudAlerts(prev => prev.map(f => f.id === id ? { ...f, is_reviewed: reviewed } : f));
    toast.success(reviewed ? 'ทำเครื่องหมายว่าตรวจสอบแล้ว' : 'ยกเลิกการตรวจสอบ');
  };

  // ---------- Reset warning_status ----------
  const resetWarning = async () => {
    if (!resetTarget) return;
    const { error } = await supabase.from('profiles')
      .update({ warning_status: 'normal' })
      .eq('id', resetTarget.id);
    if (error) { toast.error('แก้ไขสถานะไม่สำเร็จ'); return; }
    toast.success(`รีเซ็ตสถานะใบเตือนของ ${resetTarget.username} แล้ว`);
    setResetTarget(null);
    loadUsers();
  };

  // ---------- View warning history ----------
  const openHistory = async (user: Profile) => {
    setHistoryUser(user);
    setLoadingHistory(true);
    const { data } = await supabase
      .from('warning_records')
      .select('*, issuer:profiles!warning_records_issued_by_fkey(username, full_name)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setWarningHistory(Array.isArray(data) ? data as WarningRecord[] : []);
    setLoadingHistory(false);
  };

  // ---------- System Settings ----------
  const onSaveSys = async (key: string, value: string) => {
    setSavingSys(key);
    const { error } = await supabase.from('system_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    setSavingSys(null);
    if (error) { toast.error('บันทึกไม่สำเร็จ'); return; }
    setSysSettings(prev => ({ ...prev, [key]: value }));
    toast.success('บันทึก System Setting แล้ว');
  };

  // ---------- Toggle user active ----------
  const toggleUserActive = async (user: Profile) => {
    const { error } = await supabase.from('profiles')
      .update({ is_active: !user.is_active })
      .eq('id', user.id);
    if (error) { toast.error('แก้ไขสถานะไม่สำเร็จ'); return; }
    toast.success(`${user.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'} ${user.username} แล้ว`);
    loadUsers();
  };

  // ---------- Stats Cards ----------
  const statsCards = [
    { label: 'ร้านค้าทั้งหมด', value: String(stores.length || '—'), icon: Building2, color: 'text-violet-600' },
    { label: 'ร้านที่เปิดอยู่', value: String(stores.filter(s => s.is_active).length || '—'), icon: TrendingUp, color: 'text-green-600' },
    { label: 'Fraud Alerts', value: String(fraudAlerts.filter(f => !f.is_reviewed).length) || '—', icon: ShieldAlert, color: 'text-destructive' },
    { label: 'Telegram', value: telegramStatus === 'ok' ? 'เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ', icon: Bot, color: telegramStatus === 'ok' ? 'text-green-600' : 'text-muted-foreground' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-600/10 flex items-center justify-center shrink-0">
          <Globe className="w-5 h-5 text-violet-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground text-balance">Super Admin Panel</h2>
          <p className="text-sm text-muted-foreground">ควบคุมและตรวจสอบระบบทั้งหมดในฐานะเจ้าของโปรแกรม</p>
        </div>
      </div>

      {/* Stats row */}
      {loadingStore ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 bg-muted rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statsCards.map(s => (
            <Card key={s.label} className="h-full">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <p className="text-xl font-bold text-foreground">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full flex flex-wrap h-auto gap-1 bg-muted p-1">
          <TabsTrigger value="overview" className="flex items-center gap-1.5 text-xs"><Activity className="w-3.5 h-3.5" />ภาพรวม</TabsTrigger>
          <TabsTrigger value="stores" className="flex items-center gap-1.5 text-xs"><Building2 className="w-3.5 h-3.5" />จัดการร้านค้า</TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-1.5 text-xs"><Users className="w-3.5 h-3.5" />ผู้ใช้ทั้งหมด</TabsTrigger>
          <TabsTrigger value="fraud" className="flex items-center gap-1.5 text-xs"><ShieldAlert className="w-3.5 h-3.5" />Fraud Alerts</TabsTrigger>
          <TabsTrigger value="audit" className="flex items-center gap-1.5 text-xs"><FileText className="w-3.5 h-3.5" />Audit Log</TabsTrigger>
          <TabsTrigger value="telegram" className="flex items-center gap-1.5 text-xs"><Bot className="w-3.5 h-3.5" />Telegram</TabsTrigger>
          <TabsTrigger value="system" className="flex items-center gap-1.5 text-xs"><Settings2 className="w-3.5 h-3.5" />System Settings</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Building2 className="w-4 h-4 text-violet-600" />ร้านค้าในระบบ</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">{stores.length}</p>
                <p className="text-xs text-muted-foreground mt-1">เปิดอยู่ {stores.filter(s => s.is_active).length} ร้าน</p>
                <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setActiveTab('stores')}>
                  จัดการร้านค้า
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Bot className="w-4 h-4 text-primary" />สถานะ Telegram Bot</CardTitle>
              </CardHeader>
              <CardContent>
                {telegramStatus === 'ok' ? (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="w-5 h-5" />
                    <div>
                      <p className="text-sm font-medium">เชื่อมต่อแล้ว</p>
                      <p className="text-xs text-muted-foreground">Chat ID: {store?.telegram_chat_id}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <XCircle className="w-5 h-5" />
                    <p className="text-sm">ยังไม่ได้ตั้งค่า Telegram</p>
                  </div>
                )}
                <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setActiveTab('telegram')}>
                  ตั้งค่า Telegram
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-destructive" />Fraud Alerts ที่ยังไม่ตรวจสอบ</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">{fraudAlerts.filter(f => !f.is_reviewed).length}</p>
                <p className="text-xs text-muted-foreground mt-1">จากทั้งหมด {fraudAlerts.length} รายการ</p>
                <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setActiveTab('fraud')}>
                  ดู Fraud Alerts
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Stores Tab */}
        <TabsContent value="stores" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4 text-violet-600" />
                ร้านค้าทั้งหมดในระบบ
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="w-8 h-8" onClick={loadStores} title="รีเฟรช">
                  <RefreshCw className="w-4 h-4" />
                </Button>
                <Button size="sm" className="gap-1.5 h-8" onClick={() => setShowCreateStore(true)}>
                  <Plus className="w-3.5 h-3.5" />
                  เพิ่มร้านใหม่
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto w-full max-w-full">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">ชื่อร้าน</TableHead>
                      <TableHead className="whitespace-nowrap">เจ้าของร้าน</TableHead>
                      <TableHead className="whitespace-nowrap text-center">พนักงาน</TableHead>
                      <TableHead className="whitespace-nowrap text-right">ยอดขายรวม</TableHead>
                      <TableHead className="whitespace-nowrap text-center">สถานะ</TableHead>
                      <TableHead className="whitespace-nowrap">สร้างเมื่อ</TableHead>
                      <TableHead className="whitespace-nowrap text-right">จัดการ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingStores ? (
                      [...Array(3)].map((_, i) => (
                        <TableRow key={i}>
                          {[...Array(7)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 bg-muted" /></TableCell>)}
                        </TableRow>
                      ))
                    ) : stores.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-sm">
                          ยังไม่มีร้านค้า — กดปุ่ม "เพิ่มร้านใหม่" เพื่อเริ่มต้น
                        </TableCell>
                      </TableRow>
                    ) : stores.map(s => (
                      <TableRow key={s.id} className="hover:bg-muted/30">
                        <TableCell className="whitespace-nowrap">
                          <div>
                            <p className="text-sm font-medium">{s.name}</p>
                            {s.address && <p className="text-xs text-muted-foreground truncate max-w-32">{s.address}</p>}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {s.owner ? (
                            <div>
                              <p className="text-sm text-foreground">@{s.owner.username}</p>
                              {s.owner.full_name && <p className="text-xs text-muted-foreground">{s.owner.full_name}</p>}
                            </div>
                          ) : <span className="text-xs text-muted-foreground">ยังไม่มีเจ้าของ</span>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center text-sm">{s.user_count ?? '—'}</TableCell>
                        <TableCell className="whitespace-nowrap text-right text-sm font-medium">
                          {formatCurrency(s.total_sales || 0)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center">
                          <Badge className={`text-xs gap-1 ${s.is_active ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
                            {s.is_active ? <><CheckCircle className="w-3 h-3" />เปิดอยู่</> : <><XCircle className="w-3 h-3" />ปิดอยู่</>}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDate(s.created_at, 'short')}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          <Button
                            variant="ghost" size="icon"
                            className={`w-8 h-8 ${s.is_active ? 'text-destructive hover:bg-destructive/10' : 'text-green-600 hover:bg-green-500/10'}`}
                            title={s.is_active ? 'ปิดร้าน' : 'เปิดร้าน'}
                            onClick={() => setToggleTarget(s)}
                          >
                            {s.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="mt-4">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">ผู้ใช้งานทั้งหมดในระบบ</CardTitle>
              <Button variant="ghost" size="icon" className="w-8 h-8" onClick={loadUsers} title="รีเฟรช">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto w-full max-w-full">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">ผู้ใช้</TableHead>
                      <TableHead className="whitespace-nowrap text-center">ระดับ</TableHead>
                      <TableHead className="whitespace-nowrap text-center">ใบเตือน</TableHead>
                      <TableHead className="whitespace-nowrap text-center">สถานะ</TableHead>
                      <TableHead className="whitespace-nowrap">เพิ่มเมื่อ</TableHead>
                      <TableHead className="whitespace-nowrap text-right">จัดการ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingUsers ? (
                      [...Array(5)].map((_, i) => (
                        <TableRow key={i}>
                          {[...Array(6)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 bg-muted" /></TableCell>)}
                        </TableRow>
                      ))
                    ) : users.map(user => {
                      const roleLabel = user.role === 'super_admin' ? 'ซุปเปอร์แอดมิน' : user.role === 'admin' ? 'แอดมิน' : 'พนักงาน';
                      const roleColor = user.role === 'super_admin' ? '#7C3AED' : user.role === 'admin' ? '#0A4D3C' : '#3B82F6';
                      const ws = user.warning_status || 'normal';
                      return (
                        <TableRow key={user.id} className={`hover:bg-muted/30 ${ws === 'red_card' ? 'bg-destructive/5' : ws === 'yellow_card' ? 'bg-yellow-500/5' : ''}`}>
                          <TableCell className="whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <Avatar className="w-8 h-8 shrink-0">
                                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                                  {user.username.charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{user.full_name || user.username}</p>
                                <p className="text-xs text-muted-foreground">@{user.username}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-center">
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: roleColor + '22', color: roleColor }}>
                              {roleLabel}
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-center">
                            <div className="flex items-center justify-center gap-1">
                              <WarningBadge status={ws} />
                              <Button variant="ghost" size="icon" className="w-6 h-6 text-muted-foreground" onClick={() => openHistory(user)}>
                                <Eye className="w-3 h-3" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-center">
                            <Badge variant="secondary" className={`text-xs ${user.is_active ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
                              {user.is_active ? 'ใช้งาน' : 'ปิดใช้'}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(user.created_at, 'short')}</TableCell>
                          <TableCell className="whitespace-nowrap text-right">
                            {user.role !== 'super_admin' && (
                              <div className="flex items-center justify-end gap-1">
                                {ws !== 'normal' && (
                                  <Button
                                    variant="ghost" size="icon" className="w-8 h-8 text-green-600 hover:bg-green-500/10"
                                    title="รีเซ็ตใบเตือน"
                                    onClick={() => setResetTarget(user)}
                                  >
                                    <Unlock className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost" size="icon"
                                  className={`w-8 h-8 ${user.is_active ? 'text-destructive hover:bg-destructive/10' : 'text-green-600 hover:bg-green-500/10'}`}
                                  title={user.is_active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                                  onClick={() => toggleUserActive(user)}
                                >
                                  {user.is_active ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Fraud Alerts Tab */}
        <TabsContent value="fraud" className="mt-4">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-destructive" />Fraud Alerts</CardTitle>
              <Button variant="ghost" size="icon" className="w-8 h-8" onClick={loadFraud}><RefreshCw className="w-4 h-4" /></Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto w-full max-w-full">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">เวลา</TableHead>
                      <TableHead className="whitespace-nowrap">ประเภท</TableHead>
                      <TableHead className="whitespace-nowrap text-center">ระดับ</TableHead>
                      <TableHead className="whitespace-nowrap">รายละเอียด</TableHead>
                      <TableHead className="whitespace-nowrap">พนักงาน</TableHead>
                      <TableHead className="whitespace-nowrap text-center">สถานะ</TableHead>
                      <TableHead className="whitespace-nowrap text-right">จัดการ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingFraud ? (
                      [...Array(4)].map((_, i) => (
                        <TableRow key={i}>{[...Array(7)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 bg-muted" /></TableCell>)}</TableRow>
                      ))
                    ) : fraudAlerts.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-sm">ไม่มี Fraud Alerts</TableCell></TableRow>
                    ) : fraudAlerts.map(f => (
                      <TableRow key={f.id} className={`hover:bg-muted/30 ${!f.is_reviewed && f.severity === 'critical' ? 'bg-destructive/5' : ''}`}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(f.created_at, 'short')}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{f.alert_type}</TableCell>
                        <TableCell className="whitespace-nowrap text-center"><SeverityBadge severity={f.severity} /></TableCell>
                        <TableCell className="text-sm max-w-48 truncate">{f.description}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {f.cashier?.full_name || f.cashier?.username || '-'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-center">
                          <Badge variant="secondary" className={`text-xs ${f.is_reviewed ? 'bg-muted text-muted-foreground' : 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'}`}>
                            {f.is_reviewed ? 'ตรวจสอบแล้ว' : 'รอตรวจสอบ'}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          <Button
                            variant="ghost" size="icon" className="w-8 h-8"
                            title={f.is_reviewed ? 'ยกเลิกการตรวจสอบ' : 'ทำเครื่องหมายตรวจสอบแล้ว'}
                            onClick={() => reviewFraud(f.id, !f.is_reviewed)}
                          >
                            {f.is_reviewed ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5 text-green-600" />}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit Log Tab */}
        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4" />บันทึกกิจกรรม (100 รายการล่าสุด)</CardTitle>
              <Button variant="ghost" size="icon" className="w-8 h-8" onClick={loadAudit}><RefreshCw className="w-4 h-4" /></Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto w-full max-w-full">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">เวลา</TableHead>
                      <TableHead className="whitespace-nowrap">ผู้ใช้</TableHead>
                      <TableHead className="whitespace-nowrap">กิจกรรม</TableHead>
                      <TableHead className="whitespace-nowrap">หมวด</TableHead>
                      <TableHead className="whitespace-nowrap text-center">ระดับ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingAudit ? (
                      [...Array(6)].map((_, i) => (
                        <TableRow key={i}>{[...Array(5)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 bg-muted" /></TableCell>)}</TableRow>
                      ))
                    ) : auditLogs.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground text-sm">ไม่มีบันทึก</TableCell></TableRow>
                    ) : auditLogs.map(log => (
                      <TableRow key={log.id} className="hover:bg-muted/30">
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(log.created_at, 'short')}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{log.username || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm font-mono">{log.action}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{log.entity_type}</TableCell>
                        <TableCell className="whitespace-nowrap text-center"><SeverityBadge severity={log.severity} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Telegram Tab */}
        <TabsContent value="telegram" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Bot className="w-4 h-4 text-primary" />
                  ตั้งค่า Telegram Bot ของร้าน
                </CardTitle>
                {telegramStatus === 'ok' && (
                  <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 gap-1 text-xs shrink-0">
                    <CheckCircle className="w-3 h-3" /> เชื่อมต่อแล้ว
                  </Badge>
                )}
                {telegramStatus === 'fail' && (
                  <Badge className="bg-destructive/10 text-destructive gap-1 text-xs shrink-0">
                    <XCircle className="w-3 h-3" /> เชื่อมต่อไม่ได้
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                ข้อมูล Bot Token และ Chat ID ที่เจ้าของร้านตั้งค่าไว้ สามารถแก้ไขได้จากที่นี่
              </p>
            </CardHeader>
            <CardContent>
              <Form {...telegramForm}>
                <form onSubmit={telegramForm.handleSubmit(onSaveTelegram)} className="space-y-4">
                  <FormField control={telegramForm.control} name="telegram_bot_token" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-normal">Telegram Bot Token</FormLabel>
                      <div className="relative">
                        <FormControl>
                          <Input
                            {...field}
                            type={showToken ? 'text' : 'password'}
                            placeholder="1234567890:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                            className="pr-10"
                          />
                        </FormControl>
                        <Button
                          type="button" variant="ghost" size="icon"
                          className="absolute right-1 top-1 w-8 h-8 text-muted-foreground"
                          onClick={() => setShowToken(v => !v)}
                        >
                          {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">รับ Token จาก @BotFather บน Telegram</p>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={telegramForm.control} name="telegram_chat_id" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-normal">Telegram Chat ID</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="-1001234567890 หรือ 123456789" />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">ใช้ @userinfobot หรือ API getUpdates เพื่อรับ Chat ID</p>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <Separator />
                  <div className="p-3 bg-muted rounded-lg space-y-1">
                    <p className="text-xs font-medium text-foreground">ระบบจะส่ง Telegram แจ้งเตือนเมื่อ:</p>
                    <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                      <li>ตรวจพบ Fraud Alert (ทุกระดับ)</li>
                      <li>ออกใบเตือนพนักงาน ใบเหลือง/ใบแดง</li>
                      <li>Brute Force Login</li>
                    </ul>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={savingTelegram} className="flex-1 md:flex-none">
                      <Save className="w-4 h-4 mr-1.5" />
                      {savingTelegram ? 'กำลังบันทึก...' : 'บันทึก'}
                    </Button>
                    <Button
                      type="button" variant="outline" disabled={testingTelegram}
                      onClick={onTestTelegram} className="flex-1 md:flex-none"
                    >
                      <Send className="w-4 h-4 mr-1.5" />
                      {testingTelegram ? 'กำลังทดสอบ...' : 'ทดสอบการส่ง'}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* System Settings Tab */}
        <TabsContent value="system" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Settings2 className="w-4 h-4" />
                System Settings (เจ้าของโปรแกรม)
              </CardTitle>
              <p className="text-xs text-muted-foreground">ค่าตั้งต้นระดับระบบที่ใช้ร่วมกันทุกร้าน</p>
            </CardHeader>
            <CardContent>
              {loadingSys ? (
                <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 bg-muted" />)}</div>
              ) : (
                <div className="space-y-4">
                  {[
                    { key: 'app_name', label: 'ชื่อแอปพลิเคชัน', placeholder: 'POS System' },
                    { key: 'app_version', label: 'เวอร์ชัน', placeholder: '1.0.0' },
                    { key: 'support_email', label: 'อีเมลซัพพอร์ต', placeholder: 'support@example.com' },
                    { key: 'max_stores', label: 'จำนวนร้านสูงสุด', placeholder: '100' },
                    { key: 'maintenance_mode', label: 'ข้อความโหมดซ่อมบำรุง', placeholder: 'ระบบปิดชั่วคราว...' },
                  ].map(setting => (
                    <div key={setting.key} className="flex flex-col md:flex-row md:items-center gap-2">
                      <label className="text-sm text-foreground min-w-48 shrink-0">{setting.label}</label>
                      <div className="flex gap-2 flex-1">
                        <Input
                          defaultValue={sysSettings[setting.key] || ''}
                          placeholder={setting.placeholder}
                          id={`sys-${setting.key}`}
                          className="flex-1"
                        />
                        <Button
                          size="sm"
                          disabled={savingSys === setting.key}
                          onClick={() => {
                            const el = document.getElementById(`sys-${setting.key}`) as HTMLInputElement;
                            if (el) onSaveSys(setting.key, el.value);
                          }}
                        >
                          {savingSys === setting.key ? '...' : <Save className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Warning History Dialog */}
      <Dialog open={!!historyUser} onOpenChange={v => { if (!v) setHistoryUser(null); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader>
            <DialogTitle>ประวัติใบเตือน — {historyUser?.full_name || historyUser?.username}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {loadingHistory ? (
              [...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 bg-muted rounded-lg" />)
            ) : warningHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">ไม่มีประวัติใบเตือน</div>
            ) : warningHistory.map(w => (
              <div key={w.id} className={`p-3 rounded-lg border ${w.warning_type === 'red_card' ? 'bg-destructive/5 border-destructive/20' : 'bg-yellow-500/5 border-yellow-500/20'}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <WarningBadge status={w.warning_type} />
                  <span className="text-xs text-muted-foreground">{formatDate(w.created_at, 'short')}</span>
                </div>
                <p className="text-sm text-foreground">{w.reason}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  ออกโดย: {w.issuer?.full_name || w.issuer?.username || 'ไม่ทราบ'}
                </p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryUser(null)}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Warning Confirm */}
      <AlertDialog open={!!resetTarget} onOpenChange={v => { if (!v) setResetTarget(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>รีเซ็ตสถานะใบเตือน</AlertDialogTitle>
            <AlertDialogDescription>
              ต้องการรีเซ็ตสถานะใบเตือนของ <strong>{resetTarget?.username}</strong> ให้กลับเป็น "ปกติ"?<br />
              บัญชีจะสามารถเข้าสู่ระบบได้ตามปกติ
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={resetWarning}>รีเซ็ตสถานะ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Store Dialog */}
      <Dialog open={showCreateStore} onOpenChange={v => { if (!v) { setShowCreateStore(false); createStoreForm.reset(); } }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-violet-600" />
              เพิ่มร้านค้าใหม่
            </DialogTitle>
          </DialogHeader>
          <Form {...createStoreForm}>
            <form onSubmit={createStoreForm.handleSubmit(onCreateStore)} className="space-y-4">
              <Separator />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">ข้อมูลร้านค้า</p>
              <FormField control={createStoreForm.control} name="store_name" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-normal">ชื่อร้าน <span className="text-destructive">*</span></FormLabel>
                  <FormControl><Input {...field} placeholder="เช่น ร้านกาแฟดอยช้าง" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={createStoreForm.control} name="store_address" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">ที่อยู่</FormLabel>
                    <FormControl><Input {...field} placeholder="ที่อยู่ร้าน" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={createStoreForm.control} name="store_phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">เบอร์โทร</FormLabel>
                    <FormControl><Input {...field} placeholder="0812345678" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <Separator />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">บัญชีเจ้าของร้าน (Store Owner)</p>
              <div className="p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
                บัญชีนี้จะมีสิทธิ์ดูแลร้านได้เต็มรูปแบบ แต่ <strong>ไม่สามารถสร้าง Store Owner</strong> หรือจัดการร้านอื่นได้
              </div>
              <FormField control={createStoreForm.control} name="owner_full_name" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-normal">ชื่อ-นามสกุล</FormLabel>
                  <FormControl><Input {...field} placeholder="เช่น สมชาย ใจดี" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={createStoreForm.control} name="owner_username" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">ชื่อผู้ใช้ <span className="text-destructive">*</span></FormLabel>
                    <FormControl><Input {...field} placeholder="somchai_shop" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={createStoreForm.control} name="owner_password" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">รหัสผ่าน <span className="text-destructive">*</span></FormLabel>
                    <FormControl><Input {...field} type="password" placeholder="อย่างน้อย 6 ตัวอักษร" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => { setShowCreateStore(false); createStoreForm.reset(); }}>
                  ยกเลิก
                </Button>
                <Button type="submit" disabled={creatingStore} className="gap-1.5">
                  <Plus className="w-4 h-4" />
                  {creatingStore ? 'กำลังสร้าง...' : 'สร้างร้านค้า'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Toggle Store Status Confirm */}
      <AlertDialog open={!!toggleTarget} onOpenChange={v => { if (!v) setToggleTarget(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleTarget?.is_active ? 'ปิดร้าน' : 'เปิดร้าน'} — {toggleTarget?.name}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleTarget?.is_active
                ? `เมื่อปิดร้าน เจ้าของร้านและพนักงานทุกคนของ "${toggleTarget?.name}" จะไม่สามารถเข้าสู่ระบบได้ทันที`
                : `เมื่อเปิดร้าน เจ้าของร้านและพนักงานของ "${toggleTarget?.name}" จะสามารถเข้าสู่ระบบได้ตามปกติ`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toggleTarget && toggleStoreActive(toggleTarget)}
              className={toggleTarget?.is_active ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              {toggleTarget?.is_active ? 'ปิดร้าน' : 'เปิดร้าน'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
