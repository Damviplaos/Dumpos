import { useEffect, useState, useCallback } from 'react';
import {
  Shield, AlertTriangle, Eye, CheckCircle, Search,
  Filter, RefreshCw, Clock, User, Activity,
  ChevronDown, ChevronRight, Info, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate } from '@/lib/utils';
import type { AuditLog, FraudAlert } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

// ============ ป้ายระดับความเสี่ยง ============
function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, { label: string; className: string }> = {
    high:     { label: 'สูง',    className: 'bg-destructive/10 text-destructive border-destructive/20' },
    medium:   { label: 'กลาง',   className: 'bg-warning/10 text-warning border-warning/20' },
    low:      { label: 'ต่ำ',    className: 'bg-info/10 text-info border-info/20' },
    info:     { label: 'ข้อมูล', className: 'bg-muted text-muted-foreground border-border' },
    warning:  { label: 'เฝ้าระวัง', className: 'bg-warning/10 text-warning border-warning/20' },
    critical: { label: 'วิกฤต', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  };
  const m = map[severity] ?? map.info;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${m.className}`}>
      {m.label}
    </span>
  );
}

// ============ ป้ายประเภท action ============
const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  login:             { label: 'เข้าสู่ระบบ',      color: '#22c55e' },
  logout:            { label: 'ออกจากระบบ',       color: '#6b7280' },
  failed_login:      { label: 'Login ผิดพลาด',    color: '#ef4444' },
  process_sale:      { label: 'ขายสินค้า',        color: '#3b82f6' },
  void_transaction:  { label: 'ยกเลิกรายการ',     color: '#f97316' },
  refund_transaction:{ label: 'คืนเงิน',          color: '#a78bfa' },
  adjust_stock:      { label: 'แก้ไขสต็อก',       color: '#f59e0b' },
  add_product:       { label: 'เพิ่มสินค้า',      color: '#10b981' },
  edit_product:      { label: 'แก้ไขสินค้า',      color: '#06b6d4' },
  delete_product:    { label: 'ลบสินค้า',         color: '#ef4444' },
  add_user:          { label: 'เพิ่มผู้ใช้',      color: '#8b5cf6' },
  edit_user:         { label: 'แก้ไขผู้ใช้',      color: '#6366f1' },
  create_role:       { label: 'สร้างยศ',          color: '#0ea5e9' },
  edit_role:         { label: 'แก้ไขยศ',          color: '#7c3aed' },
  delete_role:       { label: 'ลบยศ',             color: '#ef4444' },
  change_settings:   { label: 'เปลี่ยนตั้งค่า',   color: '#64748b' },
};

function ActionBadge({ action }: { action: string }) {
  const m = ACTION_LABELS[action];
  if (!m) return <span className="text-xs text-muted-foreground">{action}</span>;
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: m.color + '22', color: m.color }}>
      {m.label}
    </span>
  );
}

// ============ Fraud alert type labels ============
const FRAUD_TYPE_LABELS: Record<string, string> = {
  excessive_voids:       'ยกเลิกรายการมากผิดปกติ',
  suspicious_stock_edit: 'แก้ไขสต็อกน่าสงสัย',
  brute_force_login:     'พยายาม Login ซ้ำๆ',
  price_manipulation:    'พยายามแก้ไขราคา',
  after_hours_sale:      'ขายสินค้านอกเวลา',
  transaction_tampering: '🚨 ยักยอกทรัพย์',
};

// ============ Main Component ============
export default function FraudMonitorPage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState('alerts');
  const [alerts, setAlerts] = useState<FraudAlert[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(true);
  const [alertFilter, setAlertFilter] = useState({ severity: 'all', reviewed: 'all' });
  const [logFilter, setLogFilter] = useState({ action: 'all', search: '' });
  const [detailAlert, setDetailAlert] = useState<FraudAlert | null>(null);
  const [detailLog, setDetailLog] = useState<AuditLog | null>(null);
  const [stats, setStats] = useState({ total: 0, high: 0, unreviewed: 0, todayLogs: 0 });

  const loadAlerts = useCallback(async () => {
    setAlertsLoading(true);
    const { data } = await supabase
      .from('fraud_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    const arr = Array.isArray(data) ? data : [];
    setAlerts(arr);
    setStats(s => ({
      ...s,
      total: arr.length,
      high: arr.filter(a => a.severity === 'high').length,
      unreviewed: arr.filter(a => !a.is_reviewed).length,
    }));
    setAlertsLoading(false);
  }, []);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    const { data } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    const arr = Array.isArray(data) ? data : [];
    setAuditLogs(arr);
    const today = new Date().toDateString();
    setStats(s => ({
      ...s,
      todayLogs: arr.filter(l => new Date(l.created_at).toDateString() === today).length,
    }));
    setLogsLoading(false);
  }, []);

  useEffect(() => {
    loadAlerts();
    loadLogs();

    // Realtime subscription for fraud_alerts
    const channel = supabase
      .channel('fraud-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'fraud_alerts' }, async (payload) => {
        const newAlert = payload.new as FraudAlert;
        setAlerts(prev => [newAlert, ...prev]);
        toast.warning('⚠️ พบพฤติกรรมน่าสงสัยใหม่!', { duration: 5000 });

        // ส่ง Telegram แจ้งเตือนทันที
        try {
          const { data: storeSettings } = await supabase
            .from('store_settings')
            .select('telegram_bot_token, telegram_chat_id, store_name')
            .maybeSingle();
          if (storeSettings?.telegram_bot_token && storeSettings?.telegram_chat_id) {
            const severityIcon = newAlert.severity === 'high' ? '🚨' : newAlert.severity === 'medium' ? '⚠️' : 'ℹ️';
            await supabase.functions.invoke('send-telegram', {
              body: {
                bot_token: storeSettings.telegram_bot_token,
                chat_id: storeSettings.telegram_chat_id,
                message: `${severityIcon} *Fraud Alert ใหม่*\n\nร้าน: ${storeSettings.store_name}\nประเภท: ${newAlert.alert_type}\nระดับ: ${newAlert.severity.toUpperCase()}\nรายละเอียด: ${newAlert.description}\nเวลา: ${new Date().toLocaleString('th-TH')}`,
              },
            });
          }
        } catch (_e) {
          // ไม่แสดง error ถ้า Telegram ล้มเหลว
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadAlerts, loadLogs]);

  const markReviewed = async (alert: FraudAlert) => {
    const { error } = await supabase
      .from('fraud_alerts')
      .update({ is_reviewed: true, reviewed_by: profile?.id, reviewed_at: new Date().toISOString() })
      .eq('id', alert.id);
    if (error) { toast.error('อัปเดตไม่สำเร็จ'); return; }
    setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, is_reviewed: true } : a));
    setStats(s => ({ ...s, unreviewed: Math.max(0, s.unreviewed - 1) }));
    toast.success('ทำเครื่องหมายตรวจสอบแล้ว');
  };

  // Filter alerts
  const filteredAlerts = alerts.filter(a => {
    if (alertFilter.severity !== 'all' && a.severity !== alertFilter.severity) return false;
    if (alertFilter.reviewed === 'unreviewed' && a.is_reviewed) return false;
    if (alertFilter.reviewed === 'reviewed' && !a.is_reviewed) return false;
    return true;
  });

  // Filter logs
  const filteredLogs = auditLogs.filter(l => {
    if (logFilter.action !== 'all' && l.action !== logFilter.action) return false;
    if (logFilter.search) {
      const q = logFilter.search.toLowerCase();
      if (!l.username?.toLowerCase().includes(q) && !l.action.toLowerCase().includes(q) && !l.entity_type?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-5 h-5 text-destructive" />
            ระบบตรวจจับการโกง
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">ตรวจสอบพฤติกรรมน่าสงสัยและบันทึกการกระทำของพนักงาน</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { loadAlerts(); loadLogs(); }}>
          <RefreshCw className="w-4 h-4 mr-2" />
          รีเฟรช
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Alert ทั้งหมด', value: stats.total, icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10' },
          { label: 'ระดับสูง', value: stats.high, icon: Shield, color: 'text-destructive', bg: 'bg-destructive/10' },
          { label: 'ยังไม่ตรวจสอบ', value: stats.unreviewed, icon: Eye, color: 'text-info', bg: 'bg-info/10' },
          { label: 'Log วันนี้', value: stats.todayLogs, icon: Activity, color: 'text-primary', bg: 'bg-primary/10' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center shrink-0`}>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold text-foreground font-mono">{s.value}</p>
              <p className="text-xs text-muted-foreground truncate">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="alerts" className="gap-2">
            <AlertTriangle className="w-4 h-4" />
            Alert การโกง
            {stats.unreviewed > 0 && (
              <span className="bg-destructive text-destructive-foreground text-xs rounded-full px-1.5 py-0 min-w-5 text-center ml-1">
                {stats.unreviewed}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="audit">
            <Activity className="w-4 h-4 mr-2" />
            Audit Log
          </TabsTrigger>
        </TabsList>

        {/* ===== ALERTS TAB ===== */}
        <TabsContent value="alerts" className="mt-4 space-y-4">
          {/* Filter bar */}
          <div className="flex gap-2 flex-wrap">
            <Select value={alertFilter.severity} onValueChange={v => setAlertFilter(f => ({ ...f, severity: v }))}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue placeholder="ระดับ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกระดับ</SelectItem>
                <SelectItem value="high">สูง</SelectItem>
                <SelectItem value="medium">กลาง</SelectItem>
                <SelectItem value="low">ต่ำ</SelectItem>
              </SelectContent>
            </Select>
            <Select value={alertFilter.reviewed} onValueChange={v => setAlertFilter(f => ({ ...f, reviewed: v }))}>
              <SelectTrigger className="w-40 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทั้งหมด</SelectItem>
                <SelectItem value="unreviewed">ยังไม่ตรวจสอบ</SelectItem>
                <SelectItem value="reviewed">ตรวจสอบแล้ว</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {alertsLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 bg-muted rounded-xl" />)}
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <CheckCircle className="w-12 h-12 mb-3 text-success/50" />
              <p className="text-sm font-medium">ไม่พบพฤติกรรมน่าสงสัย</p>
              <p className="text-xs mt-1">ระบบกำลังตรวจสอบอยู่</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredAlerts.map(alert => (
                <div
                  key={alert.id}
                  className={`bg-card border rounded-xl p-4 transition-colors cursor-pointer hover:border-primary/40 ${
                    alert.is_reviewed ? 'opacity-60 border-border' : 'border-warning/40'
                  }`}
                  onClick={() => setDetailAlert(alert)}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      alert.severity === 'high' ? 'bg-destructive/10' :
                      alert.severity === 'medium' ? 'bg-warning/10' : 'bg-muted'
                    }`}>
                      <AlertTriangle className={`w-4 h-4 ${
                        alert.severity === 'high' ? 'text-destructive' :
                        alert.severity === 'medium' ? 'text-warning' : 'text-muted-foreground'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <SeverityBadge severity={alert.severity} />
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          alert.alert_type === 'transaction_tampering'
                            ? 'bg-destructive text-destructive-foreground'
                            : 'text-muted-foreground font-mono'
                        }`}>
                          {FRAUD_TYPE_LABELS[alert.alert_type] || alert.alert_type}
                        </span>
                        {alert.is_reviewed && (
                          <span className="text-xs text-success flex items-center gap-0.5">
                            <CheckCircle className="w-3 h-3" />ตรวจสอบแล้ว
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-foreground">{alert.description}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {alert.username || 'ไม่ทราบ'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(alert.created_at, 'datetime')}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!alert.is_reviewed && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={e => { e.stopPropagation(); markReviewed(alert); }}
                        >
                          <CheckCircle className="w-3 h-3 mr-1" />
                          ตรวจสอบ
                        </Button>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ===== AUDIT LOG TAB ===== */}
        <TabsContent value="audit" className="mt-4 space-y-4">
          {/* Filter bar */}
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-40">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={logFilter.search}
                onChange={e => setLogFilter(f => ({ ...f, search: e.target.value }))}
                placeholder="ค้นหาชื่อผู้ใช้หรือ action..."
                className="pl-9 h-9"
              />
            </div>
            <Select value={logFilter.action} onValueChange={v => setLogFilter(f => ({ ...f, action: v }))}>
              <SelectTrigger className="w-44 h-9">
                <SelectValue placeholder="ประเภท" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกประเภท</SelectItem>
                {Object.entries(ACTION_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {logsLoading ? (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 bg-muted rounded-xl" />)}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Activity className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm">ไม่พบ log</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">วันที่/เวลา</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">พนักงาน</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">การกระทำ</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">ประเภท</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">ระดับ</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredLogs.map(log => (
                      <tr
                        key={log.id}
                        className="hover:bg-muted/30 cursor-pointer transition-colors"
                        onClick={() => setDetailLog(log)}
                      >
                        <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">
                          {formatDate(log.created_at, 'datetime')}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="flex items-center gap-1.5">
                            <User className="w-3 h-3 text-muted-foreground" />
                            <span className="font-medium text-foreground">{log.username || '-'}</span>
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <ActionBadge action={log.action} />
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{log.entity_type || '-'}</td>
                        <td className="px-4 py-2.5">
                          <SeverityBadge severity={log.severity} />
                        </td>
                        <td className="px-4 py-2.5">
                          <Info className="w-3.5 h-3.5 text-muted-foreground" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2 border-t border-border bg-muted/30 text-xs text-muted-foreground">
                แสดง {filteredLogs.length} รายการ
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ===== Alert Detail Dialog ===== */}
      <Dialog open={!!detailAlert} onOpenChange={open => !open && setDetailAlert(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              รายละเอียด Alert
            </DialogTitle>
          </DialogHeader>
          {detailAlert && (
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <SeverityBadge severity={detailAlert.severity} />
                <span className="text-muted-foreground">{FRAUD_TYPE_LABELS[detailAlert.alert_type] || detailAlert.alert_type}</span>
              </div>
              <Separator />
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">พนักงาน</span>
                  <span className="font-medium">{detailAlert.username || 'ไม่ทราบ'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">วันที่/เวลา</span>
                  <span>{formatDate(detailAlert.created_at, 'datetime')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">สถานะ</span>
                  <span className={detailAlert.is_reviewed ? 'text-success' : 'text-warning'}>
                    {detailAlert.is_reviewed ? 'ตรวจสอบแล้ว' : 'ยังไม่ตรวจสอบ'}
                  </span>
                </div>
              </div>
              <div className="bg-muted rounded-lg p-3">
                <p className="font-medium mb-1">รายละเอียด</p>
                <p className="text-muted-foreground">{detailAlert.description}</p>
              </div>
              {Object.keys(detailAlert.details || {}).length > 0 && (
                <div className="bg-muted rounded-lg p-3">
                  <p className="font-medium mb-2">ข้อมูลเพิ่มเติม</p>
                  <div className="space-y-1">
                    {Object.entries(detailAlert.details).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{k}</span>
                        <span className="font-mono">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!detailAlert.is_reviewed && (
                <Button
                  className="w-full"
                  onClick={() => { markReviewed(detailAlert); setDetailAlert(null); }}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  ทำเครื่องหมายตรวจสอบแล้ว
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== Log Detail Dialog ===== */}
      <Dialog open={!!detailLog} onOpenChange={open => !open && setDetailLog(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              รายละเอียด Log
            </DialogTitle>
          </DialogHeader>
          {detailLog && (
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <ActionBadge action={detailLog.action} />
                <SeverityBadge severity={detailLog.severity} />
              </div>
              <Separator />
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">พนักงาน</span>
                  <span className="font-medium">{detailLog.username || 'ไม่ทราบ'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">วันที่/เวลา</span>
                  <span>{formatDate(detailLog.created_at, 'datetime')}</span>
                </div>
                {detailLog.entity_type && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ประเภทข้อมูล</span>
                    <span>{detailLog.entity_type}</span>
                  </div>
                )}
                {detailLog.entity_id && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">รหัสข้อมูล</span>
                    <span className="font-mono text-xs">{detailLog.entity_id}</span>
                  </div>
                )}
              </div>
              {Object.keys(detailLog.details || {}).length > 0 && (
                <div className="bg-muted rounded-lg p-3">
                  <p className="font-medium mb-2">ข้อมูลเพิ่มเติม</p>
                  <div className="space-y-1">
                    {Object.entries(detailLog.details).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{k}</span>
                        <span className="font-mono">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
