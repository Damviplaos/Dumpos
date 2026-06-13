import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, UserCircle, Shield, AlertTriangle, History, XCircle, Tag, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate } from '@/lib/utils';
import type { Profile, Role, WarningRecord, StoreRole, UserBadgeAssignment } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';

const userSchema = z.object({
  username: z.string().min(3, 'ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร').regex(/^[a-zA-Z0-9_]+$/, 'ใช้ได้เฉพาะ a-z, 0-9, _'),
  full_name: z.string().optional(),
  password: z.string().min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร').optional().or(z.literal('')),
  role: z.enum(['admin', 'cashier']),
  role_id: z.string().nullable(),
  is_active: z.boolean(),
});
type UserForm = z.infer<typeof userSchema>;

const warningSchema = z.object({
  warning_type: z.enum(['yellow_card', 'red_card']),
  reason: z.string().min(5, 'กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร'),
});
type WarningForm = z.infer<typeof warningSchema>;

function WarningBadge({ status }: { status: string }) {
  if (status === 'red_card') return (
    <Badge className="bg-destructive text-destructive-foreground text-xs gap-1 px-2 py-0.5">
      <XCircle className="w-3 h-3" /> ใบแดง
    </Badge>
  );
  if (status === 'yellow_card') return (
    <Badge className="bg-yellow-500 text-white text-xs gap-1 px-2 py-0.5">
      <AlertTriangle className="w-3 h-3" /> ใบเหลือง
    </Badge>
  );
  return (
    <Badge variant="secondary" className="bg-green-500/10 text-green-700 dark:text-green-400 text-xs">
      ปกติ
    </Badge>
  );
}

// Colored Discord-style badge chip
function BadgeChip({ storeRole }: { storeRole: StoreRole }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
      style={{ backgroundColor: storeRole.color + '22', color: storeRole.color, border: `1px solid ${storeRole.color}44` }}
    >
      <span>{storeRole.emoji}</span>
      {storeRole.name}
    </span>
  );
}

