import { useEffect, useState } from 'react';
import { TrendingUp, ShoppingBag, DollarSign, Package, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { supabase } from '@/db/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Transaction, Product } from '@/types/types';

interface DashboardStats {
  todaySales: number;
  todayOrders: number;
  todayProfit: number;
  lowStockCount: number;
}

interface ChartData {
  label: string;
  ยอดขาย: number;
  กำไร: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [recentTx, setRecentTx] = useState<Transaction[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];

    const [txRes, productsRes, settingsRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('*, items:transaction_items(*)')
        .gte('created_at', `${today}T00:00:00`)
        .lte('created_at', `${today}T23:59:59`)
        .eq('status', 'completed')
        .order('created_at', { ascending: false }),
      supabase.from('products').select('*, category:categories(name)').eq('is_active', true),
      supabase.from('store_settings').select('low_stock_threshold').maybeSingle(),
    ]);

    const todayTx = Array.isArray(txRes.data) ? txRes.data : [];
    const allProducts = Array.isArray(productsRes.data) ? productsRes.data : [];
    const threshold = settingsRes.data?.low_stock_threshold || 10;

    const todaySales = todayTx.reduce((s: number, t: Transaction) => s + (t.total || 0), 0);
    const todayProfit = todayTx.reduce((s: number, t: Transaction) => {
      const items = (t as any).items || [];
      return s + items.reduce((si: number, i: any) => si + ((i.unit_price - i.cost) * i.quantity), 0);
    }, 0);

    setStats({
      todaySales,
      todayOrders: todayTx.length,
      todayProfit,
      lowStockCount: allProducts.filter((p: Product) => p.stock <= threshold).length,
    });

    setRecentTx(todayTx.slice(0, 5) as Transaction[]);
    setLowStockProducts(allProducts.filter((p: Product) => p.stock <= threshold).slice(0, 5) as Product[]);

    // Weekly chart (last 7 days)
    const days: ChartData[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const { data: dayTx } = await supabase
        .from('transactions')
        .select('total, items:transaction_items(unit_price, cost, quantity)')
        .gte('created_at', `${dateStr}T00:00:00`)
        .lte('created_at', `${dateStr}T23:59:59`)
        .eq('status', 'completed');
      const arr = Array.isArray(dayTx) ? dayTx : [];
      const sales = arr.reduce((s: number, t: any) => s + (t.total || 0), 0);
      const profit = arr.reduce((s: number, t: any) => {
        const items = Array.isArray(t.items) ? t.items : [];
        return s + items.reduce((si: number, it: any) => si + ((it.unit_price - it.cost) * it.quantity), 0);
      }, 0);
      days.push({ label: formatDate(d, 'short'), ยอดขาย: Math.round(sales), กำไร: Math.round(profit) });
    }
    setChartData(days);
    setLoading(false);
  };

  const statCards = [
    {
      title: 'ยอดขายวันนี้',
      value: stats ? formatCurrency(stats.todaySales) : '-',
      icon: DollarSign,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      title: 'ออเดอร์วันนี้',
      value: stats ? `${stats.todayOrders} รายการ` : '-',
      icon: ShoppingBag,
      color: 'text-info',
      bg: 'bg-info/10',
    },
    {
      title: 'กำไรวันนี้',
      value: stats ? formatCurrency(stats.todayProfit) : '-',
      icon: TrendingUp,
      color: 'text-success',
      bg: 'bg-success/10',
    },
    {
      title: 'สินค้าใกล้หมด',
      value: stats ? `${stats.lowStockCount} รายการ` : '-',
      icon: AlertTriangle,
      color: 'text-warning',
      bg: 'bg-warning/10',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground text-balance">แดชบอร์ด</h2>
        <p className="text-sm text-muted-foreground mt-1">สรุปภาพรวมของร้านวันนี้</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title} className="h-full">
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className={`w-11 h-11 rounded-lg ${card.bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground text-balance">{card.title}</p>
                    {loading ? (
                      <Skeleton className="h-7 w-24 mt-1 bg-muted" />
                    ) : (
                      <p className="text-xl font-bold text-foreground mt-0.5 break-words">{card.value}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">ยอดขาย 7 วันล่าสุด</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="w-full h-56 bg-muted" />
          ) : (
            <div className="w-full min-w-0 overflow-hidden">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tickFormatter={(v) => `฿${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    formatter={(value: number, name: string) => [formatCurrency(value), name]}
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '13px' }}
                  />
                  <Legend layout="horizontal" wrapperStyle={{ paddingTop: 8 }} />
                  <Bar dataKey="ยอดขาย" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="กำไร" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Recent Transactions */}
        <Card className="h-full flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">รายการขายล่าสุด</CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 bg-muted" />)}
              </div>
            ) : recentTx.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">ยังไม่มีรายการขายวันนี้</p>
            ) : (
              <div className="space-y-2">
                {recentTx.map((tx) => (
                  <div key={tx.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <ShoppingBag className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{tx.order_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {paymentLabel(tx.payment_method)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-foreground shrink-0">{formatCurrency(tx.total)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Low Stock */}
        <Card className="h-full flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              สินค้าใกล้หมด
              {stats && stats.lowStockCount > 0 && (
                <Badge className="bg-warning text-warning-foreground border-0 text-xs">{stats.lowStockCount}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 bg-muted" />)}
              </div>
            ) : lowStockProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">สินค้าทุกรายการมีสต็อกเพียงพอ</p>
            ) : (
              <div className="space-y-2">
                {lowStockProducts.map((product) => (
                  <div key={product.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="w-9 h-9 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
                      <Package className="w-4 h-4 text-warning" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{product.name}</p>
                      <p className="text-xs text-muted-foreground">{(product as any).category?.name || 'ไม่มีหมวดหมู่'}</p>
                    </div>
                    <Badge
                      variant="secondary"
                      className={`shrink-0 text-xs ${product.stock === 0 ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'}`}
                    >
                      เหลือ {product.stock}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function paymentLabel(method: string) {
  const map: Record<string, string> = { cash: 'เงินสด', card: 'บัตรเครดิต/เดบิต', qr: 'QR Code' };
  return map[method] || method;
}
