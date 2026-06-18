import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  UserCog, Plus, Pencil, Trash2, Users, Shield, ChevronRight,
  ToggleLeft, ToggleRight, Copy, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { PermissionKey, Role } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ============ Permission definitions ============
interface PermissionGroup {
  group: string;
  items: { key: PermissionKey }[];
}

const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    group: 'sales',
    items: [
      { key: 'process_sales' },
      { key: 'void_transactions' },
      { key: 'view_transactions' },
      { key: 'view_all_transactions' },
    ],
  },
  {
    group: 'products',
    items: [
      { key: 'manage_products' },
      { key: 'manage_inventory' },
      { key: 'manage_categories' },
      { key: 'view_cost' },
    ],
  },
  {
    group: 'management',
    items: [
      { key: 'view_dashboard' },
      { key: 'view_reports' },
      { key: 'view_profit' },
      { key: 'manage_users' },
      { key: 'manage_roles' },
      { key: 'manage_settings' },
    ],
  },
  {
    group: 'security',
    items: [
      { key: 'view_audit_log' },
      { key: 'view_fraud_alerts' },
      { key: 'issue_warnings' },
    ],
  },
];

const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSION_GROUPS.flatMap(g => g.items.map(i => i.key));

// ============ Role Templates ============
interface RoleTemplate {
  name: string;
  color: string;
  description: string;
  permissions: Partial<Record<PermissionKey, boolean>>;
}

const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    name: 'หัวหน้าแคชเชียร์',
    color: '#7C3AED',
    description: 'ขายสินค้าได้ ยกเลิกรายการได้ ดูประวัติทั้งหมด ดูแดชบอร์ด',
    permissions: {
      process_sales: true, void_transactions: true,
      view_transactions: true, view_all_transactions: true,
      view_dashboard: true,
    },
  },
  {
    name: 'ผู้จัดการคลังสินค้า',
    color: '#D97706',
    description: 'จัดการสินค้า สต็อก หมวดหมู่ ดูต้นทุนและรายงาน',
    permissions: {
      manage_products: true, manage_inventory: true, manage_categories: true,
      view_cost: true, view_dashboard: true, view_reports: true,
      view_transactions: true, view_all_transactions: true,
    },
  },
  {
    name: 'พนักงานขายทั่วไป',
    color: '#3B82F6',
    description: 'ขายสินค้าได้อย่างเดียว ดูประวัติของตัวเองได้',
    permissions: {
      process_sales: true, view_transactions: true,
    },
  },
  {
    name: 'ผู้ตรวจสอบ',
    color: '#DC2626',
    description: 'ดูรายงาน ดูประวัติ ดู Audit Log และ Alert การโกง',
    permissions: {
      view_dashboard: true, view_reports: true, view_profit: true,
      view_transactions: true, view_all_transactions: true,
      view_audit_log: true, view_fraud_alerts: true,
    },
  },
];

// ============ Zod schema ============
const roleSchema = z.object({
  name: z.string().min(1, 'กรุณากรอกชื่อยศ').max(50, 'ชื่อยศยาวเกินไป'),
  color: z.string().min(4, 'กรุณาเลือกสี'),
  permissions: z.record(z.boolean()),
});
type RoleForm = z.infer<typeof roleSchema>;

const PRESET_COLORS = [
  '#0A4D3C','#3B82F6','#7C3AED','#D97706','#DC2626',
  '#059669','#DB2777','#0891B2','#9333EA','#B45309',
];

