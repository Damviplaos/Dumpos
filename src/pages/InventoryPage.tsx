import { useEffect, useState } from 'react';
import { AlertTriangle, Package, Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useAuditLog } from '@/hooks/useAuditLog';
import type { Product, StoreSettings } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function InventoryPage() {
  const { profile } = useAuth();
  const { log } = useAuditLog();
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStock, setEditStock] = useState<string>('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [prodRes, settRes] = await Promise.all([
      supabase.from('products').select('*, category:categories(name)').eq('is_active', true).order('name'),
      supabase.from('store_settings').select('*').maybeSingle(),
    ]);
    setProducts(Array.isArray(prodRes.data) ? prodRes.data as Product[] : []);
    setSettings(settRes.data as StoreSettings);
    setLoading(false);
  };

  const threshold = settings?.low_stock_threshold || 10;
  const lowStock = products.filter(p => p.stock <= threshold);
  const outOfStock = products.filter(p => p.stock === 0);

  const startEdit = (product: Product) => {
    setEditingId(product.id);
    setEditStock(product.stock.toString());
  };

  const cancelEdit = () => { setEditingId(null); setEditStock(''); };

  const saveStock = async (product: Product) => {
    const newStock = parseInt(editStock);
    if (isNaN(newStock) || newStock < 0) { toast.error('จำนวนสต็อกต้องเป็นตัวเลขที่ไม่ติดลบ'); return; }
    const prevStock = product.stock;
    const { error } = await supabase.from('products').update({ stock: newStock }).eq('id', product.id);
    if (error) { toast.error('อัปเดตสต็อกไม่สำเร็จ'); return; }
    await supabase.from('inventory_logs').insert({
      product_id: product.id,
      change_amount: newStock - prevStock,
      previous_stock: prevStock,
      new_stock: newStock,
      reason: 'manual_adjust',
      store_id: profile?.store_id ?? null,
    });
    toast.success(`อัปเดตสต็อก ${product.name} แล้ว`);

    // บันทึก audit log + ตรวจสอบการโกงสต็อก
    const diff = newStock - prevStock;
    await log('adjust_stock', {
      entityType: 'product',
      entityId: product.id,
      details: {
        product_name: product.name,
        prev_stock: prevStock,
        new_stock: newStock,
        change: diff,
      },
      severity: Math.abs(diff) > 50 ? 'warning' : 'info',
    });
    // ตรวจสอบการโกงสต็อก (function จะตรวจสอบความถี่เองใน audit_logs)
    if (profile?.id) {
      await supabase.rpc('check_stock_fraud', {
        p_user_id: profile.id,
        p_username: profile.username,
      });
    }

    cancelEdit();
    loadData();
  };

  const stockRow = (product: Product) => {
    const isEditing = editingId === product.id;
    const isLow = product.stock <= threshold && product.stock > 0;
    const isOut = product.stock === 0;
    return (
      <TableRow key={product.id} className="hover:bg-muted/30">
        <TableCell className="whitespace-nowrap">
          <div className="flex items-center gap-2 min-w-0">
            <Package className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate max-w-[180px]">{product.name}</p>
              {product.sku && <p className="text-xs text-muted-foreground">{product.sku}</p>}
            </div>
          </div>
        </TableCell>
        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
          {(product as any).category?.name || '-'}
        </TableCell>
        <TableCell className="whitespace-nowrap text-right">
          {isEditing ? (
            <div className="flex items-center gap-1.5 justify-end">
              <Input
                type="number"
                value={editStock}
                onChange={e => setEditStock(e.target.value)}
                className="w-20 h-8 text-sm text-center"
                min={0}
                autoFocus
              />
              <Button size="icon" className="w-8 h-8" onClick={() => saveStock(product)}>
                <Check className="w-3.5 h-3.5" />
              </Button>
              <Button variant="outline" size="icon" className="w-8 h-8" onClick={cancelEdit}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : (
            <Badge
              variant="secondary"
              className={`text-xs ${isOut ? 'bg-destructive/10 text-destructive' : isLow ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}
            >
              {product.stock}
            </Badge>
          )}
        </TableCell>
        <TableCell className="whitespace-nowrap text-center">
          {isOut ? (
            <Badge variant="secondary" className="bg-destructive/10 text-destructive text-xs">หมด</Badge>
          ) : isLow ? (
            <Badge variant="secondary" className="bg-warning/10 text-warning text-xs flex items-center gap-1 w-fit mx-auto">
              <AlertTriangle className="w-3 h-3" />ใกล้หมด
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-success/10 text-success text-xs">ปกติ</Badge>
          )}
        </TableCell>
        <TableCell className="whitespace-nowrap text-right">
          {!isEditing && (
            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => startEdit(product)}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          )}
        </TableCell>
      </TableRow>
    );
  };

  const renderTable = (rows: Product[]) => (
    <div className="bg-card border border-border rounded-xl min-w-0">
      <div className="overflow-x-auto w-full max-w-full">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">สินค้า</TableHead>
              <TableHead className="whitespace-nowrap">หมวดหมู่</TableHead>
              <TableHead className="whitespace-nowrap text-right">จำนวนสต็อก</TableHead>
              <TableHead className="whitespace-nowrap text-center">สถานะ</TableHead>
              <TableHead className="whitespace-nowrap text-right">แก้ไข</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(5)].map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-5 bg-muted" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground text-sm">
                  ไม่มีรายการ
                </TableCell>
              </TableRow>
            ) : rows.map(stockRow)}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-foreground text-balance">จัดการสต็อกสินค้า</h2>
        <div className="flex flex-wrap gap-3 mt-2">
          <span className="text-sm text-muted-foreground">สินค้าทั้งหมด: <strong>{products.length}</strong></span>
          <span className="text-sm text-warning">ใกล้หมด: <strong>{lowStock.length}</strong></span>
          <span className="text-sm text-destructive">หมดสต็อก: <strong>{outOfStock.length}</strong></span>
        </div>
      </div>

      <Tabs defaultValue="all">
        <TabsList className="mb-4">
          <TabsTrigger value="all">ทั้งหมด ({products.length})</TabsTrigger>
          <TabsTrigger value="low" className="text-warning data-[state=active]:text-warning">
            ใกล้หมด ({lowStock.length})
          </TabsTrigger>
          <TabsTrigger value="out" className="text-destructive data-[state=active]:text-destructive">
            หมด ({outOfStock.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="all">{renderTable(products)}</TabsContent>
        <TabsContent value="low">{renderTable(lowStock)}</TabsContent>
        <TabsContent value="out">{renderTable(outOfStock)}</TabsContent>
      </Tabs>
    </div>
  );
}