export default function UsersPage() {
  const { profile: currentProfile, can } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [storeRoles, setStoreRoles] = useState<StoreRole[]>([]);
  // Map: userId → badge assignments
  const [badgeMap, setBadgeMap] = useState<Record<string, UserBadgeAssignment[]>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState<Profile | null>(null);
  const [deleteUser, setDeleteUser] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  // Badge toggle state in form
  const [selectedBadges, setSelectedBadges] = useState<Set<string>>(new Set());
  const [savingBadges, setSavingBadges] = useState(false);
  const [warningTarget, setWarningTarget] = useState<Profile | null>(null);
  const [savingWarning, setSavingWarning] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<Profile | null>(null);
  const [warningHistory, setWarningHistory] = useState<WarningRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const form = useForm<UserForm>({
    resolver: zodResolver(userSchema),
    defaultValues: { username: '', full_name: '', password: '', role: 'cashier', role_id: null, is_active: true },
  });
  const warningForm = useForm<WarningForm>({
    resolver: zodResolver(warningSchema),
    defaultValues: { warning_type: 'yellow_card', reason: '' },
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [usersRes, rolesRes, storeRolesRes, assignRes] = await Promise.all([
      supabase.from('profiles').select('*, custom_role:roles(*)').order('created_at'),
      supabase.from('roles').select('*').order('sort_order'),
      supabase.from('store_roles').select('*').order('sort_order'),
      supabase.from('user_role_assignments').select('*, store_role:store_roles(*)'),
    ]);
    setUsers(Array.isArray(usersRes.data) ? usersRes.data as Profile[] : []);
    setRoles(Array.isArray(rolesRes.data) ? rolesRes.data : []);
    setStoreRoles(Array.isArray(storeRolesRes.data) ? storeRolesRes.data as StoreRole[] : []);

    // Build badge map keyed by user_id
    const map: Record<string, UserBadgeAssignment[]> = {};
    (Array.isArray(assignRes.data) ? assignRes.data : []).forEach((a: any) => {
      if (!map[a.user_id]) map[a.user_id] = [];
      map[a.user_id].push(a as UserBadgeAssignment);
    });
    setBadgeMap(map);
    setLoading(false);
  };

  const openCreate = () => {
    setEditUser(null);
    setSelectedBadges(new Set());
    form.reset({ username: '', full_name: '', password: '', role: 'cashier', role_id: null, is_active: true });
    setShowForm(true);
  };

  const openEdit = (user: Profile) => {
    setEditUser(user);
    // Pre-select existing badges
    const existing = (badgeMap[user.id] || []).map(a => a.role_id);
    setSelectedBadges(new Set(existing));
    form.reset({
      username: user.username,
      full_name: user.full_name || '',
      password: '',
      role: (user.role === 'super_admin' ? 'admin' : user.role) as 'admin' | 'cashier',
      role_id: user.role_id || null,
      is_active: user.is_active,
    });
    setShowForm(true);
  };

  const toggleBadge = (roleId: string) => {
    setSelectedBadges(prev => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId); else next.add(roleId);
      return next;
    });
  };

  const saveBadges = async (userId: string) => {
    setSavingBadges(true);
    // Get current
    const { data: current } = await supabase.from('user_role_assignments').select('role_id').eq('user_id', userId);
    const currentIds = new Set((current || []).map((r: any) => r.role_id));
    const targetIds = selectedBadges;

    // Remove badges no longer selected
    const toRemove = [...currentIds].filter(id => !targetIds.has(id));
    // Add new badges
    const toAdd = [...targetIds].filter(id => !currentIds.has(id));

    if (toRemove.length > 0) {
      await supabase.from('user_role_assignments').delete()
        .eq('user_id', userId).in('role_id', toRemove);
    }
    if (toAdd.length > 0) {
      await supabase.from('user_role_assignments').insert(
        toAdd.map(role_id => ({ user_id: userId, role_id, assigned_by: currentProfile?.id ?? null })),
      );
    }
    setSavingBadges(false);
  };

  const onSubmit = async (data: UserForm) => {
    setSaving(true);
    try {
      if (editUser) {
        const { error } = await supabase.from('profiles').update({
          full_name: data.full_name || null,
          role: data.role,
          role_id: data.role_id || null,
          is_active: data.is_active,
        }).eq('id', editUser.id);
        if (error) throw error;
        await saveBadges(editUser.id);
        toast.success('แก้ไขผู้ใช้แล้ว');
      } else {
        if (!data.password) { toast.error('กรุณากรอกรหัสผ่าน'); setSaving(false); return; }
        const email = `${data.username}@miaoda.com`;
        const { data: authData, error: signUpErr } = await supabase.auth.signUp({
          email,
          password: data.password,
          options: { data: { username: data.username, full_name: data.full_name || data.username } },
        });
        if (signUpErr) throw signUpErr;
        if (authData.user) {
          await supabase.from('profiles').update({
            role: data.role,
            role_id: data.role_id || null,
            full_name: data.full_name || null,
            store_id: currentProfile?.store_id ?? null,
          }).eq('id', authData.user.id);
          await saveBadges(authData.user.id);
        }
        toast.success('เพิ่มผู้ใช้แล้ว');
      }
      setShowForm(false);
      loadData();
    } catch (err: unknown) {
      toast.error(`บันทึกไม่สำเร็จ: ${err instanceof Error ? err.message : 'ไม่ทราบสาเหตุ'}`);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteUser) return;
    const { error } = await supabase.from('profiles').update({ is_active: false }).eq('id', deleteUser.id);
    if (error) { toast.error('ไม่สามารถปิดการใช้งานผู้ใช้ได้'); return; }
    toast.success('ปิดการใช้งานผู้ใช้แล้ว');
    setDeleteUser(null);
    loadData();
  };

  const openWarning = (user: Profile) => {
    setWarningTarget(user);
    warningForm.reset({ warning_type: 'yellow_card', reason: '' });
  };

  const onIssueWarning = async (data: WarningForm) => {
    if (!warningTarget || !currentProfile) return;
    setSavingWarning(true);
    try {
      const { error: wErr } = await supabase.from('warning_records').insert({
        user_id: warningTarget.id,
        issued_by: currentProfile.id,
        warning_type: data.warning_type,
        reason: data.reason,
        store_id: currentProfile.store_id ?? null,
      });
      if (wErr) throw wErr;
      const { error: pErr } = await supabase.from('profiles')
        .update({ warning_status: data.warning_type }).eq('id', warningTarget.id);
      if (pErr) throw pErr;
      await supabase.from('audit_logs').insert({
        user_id: currentProfile.id, username: currentProfile.username,
        store_id: currentProfile.store_id ?? null, action: 'issue_warning',
        entity_type: 'profile', entity_id: warningTarget.id,
        details: { target: warningTarget.username, warning_type: data.warning_type, reason: data.reason },
        severity: data.warning_type === 'red_card' ? 'critical' : 'warning',
      });
      const { data: storeSettings } = await supabase.from('store_settings').select('telegram_bot_token, telegram_chat_id').maybeSingle();
      if (storeSettings?.telegram_bot_token && storeSettings?.telegram_chat_id) {
        const icon = data.warning_type === 'red_card' ? '🔴' : '🟡';
        const label = data.warning_type === 'red_card' ? 'ใบแดง (ระงับบัญชี)' : 'ใบเหลือง';
        await supabase.functions.invoke('send-telegram', {
          body: {
            bot_token: storeSettings.telegram_bot_token,
            chat_id: storeSettings.telegram_chat_id,
            message: `${icon} *ออกใบเตือนพนักงาน*\n\nพนักงาน: ${warningTarget.username}\nประเภท: ${label}\nเหตุผล: ${data.reason}\nออกโดย: ${currentProfile.username}\nเวลา: ${new Date().toLocaleString('th-TH')}`,
          },
        });
      }
      toast.success(`ออกใบเตือนให้ ${warningTarget.username} แล้ว`);
      setWarningTarget(null);
      loadData();
    } catch (err: unknown) {
      toast.error(`ออกใบเตือนไม่สำเร็จ: ${err instanceof Error ? err.message : ''}`);
    }
    setSavingWarning(false);
  };

  const openHistory = async (user: Profile) => {
    setHistoryTarget(user);
    setLoadingHistory(true);
    const { data } = await supabase
      .from('warning_records')
      .select('*, issuer:profiles!warning_records_issued_by_fkey(username, full_name)')
      .eq('user_id', user.id).order('created_at', { ascending: false });
    setWarningHistory(Array.isArray(data) ? data as WarningRecord[] : []);
    setLoadingHistory(false);
  };

  const isCreateMode = !editUser;
  const warningType = warningForm.watch('warning_type');

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground text-balance">จัดการผู้ใช้งาน</h2>
          <p className="text-sm text-muted-foreground mt-0.5">ผู้ใช้ทั้งหมด {users.length} คน</p>
        </div>
        <Button className="md:ml-auto" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1.5" />เพิ่มผู้ใช้งาน
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl min-w-0">
        <div className="overflow-x-auto w-full max-w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">ผู้ใช้งาน</TableHead>
                <TableHead className="whitespace-nowrap">ชื่อผู้ใช้</TableHead>
                <TableHead className="whitespace-nowrap">สิทธิ์ / ยศ</TableHead>
                <TableHead className="whitespace-nowrap">ป้ายสถานะ (Badges)</TableHead>
                <TableHead className="whitespace-nowrap text-center">ใบเตือน</TableHead>
                <TableHead className="whitespace-nowrap text-center">สถานะ</TableHead>
                <TableHead className="whitespace-nowrap">วันที่เพิ่ม</TableHead>
                <TableHead className="whitespace-nowrap text-right">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [...Array(4)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(8)].map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 bg-muted" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground text-sm">ไม่มีผู้ใช้งาน</TableCell>
                </TableRow>
              ) : users.map(user => {
                const isSuperAdminUser = user.role === 'super_admin';
                const isStoreOwnerUser = user.role === 'store_owner';
                const roleName = isSuperAdminUser ? 'ซุปเปอร์แอดมิน'
                  : isStoreOwnerUser ? 'เจ้าของร้าน'
                  : user.custom_role?.name ?? (user.role === 'admin' ? 'ผู้ดูแลระบบ' : 'แคชเชียร์');
                const roleColor = isSuperAdminUser ? '#7C3AED'
                  : isStoreOwnerUser ? '#0A6E4C'
                  : user.custom_role?.color ?? (user.role === 'admin' ? '#0A4D3C' : '#3B82F6');
                const ws = user.warning_status || 'normal';
                const userBadges = (badgeMap[user.id] || [])
                  .filter(a => a.store_role)
                  .sort((a, b) => (a.store_role!.sort_order - b.store_role!.sort_order));

                return (
                  <TableRow key={user.id}
                    className={`hover:bg-muted/30 ${ws === 'red_card' ? 'bg-destructive/5' : ws === 'yellow_card' ? 'bg-yellow-500/5' : ''}`}>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-9 h-9 shrink-0">
                          <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                            {user.username.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{user.full_name || user.username}</p>
                          {user.email && <p className="text-xs text-muted-foreground truncate">{user.email.replace('@miaoda.com', '')}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{user.username}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="text-xs px-2.5 py-1 rounded-full font-medium inline-flex items-center gap-1"
                        style={{ backgroundColor: roleColor + '22', color: roleColor }}>
                        <Shield className="w-3 h-3" />{roleName}
                      </span>
                    </TableCell>
                    {/* Discord-style multi-badge column */}
                    <TableCell>
                      <div className="flex flex-wrap gap-1 min-w-[120px]">
                        {userBadges.length === 0 ? (
                          <span className="text-xs text-muted-foreground italic">ไม่มี badge</span>
                        ) : userBadges.map(a => (
                          <BadgeChip key={a.id} storeRole={a.store_role!} />
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <WarningBadge status={ws} />
                        <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground"
                          title="ดูประวัติใบเตือน" onClick={() => openHistory(user)}>
                          <History className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-center">
                      <Badge variant="secondary"
                        className={`text-xs ${user.is_active ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
                        {user.is_active ? 'ใช้งาน' : 'ปิดใช้'}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(user.created_at, 'short')}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        {can('issue_warnings') && !isSuperAdminUser && !isStoreOwnerUser && user.id !== currentProfile?.id && (
                          <Button variant="ghost" size="icon" className="w-8 h-8 text-yellow-600 hover:text-yellow-700 hover:bg-yellow-500/10"
                            title="ออกใบเตือน" onClick={() => openWarning(user)}>
                            <AlertTriangle className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {!isSuperAdminUser && !isStoreOwnerUser && (
                          <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => openEdit(user)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {user.id !== currentProfile?.id && !isSuperAdminUser && !isStoreOwnerUser && (
                          <Button variant="ghost" size="icon"
                            className="w-8 h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteUser(user)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* User Form Dialog */}
      <Dialog open={showForm} onOpenChange={v => { if (!v) setShowForm(false); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCircle className="w-5 h-5" />
              {editUser ? 'แก้ไขผู้ใช้งาน' : 'เพิ่มผู้ใช้งานใหม่'}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="username" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">ชื่อผู้ใช้ *</FormLabel>
                    <FormControl><Input {...field} placeholder="username" disabled={!isCreateMode} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="full_name" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">ชื่อ-นามสกุล</FormLabel>
                    <FormControl><Input {...field} placeholder="ชื่อ นามสกุล" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              {isCreateMode && (
                <FormField control={form.control} name="password" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">รหัสผ่าน *</FormLabel>
                    <FormControl><Input {...field} type="password" placeholder="อย่างน้อย 8 ตัวอักษร" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="role" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">ระดับการเข้าถึง</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="cashier">พนักงาน (แคชเชียร์)</SelectItem>
                        <SelectItem value="admin">ผู้ดูแลระบบ</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="role_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">ยศหลัก (Role)</FormLabel>
                    <Select value={field.value ?? 'none'} onValueChange={v => field.onChange(v === 'none' ? null : v)}>
                      <FormControl><SelectTrigger><SelectValue placeholder="เลือกยศ..." /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="none">— ไม่กำหนด —</SelectItem>
                        {roles.map(r => (
                          <SelectItem key={r.id} value={r.id}>
                            <span className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0 inline-block" style={{ backgroundColor: r.color }} />
                              {r.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Discord-style multi-badge picker */}
              {storeRoles.length > 0 && (
                <div className="space-y-2">
                  <Separator />
                  <div>
                    <p className="text-sm font-medium text-foreground flex items-center gap-1.5 mb-2">
                      <Tag className="w-3.5 h-3.5" />
                      Badges (เลือกได้หลายอัน เหมือน Discord)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {storeRoles.map(sr => {
                        const isSelected = selectedBadges.has(sr.id);
                        return (
                          <button
                            key={sr.id}
                            type="button"
                            onClick={() => toggleBadge(sr.id)}
                            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium transition-all border-2 cursor-pointer"
                            style={isSelected
                              ? { backgroundColor: sr.color + '33', color: sr.color, borderColor: sr.color }
                              : { backgroundColor: 'transparent', color: 'hsl(var(--muted-foreground))', borderColor: 'hsl(var(--border))' }}
                          >
                            {isSelected && <Check className="w-3 h-3 shrink-0" />}
                            <span>{sr.emoji}</span>
                            {sr.name}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">เลือกแล้ว {selectedBadges.size} badge</p>
                  </div>
                </div>
              )}

              <Separator />
              <FormField control={form.control} name="is_active" render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                  <div>
                    <FormLabel className="text-sm font-normal cursor-pointer">เปิดใช้งาน</FormLabel>
                    <p className="text-xs text-muted-foreground mt-0.5">อนุญาตให้เข้าสู่ระบบ</p>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )} />
              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)} disabled={saving || savingBadges}>ยกเลิก</Button>
                <Button type="submit" disabled={saving || savingBadges}>
                  {saving || savingBadges ? 'กำลังบันทึก...' : 'บันทึก'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Issue Warning Dialog */}
      <Dialog open={!!warningTarget} onOpenChange={v => { if (!v) setWarningTarget(null); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
              <AlertTriangle className="w-5 h-5" />ออกใบเตือนพนักงาน
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <Avatar className="w-10 h-10 shrink-0">
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {warningTarget?.username.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-semibold text-foreground">{warningTarget?.full_name || warningTarget?.username}</p>
              <p className="text-xs text-muted-foreground">@{warningTarget?.username}</p>
            </div>
            <div className="ml-auto"><WarningBadge status={warningTarget?.warning_status || 'normal'} /></div>
          </div>
          <Form {...warningForm}>
            <form onSubmit={warningForm.handleSubmit(onIssueWarning)} className="space-y-4">
              <FormField control={warningForm.control} name="warning_type" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-normal">ประเภทใบเตือน *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="yellow_card">
                        <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-yellow-500 shrink-0" />ใบเหลือง (คำเตือน)</span>
                      </SelectItem>
                      <SelectItem value="red_card">
                        <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-destructive shrink-0" />ใบแดง (ระงับบัญชี)</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={warningForm.control} name="reason" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-normal">เหตุผล *</FormLabel>
                  <FormControl><Textarea {...field} placeholder="ระบุเหตุผลการออกใบเตือน..." rows={3} className="resize-none" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              {warningType === 'red_card' && (
                <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive"><strong>ใบแดง:</strong> บัญชีพนักงานจะถูกระงับทันที</p>
                </div>
              )}
              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setWarningTarget(null)} disabled={savingWarning}>ยกเลิก</Button>
                <Button type="submit" disabled={savingWarning}
                  className={warningType === 'red_card' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : 'bg-yellow-500 hover:bg-yellow-600 text-white'}>
                  {savingWarning ? 'กำลังบันทึก...' : 'ออกใบเตือน'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Warning History Dialog */}
      <Dialog open={!!historyTarget} onOpenChange={v => { if (!v) setHistoryTarget(null); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              ประวัติใบเตือน — {historyTarget?.full_name || historyTarget?.username}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {loadingHistory ? (
              [...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 bg-muted rounded-lg" />)
            ) : warningHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">ไม่มีประวัติใบเตือน</div>
            ) : warningHistory.map(w => (
              <div key={w.id}
                className={`p-3 rounded-lg border ${w.warning_type === 'red_card' ? 'bg-destructive/5 border-destructive/20' : 'bg-yellow-500/5 border-yellow-500/20'}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <WarningBadge status={w.warning_type} />
                  <span className="text-xs text-muted-foreground">{formatDate(w.created_at, 'short')}</span>
                </div>
                <p className="text-sm text-foreground">{w.reason}</p>
                <p className="text-xs text-muted-foreground mt-1">ออกโดย: {w.issuer?.full_name || w.issuer?.username || 'ไม่ทราบ'}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteUser} onOpenChange={v => { if (!v) setDeleteUser(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>ปิดการใช้งาน</AlertDialogTitle>
            <AlertDialogDescription>
              ต้องการปิดการใช้งานบัญชี <strong>{deleteUser?.username}</strong>?<br />
              ผู้ใช้จะไม่สามารถเข้าสู่ระบบได้อีก
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              ปิดการใช้งาน
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