export default function RolesPage() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const [userCounts, setUserCounts] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState('roles');

  useEffect(() => { loadRoles(); }, []);

  const loadRoles = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('roles')
      .select('*')
      .order('sort_order');
    setRoles(Array.isArray(data) ? data : []);

    // นับจำนวนผู้ใช้ต่อยศ
    const { data: profileData } = await supabase
      .from('profiles')
      .select('role_id')
      .not('role_id', 'is', null);
    const counts: Record<string, number> = {};
    (profileData || []).forEach((p: { role_id: string }) => {
      if (p.role_id) counts[p.role_id] = (counts[p.role_id] || 0) + 1;
    });
    setUserCounts(counts);
    setLoading(false);
  };

  const form = useForm<RoleForm>({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      name: '',
      color: '#3B82F6',
      permissions: Object.fromEntries(ALL_PERMISSION_KEYS.map(k => [k, false])),
    },
  });

  const openCreate = (template?: RoleTemplate) => {
    form.reset({
      name: template ? template.name + ' (คัดลอก)' : '',
      color: template?.color ?? '#3B82F6',
      permissions: Object.fromEntries(
        ALL_PERMISSION_KEYS.map(k => [k, template?.permissions[k] ?? false])
      ),
    });
    setEditingRole(null);
    setIsCreateOpen(true);
  };

  const openEdit = (role: Role) => {
    form.reset({
      name: role.name,
      color: role.color,
      permissions: Object.fromEntries(
        ALL_PERMISSION_KEYS.map(k => [k, role.permissions[k] ?? false])
      ),
    });
    setEditingRole(role);
    setIsCreateOpen(true);
  };

  const handleSave = async (values: RoleForm) => {
    if (editingRole) {
      const { error } = await supabase
        .from('roles')
        .update({ name: values.name, color: values.color, permissions: values.permissions, updated_at: new Date().toISOString() })
        .eq('id', editingRole.id);
      if (error) { toast.error(t('common.error') + ': ' + error.message); return; }
      toast.success(t('roles.saveSuccess'));
    } else {
      const { error } = await supabase
        .from('roles')
        .insert({ name: values.name, color: values.color, permissions: values.permissions, store_id: profile?.store_id ?? null });
      if (error) { toast.error(t('common.error') + ': ' + error.message); return; }
      toast.success(t('roles.saveSuccess'));
    }
    setIsCreateOpen(false);
    loadRoles();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if ((userCounts[deleteTarget.id] || 0) > 0) {
      toast.error(t('roles.cannotDeleteHasUsers'));
      setDeleteTarget(null);
      return;
    }
    const { error } = await supabase.from('roles').delete().eq('id', deleteTarget.id);
    if (error) { toast.error(t('common.error') + ': ' + error.message); return; }
    toast.success(t('roles.deleteSuccess'));
    setDeleteTarget(null);
    loadRoles();
  };

  const toggleAllInGroup = (groupKeys: PermissionKey[], enabled: boolean) => {
    const current = form.getValues('permissions') as Record<string, boolean>;
    groupKeys.forEach(k => { current[k] = enabled; });
    form.setValue('permissions', current, { shouldDirty: true });
  };

  const permissionValues = form.watch('permissions') as Record<string, boolean>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <UserCog className="w-5 h-5 text-primary" />
            {t('roles.title')}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">{t('roles.subtitle')}</p>
        </div>
        <Button onClick={() => openCreate()} className="shrink-0">
          <Plus className="w-4 h-4 mr-2" />
          {t('roles.addRole')}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="roles">{t('roles.title')}</TabsTrigger>
          <TabsTrigger value="templates">{t('roles.templates')}</TabsTrigger>
        </TabsList>

        {/* ===== TAB: รายการยศ ===== */}
        <TabsContent value="roles" className="mt-4">
          {loading ? (
            <div className="grid gap-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 bg-muted rounded-xl" />)}
            </div>
          ) : (
            <div className="grid gap-3">
              {roles.map(role => {
                const count = userCounts[role.id] || 0;
                const permCount = Object.values(role.permissions).filter(Boolean).length;
                return (
                  <div
                    key={role.id}
                    className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 hover:border-primary/40 transition-colors"
                  >
                    {/* Color badge */}
                    <div
                      className="w-3 h-10 rounded-full shrink-0"
                      style={{ backgroundColor: role.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground text-sm">{role.name}</span>
                        {role.is_system && (
                          <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5">ระบบ</Badge>
                        )}
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ backgroundColor: role.color + '22', color: role.color }}
                        >
                          {permCount} สิทธิ์
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {count} คน
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {ALL_PERMISSION_KEYS.filter(k => role.permissions[k]).slice(0, 3).map(k => {
                            return t(`permissions.${k}`);
                          }).filter(Boolean).join(', ')}
                          {permCount > 3 ? ` +${permCount - 3}` : ''}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-8 h-8 text-muted-foreground hover:text-foreground"
                        onClick={() => openCreate({
                          name: role.name,
                          color: role.color,
                          description: '',
                          permissions: role.permissions,
                        })}
                        title="คัดลอกยศ"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-8 h-8 text-muted-foreground hover:text-primary"
                        onClick={() => openEdit(role)}
                        title="แก้ไข"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      {!role.is_system && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-8 h-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteTarget(role)}
                          title="ลบ"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ===== TAB: Role Templates ===== */}
        <TabsContent value="templates" className="mt-4">
          <p className="text-sm text-muted-foreground mb-4">{t('roles.templatesHint')}</p>
          <div className="grid md:grid-cols-2 gap-4">
            {ROLE_TEMPLATES.map(tmpl => {
              const permCount = Object.values(tmpl.permissions).filter(Boolean).length;
              return (
                <div
                  key={tmpl.name}
                  className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 hover:border-primary/40 transition-colors cursor-pointer"
                  onClick={() => { openCreate(tmpl); setActiveTab('roles'); }}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-4 h-8 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: tmpl.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground">{tmpl.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{tmpl.description}</p>
                    </div>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                      style={{ backgroundColor: tmpl.color + '22', color: tmpl.color }}
                    >
                      {permCount} {t('roles.permissionsLabel')}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(tmpl.permissions)
                      .filter(([, v]) => v)
                      .map(([k]) => (
                        <span key={k} className="bg-muted text-muted-foreground text-xs px-2 py-0.5 rounded-full">
                          {t(`roles.permissions.${k}`, k)}
                        </span>
                      ))}
                  </div>
                  <Button size="sm" className="mt-1 w-full" onClick={e => { e.stopPropagation(); openCreate(tmpl); setActiveTab('roles'); }}>
                    <Plus className="w-3 h-3 mr-1" />
                    {t('roles.useTemplate')}
                  </Button>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* ===== Create/Edit Dialog ===== */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              {editingRole ? t('roles.editRole') : t('roles.addRole')}
            </DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSave)} className="space-y-5">
              <div className="grid md:grid-cols-2 gap-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('roles.roleName')}</FormLabel>
                    <FormControl>
                      <Input placeholder="เช่น หัวหน้าแคชเชียร์" {...field} disabled={editingRole?.is_system} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="color" render={({ field }) => (
                  <FormItem>
                    <FormLabel>สีประจำยศ</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-2">
                        <div className="flex flex-wrap gap-1.5">
                          {PRESET_COLORS.map(c => (
                            <button
                              key={c}
                              type="button"
                              className={`w-6 h-6 rounded-full border-2 transition-transform ${field.value === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                              style={{ backgroundColor: c }}
                              onClick={() => field.onChange(c)}
                            />
                          ))}
                        </div>
                        <input
                          type="color"
                          value={field.value}
                          onChange={e => field.onChange(e.target.value)}
                          className="w-8 h-8 rounded cursor-pointer border border-border"
                          title="เลือกสีเอง"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {/* Preview */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">ตัวอย่าง:</span>
                <span
                  className="text-xs px-2.5 py-1 rounded-full font-medium"
                  style={{
                    backgroundColor: (form.watch('color') || '#3B82F6') + '22',
                    color: form.watch('color') || '#3B82F6',
                  }}
                >
                  {form.watch('name') || 'ชื่อยศ'}
                </span>
              </div>

              <Separator />

              {/* Permissions */}
              <div>
                <p className="text-sm font-semibold text-foreground mb-3">{t('roles.permissionsLabel')}</p>
                {editingRole?.is_system ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted rounded-lg p-3">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{t('roles.systemRoleCannotEdit')}</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {PERMISSION_GROUPS.map(group => {
                      const groupKeys = group.items.map(i => i.key);
                      const allChecked = groupKeys.every(k => permissionValues[k]);
                      const someChecked = groupKeys.some(k => permissionValues[k]);
                      return (
                        <div key={group.group} className="bg-muted/40 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              {t(`roles.permissionGroups.${group.group}`, group.group)}
                            </p>
                            <button
                              type="button"
                              onClick={() => toggleAllInGroup(groupKeys, !allChecked)}
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                              {allChecked ? (
                                <><ToggleRight className="w-3.5 h-3.5" /> {t('common.deselectAll')}</>
                              ) : (
                                <><ToggleLeft className="w-3.5 h-3.5" /> {t('common.selectAll')}</>
                              )}
                            </button>
                          </div>
                          <div className="grid sm:grid-cols-2 gap-2">
                            {group.items.map(item => (
                              <FormField
                                key={item.key}
                                control={form.control}
                                name={`permissions.${item.key}`}
                                render={({ field }) => (
                                  <FormItem className="flex items-start gap-2.5 space-y-0 bg-card rounded-lg p-2.5 border border-border">
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value as boolean}
                                        onCheckedChange={field.onChange}
                                        className="mt-0.5"
                                      />
                                    </FormControl>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-foreground leading-snug">
                                        {t(`roles.permissions.${item.key}`, item.key)}
                                      </p>
                                      <p className="text-xs text-muted-foreground mt-0.5">
                                        {t(`roles.permissionsDesc.${item.key}`, '')}
                                      </p>
                                    </div>
                                  </FormItem>
                                )}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Summary */}
              <div className="flex items-center gap-2 text-sm">
                <ChevronRight className="w-4 h-4 text-primary shrink-0" />
                <span className="text-muted-foreground">{t('roles.activePermissions')}:</span>
                <span className="font-semibold text-primary">
                  {Object.values(permissionValues).filter(Boolean).length} / {ALL_PERMISSION_KEYS.length}
                </span>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? t('common.loading') : editingRole ? t('common.save') : t('roles.addRole')}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ===== Delete Confirm ===== */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('roles.deleteConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('roles.deleteRole')}: <strong>{deleteTarget?.name}</strong>
              {(userCounts[deleteTarget?.id || ''] || 0) > 0 && (
                <span className="block mt-2 text-destructive">
                  ⚠️ มีพนักงาน {userCounts[deleteTarget?.id || '']} คนที่ใช้ยศนี้อยู่
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              {t('roles.deleteRole')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
