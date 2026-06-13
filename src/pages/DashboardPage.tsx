import { useEffect, useState, useCallback } from 'react';
import { TrendingUp, ShoppingBag, DollarSign, Package, AlertTriangle, CalendarDays, ChevronDown, Camera } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { supabase } from '@/db/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';
import { sendScreenshotToTelegram } from '@/hooks/useTelegramScreenshot';
import type { Transaction, Product } from '@/types/types';

interface DashboardStats {
  totalSales: number;
  totalOrders: number;
  totalProfit: number;
  lowStockCount: number;
}

interface ChartData {
  label: string;
  ยอดขาย: number;
  กำไร: number;
}

type PresetKey = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'today', label: 'วันนี้' },
  { key: 'yesterday', label: 'เมื่อวาน' },
  { key: 'week', label: '7 วันล่าสุด' },
  { key: 'month', label: 'เดือนนี้' },
  { key: 'custom', label: 'กำหนดเอง' },
];

function toDateStr(d: Date) { return d.toISOString().split('T')[0]; }

function getPresetRange(key: PresetKey): { from: string; to: string } {
  const now = new Date();
  const today = toDateStr(now);
  if (key === 'today') return { from: today, to: today };
  if (key === 'yesterday') {
    const y = new Date(now); y.setDate(now.getDate() - 1);
    const ys = toDateStr(y); return { from: ys, to: ys };
  }
  if (key === 'week') {
    const w = new Date(now); w.setDate(now.getDate() - 6);
    return { from: toDateStr(w), to: today };
  }
  if (key === 'month') {
    return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, to: today };
  }
  return { from: today, to: today };
}

