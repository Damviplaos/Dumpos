import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Shield, AlertTriangle, History, XCircle, Tag, Check, Wifi, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
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
  username: z.string().min(3).regex(/^[a-zA-Z0-9_]+$/),
  full_name: z.string().optional(),
  password: z.string().min(8).optional().or(z.literal('')),
  role: z.enum(['admin', 'cashier']),
  is_active: z.boolean(),
});
type UserForm = z.infer<typeof userSchema>;

const warningSchema = z.object({
  warning_type: z.enum(['yellow_card', 'red_card']),
  reason: z.string().min(5),
});
type WarningForm = z.infer<typeof warningSchema>;

const resetPwSchema = z.object({
  new_password: z.string().min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'),
  confirm_password: z.string(),
}).refine(d => d.new_password === d.confirm_password, {
  message: 'รหัสผ่านไม่ตรงกัน',
  path: ['confirm_password'],
});
type ResetPwForm = z.infer<typeof resetPwSchema>;

interface OnlineStaff {
  user_id: string;
  username: string;
  full_name: string | null;
  clock_in_at: string;
}

function WarningBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  if (status === 'red_card') return (
    <Badge className="bg-destructive text-destructive-foreground text-xs gap-1 px-2 py-0.5">
      <XCircle className="w-3 h-3" /> {t('users.redCard')}
    </Badge>
  );
  if (status === 'yellow_card') return (
    <Badge className="bg-yellow-500 text-white text-xs gap-1 px-2 py-0.5">
      <AlertTriangle className="w-3 h-3" /> {t('users.yellowCard')}
    </Badge>
  );
  return (
    <Badge variant="secondary" className="bg-green-500/10 text-green-700 dark:text-green-400 text-xs">
      {t('users.normal')}
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
  const { t } = useTranslation();
  const [users, setUsers] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [storeRoles, setStoreRoles] = useState<StoreRole[]>([]);
  const [badgeMap, setBadgeMap] = useState<Record<string, UserBadgeAssignment[]>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState<Profile | null>(null);
  const [deleteUser, setDeleteUser] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedBadges, setSelectedBadges] = useState<Set<string>>(new Set());
  const [selectedPermRoles, setSelectedPermRoles] = useState<Set<string>>(new Set());
  const [savingBadges, setSavingBadges] = useState(false);
  const [warningTarget, setWarningTarget] = useState<Profile | null>(null);
  const [savingWarning, setSavingWarning] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<Profile | null>(null);
  const [warningHistory, setWarningHistory] = useState<WarningRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  // Online staff
  const [onlineStaff, setOnlineStaff] = useState<OnlineStaff[]>([]);
  const [loadingOnline, setLoadingOnline] = useState(true);
  // permRoleMap: user_id → role ids
  const [permRoleMap, setPermRoleMap] = useState<Record<string, string[]>>({});
  // Reset password
  const [resetPwTarget, setResetPwTarget] = useState<Profile | null>(null);
  const [savingResetPw, setSavingResetPw] = useState(false);

  const form = useForm<UserForm>({
    resolver: zodResolver(userSchema),
    defaultValues: { username: '', full_name: '', password: '', role: 'cashier', is_active: true },
  });
  const warningForm = useForm<WarningForm>({
    resolver: zodResolver(warningSchema),
    defaultValues: { warning_type: 'yellow_card', reason: '' },
  });
  const resetPwForm = useForm<ResetPwForm>({
    resolver: zodResolver(resetPwSchema),
    defaultValues: { new_password: '', confirm_password: '' },
  });

  useEffect(() => {
    loadData();
    loadOnlineStaff();
  }, []);

  const loadOnlineStaff = async () => {
    setLoadingOnline(true);
    // ดึง attendance_logs ที่ยังไม่ได้ clock_out (ออนไลน์อยู่)
    const { data } = await supabase
      .from('attendance_logs')
      .select('user_id, username, clock_in_at, profiles(full_name)')
      .is('clock_out_at', null)
      .order('clock_in_at', { ascending: false });
    if (data) {
      setOnlineStaff(data.map((row: any) => ({
        user_id: row.user_id,
        username: row.username,
        full_name: row.profiles?.full_name ?? null,
        clock_in_at: row.clock_in_at,
      })));
    }
    setLoadingOnline(false);
  };

  const loadData = async () => {
    setLoading(true);
    const [usersRes, rolesRes, storeRolesRes, assignRes, permRoleRes] = await Promise.all([
      supabase.from('profiles').select('*, custom_role:roles(*)').order('created_at'),
      supabase.from('roles').select('*').order('sort_order'),
      supabase.from('store_roles').select('*').order('sort_order'),
      supabase.from('user_role_assignments').select('*, store_role:store_roles(*)'),
      supabase.from('user_permission_roles').select('user_id, role_id'),
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

    // Build permRole map: user_id → role_id[]
    const prMap: Record<string, string[]> = {};
    (Array.isArray(permRoleRes.data) ? permRoleRes.data : []).forEach((r: any) => {
      if (!prMap[r.user_id]) prMap[r.user_id] = [];
      prMap[r.user_id].push(r.role_id);
    });
    setPermRoleMap(prMap);

    setLoading(false);
  };

  const openCreate = () => {
    setEditUser(null);
    setSelectedBadges(new Set());
    setSelectedPermRoles(new Set());
    form.reset({ username: '', full_name: '', password: '', role: 'cashier', is_active: true });
    setShowForm(true);
  };

  const openEdit = (user: Profile) => {
    setEditUser(user);
    // Pre-select existing badges
    const existing = (badgeMap[user.id] || []).map(a => a.role_id);
    setSelectedBadges(new Set(existing));
    // Pre-select existing permission roles
    setSelectedPermRoles(new Set(permRoleMap[user.id] || []));
    form.reset({
      username: user.username,
      full_name: user.full_name || '',
      password: '',
      role: (user.role === 'super_admin' ? 'admin' : user.role) as 'admin' | 'cashier',
      is_active: user.is_active,
    });
    setShowForm(true);
  };

  const togglePermRole = (roleId: string) => {
    setSelectedPermRoles(prev => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId); else next.add(roleId);
      return next;
    });
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
    // ── Badges (store_roles) ────────────────────────────────────────────
    const { data: curBadges } = await supabase.from('user_role_assignments').select('role_id').eq('user_id', userId);
    const curBadgeIds = new Set((curBadges || []).map((r: any) => r.role_id));
    const rmBadges = [...curBadgeIds].filter(id => !selectedBadges.has(id));
    const addBadges = [...selectedBadges].filter(id => !curBadgeIds.has(id));
    if (rmBadges.length) await supabase.from('user_role_assignments').delete().eq('user_id', userId).in('role_id', rmBadges);
    if (addBadges.length) await supabase.from('user_role_assignments').insert(addBadges.map(role_id => ({ user_id: userId, role_id, assigned_by: currentProfile?.id ?? null })));

    // ── Permission roles (user_permission_roles) ────────────────────────
    const { data: curPR } = await supabase.from('user_permission_roles').select('role_id').eq('user_id', userId);
    const curPRIds = new Set((curPR || []).map((r: any) => r.role_id));
    const rmPR = [...curPRIds].filter(id => !selectedPermRoles.has(id));
    const addPR = [...selectedPermRoles].filter(id => !curPRIds.has(id));
    if (rmPR.length) await supabase.from('user_permission_roles').delete().eq('user_id', userId).in('role_id', rmPR);
    if (addPR.length) await supabase.from('user_permission_roles').insert(addPR.map(role_id => ({ user_id: userId, role_id, assigned_by: currentProfile?.id ?? null })));

    // Sync role_id on profile to first selected permission role (for backward compat)
    const firstRoleId = [...selectedPermRoles][0] ?? null;
    await supabase.from('profiles').update({ role_id: firstRoleId }).eq('id', userId);

    setSavingBadges(false);
  };

  const onSubmit = async (data: UserForm) => {
    setSaving(true);
    try {
      if (editUser) {
        const { error } = await supabase.from('profiles').update({
          full_name: data.full_name || null,
          role: data.role,
          is_active: data.is_active,
        }).eq('id', editUser.id);
        if (error) throw error;
        await saveBadges(editUser.id);
        toast.success(t('users.editSuccess'));
      } else {
        if (!data.password) { toast.error(t('users.passwordRequired')); setSaving(false); return; }
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
            full_name: data.full_name || null,
            store_id: currentProfile?.store_id ?? null,
          }).eq('id', authData.user.id);
          await saveBadges(authData.user.id);
        }
        toast.success(t('users.addSuccess'));
      }
      setShowForm(false);
      loadData();
    } catch (err: unknown) {
      toast.error(`${t('users.saveFail')}: ${err instanceof Error ? err.message : ''}`);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteUser) return;
    const { error } = await supabase.from('profiles').update({ is_active: false }).eq('id', deleteUser.id);
    if (error) { toast.error(t('users.deactivateFail')); return; }
    toast.success(t('users.deactivateSuccess'));
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
        const label = data.warning_type === 'red_card' ? t('users.redCard') : t('users.yellowCard');
        await supabase.functions.invoke('send-telegram', {
          body: {
            bot_token: storeSettings.telegram_bot_token,
            chat_id: storeSettings.telegram_chat_id,
            message: `${icon} *${t('users.issueWarning')}*\n\n${t('users.username')}: ${warningTarget.username}\n${t('users.warningType')}: ${label}\n${t('users.warningReason')}: ${data.reason}\n${t('users.issuedBy')}: ${currentProfile.username}\n${t('common.time') || 'เวลา'}: ${new Date().toLocaleString('th-TH')}`,
          },
        });
      }
      toast.success(t('users.warningSuccess'));
      setWarningTarget(null);
      loadData();
    } catch (err: unknown) {
      toast.error(`${t('users.warningSuccess').replace('สำเร็จ', 'ไม่สำเร็จ')}: ${err instanceof Error ? err.message : ''}`);
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

  const onResetPassword = async (data: ResetPwForm) => {
    if (!resetPwTarget) return;
    setSavingResetPw(true);
    try {
      const { error } = await supabase.functions.invoke('reset-password', {
        body: { target_user_id: resetPwTarget.id, new_password: data.new_password },
      });
      if (error) throw error;
      toast.success(`รีเซ็ตรหัสผ่าน ${resetPwTarget.username} สำเร็จแล้ว`);
      setResetPwTarget(null);
      resetPwForm.reset();
    } catch (err: unknown) {
      toast.error(`ไม่สามารถรีเซ็ตรหัสผ่านได้: ${err instanceof Error ? err.message : String(err)}`);
    }
    setSavingResetPw(false);
  };

  const isCreateMode = !editUser;
  const warningType = warningForm.watch('warning_type');

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground text-balance">{t('users.title')}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{t('users.totalUsers')}: {users.length}</p>
        </div>
        <Button className="md:ml-auto" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1.5" />{t('users.addUser')}
        </Button>
      </div>

      {/* Online Staff Panel */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Wifi className="w-4 h-4 text-green-500" />
            {t('users.onlineStaffTitle')}
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500/15 text-green-700 dark:text-green-400 text-xs font-bold">
              {onlineStaff.length}
            </span>
          </h3>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={loadOnlineStaff}>
            {t('common.refresh')}
          </Button>
        </div>
        {loadingOnline ? (
          <div className="flex gap-2 flex-wrap">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-28 bg-muted rounded-full" />)}
          </div>
        ) : onlineStaff.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">{t('users.noOnlineStaff')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {onlineStaff.map(s => (
              <div key={s.user_id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-sm">
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0 animate-pulse" />
                <span className="font-medium text-foreground">{s.full_name || s.username}</span>
                <span className="text-xs text-muted-foreground">@{s.username}</span>
                <span className="text-xs text-muted-foreground">
                  · {t('users.clockedInAt')} {new Date(s.clock_in_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Users Table */}
      <div className="bg-card border border-border rounded-xl min-w-0">
        <div className="overflow-x-auto w-full max-w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">{t('users.fullName')}</TableHead>
                <TableHead className="whitespace-nowrap">{t('users.username')}</TableHead>
                <TableHead className="whitespace-nowrap">{t('users.role')}</TableHead>
                <TableHead className="whitespace-nowrap">{t('users.badge')}</TableHead>
                <TableHead className="whitespace-nowrap text-center">{t('users.warningStatus')}</TableHead>
                <TableHead className="whitespace-nowrap text-center">{t('common.status')}</TableHead>
                <TableHead className="whitespace-nowrap">{t('common.date')}</TableHead>
                <TableHead className="whitespace-nowrap text-right">{t('common.actions')}</TableHead>
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
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground text-sm">{t('common.noData')}</TableCell>
                </TableRow>
              ) : users.map(user => {
                const isSuperAdminUser = user.role === 'super_admin';
                const isStoreOwnerUser = user.role === 'store_owner';
                const roleName = isSuperAdminUser ? t('roleLabel.super_admin')
                  : isStoreOwnerUser ? t('roleLabel.store_owner')
                  : user.custom_role?.name ?? (user.role === 'admin' ? t('roleLabel.admin') : t('roleLabel.cashier'));
                const roleColor = isSuperAdminUser ? '#7C3AED'
                  : isStoreOwnerUser ? '#0A6E4C'
                  : user.custom_role?.color ?? (user.role === 'admin' ? '#0A4D3C' : '#3B82F6');
                const ws = user.warning_status || 'normal';
                const userBadges = (badgeMap[user.id] || [])
                  .filter(a => a.store_role)
                  .sort((a, b) => (a.store_role!.sort_order - b.store_role!.sort_order));
                // Permission roles for this user
                const userPermRoles = (permRoleMap[user.id] || [])
                  .map(rid => roles.find(r => r.id === rid))
                  .filter(Boolean) as Role[];
                const isOnline = onlineStaff.some(s => s.user_id === user.id);

                return (
                  <TableRow key={user.id}
                    className={`hover:bg-muted/30 ${ws === 'red_card' ? 'bg-destructive/5' : ws === 'yellow_card' ? 'bg-yellow-500/5' : ''}`}>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="relative shrink-0">
                          <Avatar className="w-9 h-9">
                            <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                              {user.username.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          {isOnline && (
                            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-card" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{user.full_name || user.username}</p>
                          {user.email && <p className="text-xs text-muted-foreground truncate">{user.email.replace('@miaoda.com', '')}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{user.username}</TableCell>
                    <TableCell>
                      {/* System role chip */}
                      <div className="flex flex-wrap gap-1 min-w-[140px]">
                        <span className="text-xs px-2.5 py-1 rounded-full font-medium inline-flex items-center gap-1 shrink-0"
                          style={{ backgroundColor: roleColor + '22', color: roleColor }}>
                          <Shield className="w-3 h-3" />{roleName}
                        </span>
                        {/* Extra permission role chips */}
                        {userPermRoles.map(r => (
                          <span key={r.id} className="text-xs px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1 shrink-0"
                            style={{ backgroundColor: r.color + '22', color: r.color, border: `1px solid ${r.color}44` }}>
                            {r.name}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 min-w-[120px]">
                        {userBadges.length === 0 ? (
                          <span className="text-xs text-muted-foreground italic">{t('users.noBadge')}</span>
                        ) : userBadges.map(a => (
                          <BadgeChip key={a.id} storeRole={a.store_role!} />
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <WarningBadge status={ws} />
                        <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground"
                          title={t('users.warningHistory')} onClick={() => openHistory(user)}>
                          <History className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-center">
                      <Badge variant="secondary"
                        className={`text-xs ${user.is_active ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
                        {user.is_active ? t('users.active') : t('users.inactive')}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(user.created_at, 'short')}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        {can('issue_warnings') && !isSuperAdminUser && !isStoreOwnerUser && user.id !== currentProfile?.id && (
                          <Button variant="ghost" size="icon" className="w-8 h-8 text-yellow-600 hover:text-yellow-700 hover:bg-yellow-500/10"
                            title={t('users.issueWarning')} onClick={() => openWarning(user)}>
                            <AlertTriangle className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {!isSuperAdminUser && !isStoreOwnerUser && (
                          <Button variant="ghost" size="icon" className="w-8 h-8" title={t('common.edit')} onClick={() => openEdit(user)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {!isSuperAdminUser && !isStoreOwnerUser && (
                          <Button variant="ghost" size="icon"
                            className="w-8 h-8 text-blue-600 hover:text-blue-700 hover:bg-blue-500/10"
                            title="รีเซ็ตรหัสผ่าน"
                            onClick={() => { setResetPwTarget(user); resetPwForm.reset(); }}>
                            <KeyRound className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {user.id !== currentProfile?.id && !isSuperAdminUser && !isStoreOwnerUser && (
                          <Button variant="ghost" size="icon"
                            className="w-8 h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            title={t('users.deactivateUser')}
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
              <Shield className="w-5 h-5" />
              {editUser ? t('users.editUser') : t('users.addUser')}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="username" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">{t('users.username')} *</FormLabel>
                    <FormControl><Input {...field} placeholder="username" disabled={!isCreateMode} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="full_name" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">{t('users.fullName')}</FormLabel>
                    <FormControl><Input {...field} placeholder={t('users.fullName')} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              {isCreateMode && (
                <FormField control={form.control} name="password" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">{t('users.password')} *</FormLabel>
                    <FormControl><Input {...field} type="password" placeholder="≥ 8 chars" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="role" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-normal">{t('users.role')}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="cashier">{t('roleLabel.cashier')}</SelectItem>
                        <SelectItem value="admin">{t('roleLabel.admin')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Multi permission-role picker */}
              {roles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5" />
                    {t('roles.title')}
                    <span className="text-xs text-muted-foreground ml-1">({t('users.badgeHint')})</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {roles.map(r => {
                      const isSelected = selectedPermRoles.has(r.id);
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => togglePermRole(r.id)}
                          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium transition-all border-2 cursor-pointer"
                          style={isSelected
                            ? { backgroundColor: r.color + '33', color: r.color, borderColor: r.color }
                            : { backgroundColor: 'transparent', color: 'hsl(var(--muted-foreground))', borderColor: 'hsl(var(--border))' }}
                        >
                          {isSelected && <Check className="w-3 h-3 shrink-0" />}
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                          {r.name}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('users.assignBadge')}: {selectedPermRoles.size} {t('roles.permissionsLabel').toLowerCase()}
                  </p>
                </div>
              )}

              {/* Multi-badge picker */}
              {storeRoles.length > 0 && (
                <div className="space-y-2">
                  <Separator />
                  <div>
                    <p className="text-sm font-medium text-foreground flex items-center gap-1.5 mb-2">
                      <Tag className="w-3.5 h-3.5" />
                      {t('users.badge')} <span className="text-xs text-muted-foreground">({t('users.badgeHint')})</span>
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
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {t('users.assignBadge')}: {selectedBadges.size}
                    </p>
                  </div>
                </div>
              )}

              <Separator />
              <FormField control={form.control} name="is_active" render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                  <div>
                    <FormLabel className="text-sm font-normal cursor-pointer">{t('common.active')}</FormLabel>
                    <p className="text-xs text-muted-foreground mt-0.5">{t('users.deactivateWarning')}</p>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                </FormItem>
              )} />
              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)} disabled={saving || savingBadges}>{t('common.cancel')}</Button>
                <Button type="submit" disabled={saving || savingBadges}>
                  {saving || savingBadges ? t('common.loading') : t('common.save')}
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
              <AlertTriangle className="w-5 h-5" />{t('users.issueWarning')}
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
                  <FormLabel className="text-sm font-normal">{t('users.warningType')} *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="yellow_card">
                        <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-yellow-500 shrink-0" />{t('users.yellowCard')}</span>
                      </SelectItem>
                      <SelectItem value="red_card">
                        <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-destructive shrink-0" />{t('users.redCard')}</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={warningForm.control} name="reason" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-normal">{t('users.warningReason')} *</FormLabel>
                  <FormControl><Textarea {...field} placeholder="..." rows={3} className="resize-none" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              {warningType === 'red_card' && (
                <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive">{t('users.redCard')}</p>
                </div>
              )}
              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setWarningTarget(null)} disabled={savingWarning}>{t('common.cancel')}</Button>
                <Button type="submit" disabled={savingWarning}
                  className={warningType === 'red_card' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : 'bg-yellow-500 hover:bg-yellow-600 text-white'}>
                  {savingWarning ? t('common.loading') : t('users.issueWarning')}
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
              {t('users.warningHistory')} — {historyTarget?.full_name || historyTarget?.username}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {loadingHistory ? (
              [...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 bg-muted rounded-lg" />)
            ) : warningHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">{t('users.noWarningHistory')}</div>
            ) : warningHistory.map(w => (
              <div key={w.id}
                className={`p-3 rounded-lg border ${w.warning_type === 'red_card' ? 'bg-destructive/5 border-destructive/20' : 'bg-yellow-500/5 border-yellow-500/20'}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <WarningBadge status={w.warning_type} />
                  <span className="text-xs text-muted-foreground">{formatDate(w.created_at, 'short')}</span>
                </div>
                <p className="text-sm text-foreground">{w.reason}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('users.issuedBy')}: {w.issuer?.full_name || w.issuer?.username || '-'}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirm */}
      <AlertDialog open={!!deleteUser} onOpenChange={v => { if (!v) setDeleteUser(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('users.deactivateConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('users.deactivateUser')}: <strong>{deleteUser?.username}</strong><br />
              {t('users.deactivateWarning')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('users.deactivateUser')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Reset Password Dialog ───────────────────────────── */}
      <Dialog open={!!resetPwTarget} onOpenChange={v => { if (!v) { setResetPwTarget(null); resetPwForm.reset(); } }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-blue-600" />
              รีเซ็ตรหัสผ่าน
            </DialogTitle>
          </DialogHeader>
          <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-4 py-3 text-sm text-blue-700 dark:text-blue-400 flex items-start gap-2">
            <KeyRound className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              ตั้งรหัสผ่านใหม่ให้ <strong>{resetPwTarget?.full_name || resetPwTarget?.username}</strong>
              <span className="text-muted-foreground ml-1">(@{resetPwTarget?.username})</span>
            </span>
          </div>
          <Form {...resetPwForm}>
            <form onSubmit={resetPwForm.handleSubmit(onResetPassword)} className="space-y-4">
              <FormField control={resetPwForm.control} name="new_password" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-normal">รหัสผ่านใหม่ *</FormLabel>
                  <FormControl>
                    <Input {...field} type="password" placeholder="อย่างน้อย 8 ตัวอักษร" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={resetPwForm.control} name="confirm_password" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-normal">ยืนยันรหัสผ่าน *</FormLabel>
                  <FormControl>
                    <Input {...field} type="password" placeholder="พิมพ์รหัสผ่านอีกครั้ง" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => { setResetPwTarget(null); resetPwForm.reset(); }}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={savingResetPw}
                  className="bg-blue-600 hover:bg-blue-700 text-white">
                  <KeyRound className="w-4 h-4 mr-1.5" />
                  {savingResetPw ? 'กำลังบันทึก...' : 'รีเซ็ตรหัสผ่าน'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
