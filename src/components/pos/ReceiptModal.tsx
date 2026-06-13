import { useEffect, useRef, useState } from 'react';
import { Printer, X, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/db/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Transaction, StoreSettings } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

interface ReceiptModalProps {
  transactionId: string;
  orderNumber: string;
  onClose: () => void;
}

export default function ReceiptModal({ transactionId, orderNumber, onClose }: ReceiptModalProps) {
  const [tx, setTx] = useState<Transaction | null>(null);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadReceipt();
  }, [transactionId]);

  const loadReceipt = async () => {
    setLoading(true);
    const [txRes, settRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('*, items:transaction_items(*), cashier:profiles(username,full_name)')
        .eq('id', transactionId)
        .maybeSingle(),
      supabase.from('store_settings').select('*').maybeSingle(),
    ]);
    setTx(txRes.data as Transaction);
    setSettings(settRes.data as StoreSettings);
    setLoading(false);
  };

  const handlePrint = () => {
    const content = printRef.current?.innerHTML;
    if (!content) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head><title>ใบเสร็จ ${orderNumber}</title>
      <style>
        body { font-family: 'Courier New', monospace; font-size: 12px; width: 80mm; margin: 0 auto; padding: 8px; }
        .center { text-align: center; }
        .right { text-align: right; }
        .bold { font-weight: bold; }
        .separator { border-top: 1px dashed #000; margin: 6px 0; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 2px 0; }
        td:last-child { text-align: right; }
      </style>
      </head><body>${content}</body></html>
    `);
    win.document.close();
    win.print();
    win.close();
  };

  const paymentLabel = (m: string) => ({ cash: 'เงินสด', card: 'บัตรเครดิต/เดบิต', qr: 'QR Code' }[m] || m);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
        {/* Success banner */}
        <div className="flex flex-col items-center py-3 gap-2">
          <CheckCircle2 className="w-12 h-12 text-success" />
          <p className="text-lg font-bold text-foreground">ชำระเงินสำเร็จ!</p>
          <p className="text-sm text-muted-foreground">หมายเลขออเดอร์: <strong>{orderNumber}</strong></p>
        </div>

        {/* Receipt preview */}
        <div className="border border-border rounded-lg p-4 bg-background max-h-[50vh] overflow-y-auto text-sm font-mono">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 bg-muted w-3/4 mx-auto" />
              <Skeleton className="h-4 bg-muted w-1/2 mx-auto" />
              <Skeleton className="h-4 bg-muted" />
              <Skeleton className="h-4 bg-muted" />
            </div>
          ) : tx && (
            <div ref={printRef}>
              <div className="center bold text-base">{settings?.store_name || 'ร้านของฉัน'}</div>
              {settings?.address && <div className="center text-xs">{settings.address}</div>}
              {settings?.phone && <div className="center text-xs">โทร: {settings.phone}</div>}
              <div className="separator" />
              <table>
                <tbody>
                  <tr>
                    <td className="text-muted-foreground">เลขที่:</td>
                    <td className="right">{tx.order_number}</td>
                  </tr>
                  <tr>
                    <td className="text-muted-foreground">วันที่:</td>
                    <td className="right">{formatDate(tx.created_at, 'datetime')}</td>
                  </tr>
                  <tr>
                    <td className="text-muted-foreground">ผู้ขาย:</td>
                    <td className="right">{tx.cashier?.full_name || tx.cashier?.username || '-'}</td>
                  </tr>
                </tbody>
              </table>
              <div className="separator" />
              <table>
                <tbody>
                  {tx.items?.map((item, i) => (
                    <tr key={i}>
                      <td colSpan={2}>
                        <div className="font-medium">{item.product_name}</div>
                        <div className="flex justify-between text-muted-foreground text-xs">
                          <span>{formatCurrency(item.unit_price)} × {item.quantity}</span>
                          <span>{formatCurrency(item.subtotal)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Separator className="my-2" />
              <table>
                <tbody>
                  <tr>
                    <td className="text-muted-foreground">ยอดรวม</td>
                    <td className="right">{formatCurrency(tx.subtotal)}</td>
                  </tr>
                  {tx.tax_amount > 0 && (
                    <tr>
                      <td className="text-muted-foreground">VAT</td>
                      <td className="right">{formatCurrency(tx.tax_amount)}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="bold">รวมทั้งสิ้น</td>
                    <td className="right bold">{formatCurrency(tx.total)}</td>
                  </tr>
                  <tr>
                    <td className="text-muted-foreground">ชำระด้วย</td>
                    <td className="right">{paymentLabel(tx.payment_method)}</td>
                  </tr>
                  {tx.payment_method === 'cash' && (
                    <>
                      <tr>
                        <td className="text-muted-foreground">รับมา</td>
                        <td className="right">{formatCurrency(tx.cash_received)}</td>
                      </tr>
                      <tr>
                        <td className="text-muted-foreground">เงินทอน</td>
                        <td className="right">{formatCurrency(tx.change_amount)}</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
              <div className="separator" />
              <div className="center text-xs text-muted-foreground">ขอบคุณที่ใช้บริการ</div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            <X className="w-4 h-4 mr-1.5" />
            ปิด
          </Button>
          <Button className="flex-1" onClick={handlePrint} disabled={loading}>
            <Printer className="w-4 h-4 mr-1.5" />
            พิมพ์ใบเสร็จ
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