export default function DashboardPage() {
  const [preset, setPreset] = useState<PresetKey>('today');
  const [customFrom, setCustomFrom] = useState(toDateStr(new Date()));
  const [customTo, setCustomTo] = useState(toDateStr(new Date()));
  const [showCustom, setShowCustom] = useState(false);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [recentTx, setRecentTx] = useState<Transaction[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const getRange = useCallback(() => {
    if (preset === 'custom') return { from: customFrom, to: customTo };
    return getPresetRange(preset);
  }, [preset, customFrom, customTo]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    const { from, to } = getRange();

    const [txRes, productsRes, settingsRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('*, items:transaction_items(unit_price, cost, quantity, product_name)')
        .gte('created_at', `${from}T00:00:00`)
        .lte('created_at', `${to}T23:59:59`)
        .eq('status', 'completed')
        .order('created_at', { ascending: false }),
      supabase.from('products').select('*, category:categories(name)').eq('is_active', true),
      supabase.from('store_settings').select('low_stock_threshold').maybeSingle(),
    ]);

    const txArr = Array.isArray(txRes.data) ? txRes.data : [];
    const allProducts = Array.isArray(productsRes.data) ? productsRes.data : [];
    const threshold = settingsRes.data?.low_stock_threshold || 10;

    const totalSales = txArr.reduce((s: number, t: any) => s + (t.total || 0), 0);
    const totalProfit = txArr.reduce((s: number, t: any) => {
      const items = Array.isArray(t.items) ? t.items : [];
      return s + items.reduce((si: number, i: any) => si + ((i.unit_price - i.cost) * i.quantity), 0);
    }, 0);

    setStats({
      totalSales,
      totalOrders: txArr.length,
      totalProfit,
      lowStockCount: allProducts.filter((p: Product) => p.stock <= threshold).length,
    });
    setRecentTx(txArr.slice(0, 5) as Transaction[]);
    setLowStockProducts(allProducts.filter((p: Product) => p.stock <= threshold).slice(0, 5) as Product[]);

    // Build chart: one bar per day in range
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    const days: ChartData[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = toDateStr(d);
      const dayTx = txArr.filter((t: any) => t.created_at?.startsWith(ds));
      const sales = dayTx.reduce((s: number, t: any) => s + (t.total || 0), 0);
      const profit = dayTx.reduce((s: number, t: any) => {
        const items = Array.isArray(t.items) ? t.items : [];
        return s + items.reduce((si: number, it: any) => si + ((it.unit_price - it.cost) * it.quantity), 0);
      }, 0);
      days.push({ label: formatDate(new Date(ds), 'short'), ยอดขาย: Math.round(sales), กำไร: Math.round(profit) });
    }
    setChartData(days);
    setLoading(false);
  }, [getRange]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  const applyPreset = (key: PresetKey) => {
    setPreset(key);
    if (key === 'custom') { setShowCustom(true); return; }
    setShowCustom(false);
  };

  const activeLabel = preset === 'custom'
    ? `${customFrom} — ${customTo}`
    : PRESETS.find(p => p.key === preset)?.label ?? 'วันนี้';

  const statCards = [
    { title: 'ยอดขายรวม', value: stats ? formatCurrency(stats.totalSales) : '-', icon: DollarSign, color: 'text-primary', bg: 'bg-primary/10' },
    { title: 'ออเดอร์', value: stats ? `${stats.totalOrders} รายการ` : '-', icon: ShoppingBag, color: 'text-info', bg: 'bg-info/10' },
    { title: 'กำไรรวม', value: stats ? formatCurrency(stats.totalProfit) : '-', icon: TrendingUp, color: 'text-success', bg: 'bg-success/10' },
    { title: 'สินค้าใกล้หมด', value: stats ? `${stats.lowStockCount} รายการ` : '-', icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10' },
  ];

  return (
    <div className="space-y-6" id="dashboard-capture">
      {/* Header + date range picker */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground text-balance">แดชบอร์ด</h2>
          <p className="text-sm text-muted-foreground mt-0.5">สรุปภาพรวมของร้าน</p>
        </div>
        <div className="md:ml-auto flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => sendScreenshotToTelegram({ elementId: 'dashboard-capture', caption: `📊 แดชบอร์ด — ${activeLabel}` })}
            title="ส่งรูปหน้าจอไป Telegram"
          >
            <Camera className="w-4 h-4 mr-1.5" />
            <span className="hidden md:inline">ส่งรูปไป Telegram</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 min-w-0">
                <CalendarDays className="w-4 h-4 shrink-0" />
                <span className="truncate max-w-[180px]">{activeLabel}</span>
                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {PRESETS.filter(p => p.key !== 'custom').map(p => (
                <DropdownMenuItem key={p.key} onClick={() => applyPreset(p.key)}
                  className={preset === p.key ? 'bg-primary/10 text-primary font-medium' : ''}>
                  {p.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => applyPreset('custom')}
                className={preset === 'custom' ? 'bg-primary/10 text-primary font-medium' : ''}>
                กำหนดเอง...
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Custom date range inputs */}
      {showCustom && (
        <div className="flex flex-wrap items-end gap-3 p-4 bg-muted/50 rounded-xl border border-border">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">จากวันที่</label>
            <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="h-9 w-40" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">ถึงวันที่</label>
            <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="h-9 w-40" />
          </div>
          <Button size="sm" onClick={loadDashboard} className="h-9">ดูข้อมูล</Button>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title} className="h-full">
              <CardContent className="p-4 md:p-5">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground text-balance leading-tight">{card.title}</p>
                    {loading ? (
                      <Skeleton className="h-6 w-20 mt-1 bg-muted" />
                    ) : (
                      <p className="text-base md:text-lg font-bold text-foreground mt-0.5 break-words">{card.value}</p>
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
          <CardTitle className="text-base font-semibold">ยอดขาย & กำไร — {activeLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="w-full h-56 bg-muted" />
          ) : chartData.length === 0 ? (
            <div className="flex items-center justify-center h-56 text-muted-foreground text-sm">ไม่มีข้อมูลในช่วงที่เลือก</div>
          ) : (
            <div className="w-full min-w-0 overflow-hidden">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tickFormatter={(v) => `฿${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    formatter={(value: number, name: string) => [formatCurrency(value), name]}
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
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
              <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 bg-muted" />)}</div>
            ) : recentTx.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">ไม่มีรายการในช่วงที่เลือก</p>
            ) : (
              <div className="space-y-2">
                {recentTx.map((tx) => (
                  <div key={tx.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <ShoppingBag className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{tx.order_number}</p>
                      <p className="text-xs text-muted-foreground">{paymentLabel(tx.payment_method)}</p>
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
              <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 bg-muted" />)}</div>
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
