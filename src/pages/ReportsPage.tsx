import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, TrendingUp, TrendingDown, DollarSign, ShoppingBag, Package, ChevronDown, Camera } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { supabase } from '@/db/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';
import { sendScreenshotToTelegram } from '@/hooks/useTelegramScreenshot';

interface SalesSummary {
  totalSales: number;
  totalOrders: number;
  totalProfit: number;
  profitMargin: number;
  avgOrderValue: number;
}

interface TopProduct { name: string; qty: number; revenue: number; }
interface ChartPoint { label: string; sales: number; profit: number; }

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

type PresetKey = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom';

function toDateStr(d: Date) { return d.toISOString().split('T')[0]; }

function getPresetRange(key: PresetKey): { from: string; to: string } {
  const now = new Date();
  const today = toDateStr(now);
  if (key === 'today') return { from: today, to: today };
  if (key === 'yesterday') {
    const y = new Date(now); y.setDate(now.getDate() - 1); const ys = toDateStr(y);
    return { from: ys, to: ys };
  }
  if (key === 'week') {
    const w = new Date(now); w.setDate(now.getDate() - 6);
    return { from: toDateStr(w), to: today };
  }
  if (key === 'month') {
    return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, to: today };
  }
  if (key === 'year') {
    return { from: `${now.getFullYear()}-01-01`, to: today };
  }
  return { from: today, to: today };
}

// Build chart labels based on range length
function buildChartData(txArr: any[], from: string, to: string): ChartPoint[] {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const diffDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const points: ChartPoint[] = [];

  if (diffDays <= 31) {
    // Daily breakdown
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = toDateStr(d);
      const dayTx = txArr.filter((t: any) => t.created_at?.startsWith(ds));
      const sales = dayTx.reduce((s: number, t: any) => s + (t.total || 0), 0);
      const profit = dayTx.reduce((s: number, t: any) =>
        s + (Array.isArray(t.items) ? t.items : []).reduce((si: number, i: any) => si + ((i.unit_price - i.cost) * i.quantity), 0), 0);
      points.push({ label: formatDate(new Date(ds), 'short'), sales: Math.round(sales), profit: Math.round(profit) });
    }
  } else {
    // Monthly breakdown
    const months: Record<string, ChartPoint> = {};
    txArr.forEach((t: any) => {
      const mo = t.created_at?.slice(0, 7); // "2025-06"
      if (!mo) return;
      if (!months[mo]) {
        const d = new Date(mo + '-01');
        const label = d.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
        months[mo] = { label, sales: 0, profit: 0 };
      }
      months[mo].sales += Math.round(t.total || 0);
      const profit = (Array.isArray(t.items) ? t.items : []).reduce((si: number, i: any) => si + ((i.unit_price - i.cost) * i.quantity), 0);
      months[mo].profit += Math.round(profit);
    });
    Object.keys(months).sort().forEach(k => points.push(months[k]));
  }
  return points;
}

