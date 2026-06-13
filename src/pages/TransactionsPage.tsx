import { useEffect, useState } from 'react';
import { Search, Eye, X, RotateCcw, Ban, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import type { Transaction } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const PAGE_SIZE = 20;

export default function TransactionsPage() {
  const { profile, isAdmin } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterMethod, setFilterMethod] = useState('all');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [voidTx, setVoidTx] = useState<Transaction | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidLoading, setVoidLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => { loadTransactions(); }, [page, filterStatus, filterMethod]);

  const loadTransactions = async () => {
    setLoading(true);
    let query = supabase
      .from('transactions')
      .select('*, cashier:profiles(username, full_name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (filterStatus !== 'all') query = query.eq('status', filterStatus);
    if (filterMethod !== 'all') query = query.eq('payment_method', filterMethod);

    const { data, error, count } = await query;
    if (!error) {
      setTransactions(Array.isArray(data) ? data as Transaction[] : []);
      setTotal(count || 0);
    }
    setLoading(false);
  };

  const loadTxDetail = async (tx: Transaction) => {
    const { data } = await supabase
      .from('transactions')
      .select('*, items:transaction_items(*), cashier:profiles(username, full_name)')
      .eq('id', tx.id)
      .maybeSingle();
    setSelectedTx(data as Transaction);
  };

  const handleVoid = async () => {
    if (!voidTx || !voidReason.trim()) return;
    setVoidLoading(true);

    const { data, error } = await supabase.rpc('void_transaction_safe', {
      p_transaction_id: voidTx.id,
      p_reason: voidReason.trim(),
      p_user_id: profile?.id ?? null,
      p_username: profile?.username ?? 'unknown',
    });

    setVoidLoading(false);

    if (error) {
      toast.error('เกิดข้อผิดพลาด: ' + error.message);
      return;
    }

    const result = data as { success: boolean; blocked?: boolean; fraud_logged?: boolean; error?: string };

    if (result.blocked) {
      // Fraud detected — completed bill tamper attempt
      toast.error('🚨 ถูกบล็อก: ' + result.error, { duration: 6000 });
      toast.warning('⚠️ ระบบบันทึกการพยายามยักยอกทรัพย์แล้ว กรุณาตรวจสอบ Fraud Monitor', { duration: 8000 });
      setVoidTx(null);
      setVoidReason('');
      return;
    }

    if (!result.success) {
      toast.error(result.error || 'ยกเลิกรายการไม่สำเร็จ');
      return;
    }

    // Restore stock for successful void
    const { data: items } = await supabase.from('transaction_items').select('*').eq('transaction_id', voidTx.id);
    if (Array.isArray(items)) {
      for (const item of items) {
        if (!item.product_id) continue;
        const { data: prod } = await supabase.from('products').select('stock').eq('id', item.product_id).maybeSingle();
        const prevStock = prod?.stock || 0;
        const newStock = prevStock + item.quantity;
        await supabase.from('products').update({ stock: newStock }).eq('id', item.product_id);
        await supabase.from('inventory_logs').insert({
          product_id: item.product_id,
          change_amount: item.quantity,
          previous_stock: prevStock,
          new_stock: newStock,
          reason: 'void',
          reference_id: voidTx.id,
          store_id: profile?.store_id ?? null,
        });
      }
    }

    // Check excessive voids fraud
    if (profile?.id) {
      await supabase.rpc('check_void_fraud', {
        p_user_id: profile.id,
        p_username: profile.username,
        p_max_voids: 5,
        p_store_id: profile.store_id ?? null,
      });
    }

    toast.success(`ยกเลิกออเดอร์ ${voidTx.order_number} แล้ว`);
    setVoidTx(null);
    setVoidReason('');
    loadTransactions();
  };

  const filteredLocal = transactions.filter(t =>
    search === '' ||
    t.order_number.toLowerCase().includes(search.toLowerCase())
  );

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      completed: { label: 'สำเร็จ', cls: 'bg-success/10 text-success' },
      voided: { label: 'ยกเลิก', cls: 'bg-destructive/10 text-destructive' },
      refunded: { label: 'คืนเงิน', cls: 'bg-warning/10 text-warning' },
    };
    const s = map[status] || { label: status, cls: 'bg-muted text-muted-foreground' };
    return <Badge variant="secondary" className={`text-xs ${s.cls}`}>{s.label}</Badge>;
  };

  const methodLabel = (m: string) => ({ cash: 'เงินสด', card: 'บัตร', qr: 'QR Code' }[m] || m);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-foreground text-balance">ประวัติการขาย</h2>
        <p className="text-sm text-muted-foreground mt-0.5">รายการขายทั้งหมด {total} รายการ</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาหมายเลขออเดอร์..."
            className="pl-9"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setPage(0); }}>
          <SelectTrigger className="w-full md:w-36">
            <SelectValue placeholder="สถานะทั้งหมด" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">สถานะทั้งหมด</SelectItem>
            <SelectItem value="completed">สำเร็จ</SelectItem>
            <SelectItem value="voided">ยกเลิก</SelectItem>
            <SelectItem value="refunded">คืนเงิน</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterMethod} onValueChange={v => { setFilterMethod(v); setPage(0); }}>
          <SelectTrigger className="w-full md:w-40">
            <SelectValue placeholder="วิธีชำระทั้งหมด" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">วิธีชำระทั้งหมด</SelectItem>
            <SelectItem value="cash">เงินสด</SelectItem>
            <SelectItem value="card">บัตรเครดิต/เดบิต</SelectItem>
            <SelectItem value="qr">QR Code</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border border-border rounded-xl min-w-0">
        <div className="overflow-x-auto w-full max-w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">หมายเลขออเดอร์</TableHead>
                <TableHead className="whitespace-nowrap">วันที่/เวลา</TableHead>
                <TableHead className="whitespace-nowrap">ผู้ขาย</TableHead>
                <TableHead className="whitespace-nowrap text-center">วิธีชำระ</TableHead>
                <TableHead className="whitespace-nowrap text-right">ยอดรวม</TableHead>
                <TableHead className="whitespace-nowrap text-center">สถานะ</TableHead>
                <TableHead className="whitespace-nowrap text-right">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [...Array(8)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(7)].map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 bg-muted" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filteredLocal.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-sm">
                    ไม่พบรายการ
                  </TableCell>
                </TableRow>
              ) : filteredLocal.map(tx => (
                <TableRow key={tx.id} className="hover:bg-muted/30">
                  <TableCell className="whitespace-nowrap font-medium text-sm text-foreground">{tx.order_number}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(tx.created_at, 'datetime')}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {(tx as any).cashier?.full_name || (tx as any).cashier?.username || '-'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-center text-sm">{methodLabel(tx.payment_method)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right font-semibold text-primary">{formatCurrency(tx.total)}</TableCell>
                  <TableCell className="whitespace-nowrap text-center">{statusBadge(tx.status)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => loadTxDetail(tx)} title="ดูรายละเอียด">
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                      {tx.status !== 'voided' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-8 h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => { setVoidTx(tx); setVoidReason(''); }}
                          title="ยกเลิกรายการ"
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>แสดง {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} จาก {total}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 0}>ก่อนหน้า</Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>ถัดไป</Button>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedTx} onOpenChange={v => { if (!v) setSelectedTx(null); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>รายละเอียด {selectedTx?.order_number}</DialogTitle>
          </DialogHeader>
          {selectedTx && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><p className="text-muted-foreground">วันที่/เวลา</p><p className="font-medium">{formatDate(selectedTx.created_at, 'datetime')}</p></div>
                <div><p className="text-muted-foreground">วิธีชำระเงิน</p><p className="font-medium">{methodLabel(selectedTx.payment_method)}</p></div>
                <div><p className="text-muted-foreground">ผู้ขาย</p><p className="font-medium">{(selectedTx as any).cashier?.full_name || (selectedTx as any).cashier?.username || '-'}</p></div>
                <div><p className="text-muted-foreground">สถานะ</p>{statusBadge(selectedTx.status)}</div>
              </div>
              <Separator />
              <div>
                <p className="font-semibold text-foreground mb-2">รายการสินค้า</p>
                <div className="space-y-2">
                  {(selectedTx.items || []).map((item, i) => (
                    <div key={i} className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.product_name}</p>
                        <p className="text-muted-foreground text-xs">{formatCurrency(item.unit_price)} × {item.quantity}</p>
                      </div>
                      <p className="font-semibold shrink-0">{formatCurrency(item.subtotal)}</p>
                    </div>
                  ))}
                </div>
              </div>
              <Separator />
              <div className="space-y-1">
                <div className="flex justify-between text-muted-foreground"><span>ยอดรวมสินค้า</span><span>{formatCurrency(selectedTx.subtotal)}</span></div>
                {selectedTx.tax_amount > 0 && <div className="flex justify-between text-muted-foreground"><span>VAT</span><span>{formatCurrency(selectedTx.tax_amount)}</span></div>}
                <div className="flex justify-between font-bold text-foreground text-base"><span>ยอดชำระ</span><span className="text-primary">{formatCurrency(selectedTx.total)}</span></div>
                {selectedTx.payment_method === 'cash' && (
                  <>
                    <div className="flex justify-between text-muted-foreground"><span>รับมา</span><span>{formatCurrency(selectedTx.cash_received)}</span></div>
                    <div className="flex justify-between text-muted-foreground"><span>เงินทอน</span><span>{formatCurrency(selectedTx.change_amount)}</span></div>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Void Dialog — requires reason, detects completed-bill tampering */}
      <AlertDialog open={!!voidTx} onOpenChange={v => { if (!v) { setVoidTx(null); setVoidReason(''); } }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {voidTx?.status === 'completed' && (
                <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
              )}
              ยืนยันการยกเลิกรายการ
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                {voidTx?.status === 'completed' ? (
                  isAdmin ? (
                    <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 text-warning font-medium">
                      ⚠️ บิลนี้ชำระเงินแล้ว (สถานะ: สำเร็จ)<br />
                      การยกเลิกจะถูกบันทึกในระบบ Audit Log ระดับ Warning<br />
                      ระบบจะคืนสต็อกสินค้ากลับโดยอัตโนมัติ
                    </div>
                  ) : (
                    <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-destructive font-medium">
                      🚫 บิลนี้ชำระเงินแล้ว — ไม่อนุญาตให้ยกเลิก<br />
                      การพยายามยกเลิกจะถูกบันทึกเป็น <strong>หลักฐานการโกง</strong> ทันที
                    </div>
                  )
                ) : (
                  <p>ต้องการยกเลิกออเดอร์ <strong className="text-foreground">{voidTx?.order_number}</strong>?<br />
                  ระบบจะคืนสต็อกสินค้ากลับโดยอัตโนมัติ</p>
                )}
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">
                    เหตุผลการยกเลิก <span className="text-destructive">*</span>
                  </label>
                  <Textarea
                    value={voidReason}
                    onChange={e => setVoidReason(e.target.value)}
                    placeholder="ระบุเหตุผล..."
                    className="resize-none text-sm min-h-[72px]"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-2 mt-2">
            <AlertDialogCancel disabled={voidLoading}>ยกเลิก</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleVoid}
              disabled={!voidReason.trim() || voidLoading}
              className="gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              {voidLoading ? 'กำลังดำเนินการ...' : 'ยืนยันยกเลิก'}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
