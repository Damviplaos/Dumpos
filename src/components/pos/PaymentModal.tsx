import { useState } from 'react';
import { CreditCard, Banknote, QrCode, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { formatCurrency } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useAuditLog } from '@/hooks/useAuditLog';
import type { CartItem, PaymentMethod } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import QRCodeDataUrl from '@/components/ui/qrcodedataurl';

interface PaymentModalProps {
  cart: CartItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  taxRate: number;
  cashierId: string;
  onSuccess: (txId: string, orderNumber: string) => void;
  onClose: () => void;
}

const paymentMethods: { key: PaymentMethod; label: string; icon: React.ElementType }[] = [
  { key: 'cash', label: 'เงินสด', icon: Banknote },
  { key: 'card', label: 'บัตรเครดิต/เดบิต', icon: CreditCard },
  { key: 'qr', label: 'QR Code', icon: QrCode },
];

export default function PaymentModal({
  cart, subtotal, taxAmount, total, taxRate,
  cashierId, onSuccess, onClose,
}: PaymentModalProps) {
  const { profile } = useAuth();
  const { log } = useAuditLog();
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [processing, setProcessing] = useState(false);

  const cashReceivedNum = parseFloat(cashReceived) || 0;
  const changeAmount = method === 'cash' ? Math.max(0, cashReceivedNum - total) : 0;
  const canPay = method !== 'cash' || cashReceivedNum >= total;

  const quickCash = [
    Math.ceil(total / 20) * 20,
    Math.ceil(total / 50) * 50,
    Math.ceil(total / 100) * 100,
    Math.ceil(total / 500) * 500,
  ].filter((v, i, arr) => arr.indexOf(v) === i && v >= total).slice(0, 4);

  const handleConfirmPayment = async () => {
    if (!canPay) { toast.error('จำนวนเงินไม่เพียงพอ'); return; }
    setProcessing(true);
    try {
      // Insert transaction
      const { data: tx, error: txErr } = await supabase
        .from('transactions')
        .insert({
          order_number: '',
          cashier_id: cashierId || null,
          store_id: profile?.store_id ?? null,
          subtotal,
          tax_amount: taxAmount,
          total,
          payment_method: method,
          cash_received: method === 'cash' ? cashReceivedNum : total,
          change_amount: changeAmount,
          status: 'completed',
        })
        .select()
        .maybeSingle();

      if (txErr || !tx) throw txErr || new Error('ไม่สามารถสร้างรายการได้');

      // Insert transaction items
      const items = cart.map(i => ({
        transaction_id: tx.id,
        product_id: i.product.id,
        product_name: i.product.name,
        product_sku: i.product.sku || null,
        quantity: i.quantity,
        unit_price: i.unit_price,
        cost: i.product.cost,
        subtotal: i.subtotal,
      }));
      const { error: itemsErr } = await supabase.from('transaction_items').insert(items);
      if (itemsErr) throw itemsErr;

      // Deduct stock + inventory log
      for (const item of cart) {
        const { data: prod } = await supabase
          .from('products')
          .select('stock')
          .eq('id', item.product.id)
          .maybeSingle();
        const prevStock = prod?.stock || 0;
        const newStock = prevStock - item.quantity;
        await supabase.from('products').update({ stock: newStock }).eq('id', item.product.id);
        await supabase.from('inventory_logs').insert({
          product_id: item.product.id,
          change_amount: -item.quantity,
          previous_stock: prevStock,
          new_stock: newStock,
          reason: 'sale',
          reference_id: tx.id,
          created_by: cashierId || null,
          store_id: profile?.store_id ?? null,
        });
      }

      toast.success(`ชำระเงินสำเร็จ! ${tx.order_number}`);

      // บันทึก audit log
      await log('process_sale', {
        entityType: 'transaction',
        entityId: tx.id,
        details: {
          order_number: tx.order_number,
          total,
          payment_method: method,
          item_count: cart.length,
        },
      });

      onSuccess(tx.id, tx.order_number);
    } catch (err: unknown) {
      toast.error(`เกิดข้อผิดพลาด: ${err instanceof Error ? err.message : 'ไม่ทราบสาเหตุ'}`);
      setProcessing(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
        <DialogHeader>
          <DialogTitle>ชำระเงิน</DialogTitle>
        </DialogHeader>

        {/* Order summary */}
        <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
          <div className="flex justify-between text-muted-foreground">
            <span>รายการสินค้า ({cart.length} รายการ)</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {taxRate > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>VAT {taxRate}%</span>
              <span>{formatCurrency(taxAmount)}</span>
            </div>
          )}
          <Separator className="my-1" />
          <div className="flex justify-between font-bold text-foreground text-base">
            <span>ยอดชำระ</span>
            <span className="text-primary">{formatCurrency(total)}</span>
          </div>
        </div>

        {/* Payment method */}
        <div>
          <Label className="text-sm font-normal text-muted-foreground mb-2 block">วิธีชำระเงิน</Label>
          <div className="grid grid-cols-3 gap-2">
            {paymentMethods.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setMethod(key)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-colors min-h-16 ${
                  method === key
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/40'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium text-center leading-tight">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Cash input */}
        {method === 'cash' && (
          <div className="space-y-3">
            <div>
              <Label className="text-sm font-normal text-muted-foreground mb-1.5 block">จำนวนเงินที่รับ</Label>
              <Input
                type="number"
                value={cashReceived}
                onChange={e => setCashReceived(e.target.value)}
                placeholder="0.00"
                className="text-xl font-bold h-12 text-center"
                autoFocus
                min={0}
              />
            </div>
            {/* Quick cash buttons */}
            <div className="flex gap-2 flex-wrap">
              {quickCash.map(v => (
                <Button
                  key={v}
                  variant="outline"
                  size="sm"
                  onClick={() => setCashReceived(v.toString())}
                  className="text-xs h-8"
                >
                  ฿{v.toLocaleString()}
                </Button>
              ))}
            </div>
            {cashReceivedNum >= total && (
              <div className="bg-success/10 rounded-lg p-3 flex justify-between items-center">
                <span className="text-sm font-medium text-success">เงินทอน</span>
                <span className="text-lg font-bold text-success">{formatCurrency(changeAmount)}</span>
              </div>
            )}
          </div>
        )}

        {/* Card payment */}
        {method === 'card' && (
          <div className="bg-info/10 rounded-lg p-4 text-center">
            <CreditCard className="w-10 h-10 text-info mx-auto mb-2" />
            <p className="text-sm font-medium text-info">รูดบัตรหรือแตะบัตรที่เครื่องอ่านบัตร</p>
            <p className="text-xs text-muted-foreground mt-1">กดยืนยันเมื่อชำระเรียบร้อย</p>
          </div>
        )}

        {/* QR payment */}
        {method === 'qr' && (
          <div className="flex flex-col items-center gap-3 py-2">
            <QRCodeDataUrl
              text={`PromptPay|${total.toFixed(2)}`}
              width={160}
            />
            <p className="text-sm font-bold text-foreground">{formatCurrency(total)}</p>
            <p className="text-xs text-muted-foreground">สแกน QR Code เพื่อชำระเงิน</p>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={processing}>
            ยกเลิก
          </Button>
          <Button
            className="flex-1 h-11 font-semibold"
            onClick={handleConfirmPayment}
            disabled={processing || !canPay}
          >
            {processing ? (
              'กำลังประมวลผล...'
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                ยืนยันการชำระ
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