export default function ReportsPage() {
  const { t } = useTranslation();
  const [preset, setPreset] = useState<PresetKey>('week');

  const PRESETS: { key: PresetKey; label: string }[] = [
    { key: 'today', label: t('reports.today') },
    { key: 'yesterday', label: t('reports.yesterday') },
    { key: 'week', label: t('dashboard.last7days') },
    { key: 'month', label: t('reports.thisMonth') },
    { key: 'year', label: t('reports.thisYear') },
    { key: 'custom', label: t('reports.custom') },
  ];
  const [customFrom, setCustomFrom] = useState(toDateStr(new Date()));
  const [customTo, setCustomTo] = useState(toDateStr(new Date()));
  const [showCustom, setShowCustom] = useState(false);

  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const getRange = useCallback(() => {
    if (preset === 'custom') return { from: customFrom, to: customTo };
    return getPresetRange(preset);
  }, [preset, customFrom, customTo]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    const { from, to } = getRange();

    const { data: txData } = await supabase
      .from('transactions')
      .select('total, created_at, items:transaction_items(product_name, quantity, unit_price, cost, subtotal)')
      .gte('created_at', `${from}T00:00:00`)
      .lte('created_at', `${to}T23:59:59`)
      .eq('status', 'completed')
      .order('created_at');

    const txArr = Array.isArray(txData) ? txData : [];
    const totalSales = txArr.reduce((s: number, t: any) => s + (t.total || 0), 0);
    const totalOrders = txArr.length;
    const totalProfit = txArr.reduce((s: number, t: any) =>
      s + (Array.isArray(t.items) ? t.items : []).reduce((si: number, i: any) => si + ((i.unit_price - i.cost) * i.quantity), 0), 0);
    const profitMargin = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;
    const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
    setSummary({ totalSales, totalOrders, totalProfit, profitMargin, avgOrderValue });

    // Top products
    const productMap: Record<string, TopProduct> = {};
    txArr.forEach((t: any) => {
      (Array.isArray(t.items) ? t.items : []).forEach((i: any) => {
        if (!productMap[i.product_name]) productMap[i.product_name] = { name: i.product_name, qty: 0, revenue: 0 };
        productMap[i.product_name].qty += i.quantity;
        productMap[i.product_name].revenue += i.subtotal || (i.unit_price * i.quantity);
      });
    });
    setTopProducts(Object.values(productMap).sort((a, b) => b.qty - a.qty).slice(0, 10));
    setChartData(buildChartData(txArr, from, to));
    setLoading(false);
  }, [getRange]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const applyPreset = (key: PresetKey) => {
    setPreset(key);
    if (key === 'custom') { setShowCustom(true); return; }
    setShowCustom(false);
  };

  const activeLabel = preset === 'custom'
    ? `${customFrom} — ${customTo}`
    : PRESETS.find(p => p.key === preset)?.label ?? t('dashboard.last7days');

  const statCards = [
    { title: t('reports.totalSales'), value: summary ? formatCurrency(summary.totalSales) : '-', icon: DollarSign, color: 'text-primary', bg: 'bg-primary/10' },
    { title: t('reports.totalOrders'), value: summary ? `${summary.totalOrders} ${t('common.items')}` : '-', icon: ShoppingBag, color: 'text-info', bg: 'bg-info/10' },
    { title: t('reports.totalProfit'), value: summary ? formatCurrency(summary.totalProfit) : '-', icon: TrendingUp, color: 'text-success', bg: 'bg-success/10' },
    { title: t('reports.profitMargin'), value: summary ? `${summary.profitMargin.toFixed(1)}%` : '-', icon: TrendingDown, color: 'text-warning', bg: 'bg-warning/10' },
    { title: t('dashboard.avgOrderValue'), value: summary ? formatCurrency(summary.avgOrderValue) : '-', icon: CalendarDays, color: 'text-chart-4', bg: 'bg-chart-4/10' },
  ];

  return (
    <div className="space-y-5" id="reports-capture">
      {/* Header + date range picker */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground text-balance">{t('reports.title')}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{activeLabel}</p>
        </div>
        <div className="md:ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => sendScreenshotToTelegram({ elementId: 'reports-capture', caption: `📈 ${t('reports.title')} — ${activeLabel}` })}
            title={t('dashboard.sendToTelegram')}
          >
            <Camera className="w-4 h-4 mr-1.5" />
            <span className="hidden md:inline">{t('dashboard.sendToTelegram')}</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <CalendarDays className="w-4 h-4 shrink-0" />
                <span className="truncate max-w-[160px]">{activeLabel}</span>
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
                {t('reports.custom')}...
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Custom date range inputs */}
      {showCustom && (
        <div className="flex flex-wrap items-end gap-3 p-4 bg-muted/50 rounded-xl border border-border">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">{t('common.from')}</label>
            <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="h-9 w-40" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">{t('common.to')}</label>
            <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="h-9 w-40" />
          </div>
          <Button size="sm" onClick={loadReport} className="h-9">{t('reports.viewReport')}</Button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title} className="h-full">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-4 h-4 ${card.color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground text-balance leading-tight">{card.title}</p>
                    {loading ? (
                      <Skeleton className="h-6 w-20 mt-1 bg-muted" />
                    ) : (
                      <p className="text-base font-bold text-foreground mt-0.5 break-words">{card.value}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">{t('reports.salesAndProfit')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="w-full h-56 bg-muted" />
            ) : chartData.length === 0 ? (
              <div className="flex items-center justify-center h-56 text-muted-foreground text-sm">{t('common.noDataInRange')}</div>
            ) : (
              <div className="w-full min-w-0 overflow-hidden">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" interval="preserveStartEnd" />
                    <YAxis tickFormatter={v => `฿${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      formatter={(value: number, name: string) => [formatCurrency(value), name]}
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                    />
                    <Legend layout="horizontal" wrapperStyle={{ paddingTop: 8 }} />
                  <Bar dataKey="sales" name={t('dashboard.sales')} fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="profit" name={t('dashboard.profit')} fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top products pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">{t('reports.topProductsPie')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="w-full h-56 bg-muted" />
            ) : topProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-56 text-muted-foreground">
                <Package className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">{t('common.noData')}</p>
              </div>
            ) : (
              <div className="w-full min-w-0 overflow-hidden">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={topProducts.slice(0, 5)} dataKey="qty" nameKey="name"
                      cx="50%" cy="50%" outerRadius={70}
                      label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {topProducts.slice(0, 5).map((_, index) => (
                        <Cell key={index} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number, name: string) => [`${v} ${t('common.pieces')}`, name]}
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                    <Legend layout="horizontal" wrapperStyle={{ paddingTop: 4, fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Products table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">{t('reports.top10Products')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto w-full max-w-full">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">#</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">{t('reports.product')}</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">{t('reports.qtySold')}</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">{t('reports.revenue')}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-border">
                      {[...Array(4)].map((_, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 bg-muted" /></td>
                      ))}
                    </tr>
                  ))
                ) : topProducts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-muted-foreground text-sm">{t('common.noDataInRange')}</td>
                  </tr>
                ) : topProducts.map((p, i) => (
                  <tr key={p.name} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-xs font-bold ${i < 3 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                        {i + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">{p.name}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">{p.qty}</td>
                    <td className="px-4 py-3 text-right font-semibold text-primary whitespace-nowrap">{formatCurrency(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
