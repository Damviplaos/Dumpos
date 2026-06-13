import { useEffect, useState } from 'react';
import { CalendarDays, TrendingUp, TrendingDown, DollarSign, ShoppingBag, Package } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { supabase } from '@/db/supabase';
import { formatCurrency, formatDate } from '@/lib/utils';

type Period = 'week' | 'month' | 'year';

interface SalesSummary {
  totalSales: number;
  totalOrders: number;
  totalProfit: number;
  profitMargin: number;
  avgOrderValue: number;
}

interface TopProduct {
  name: string;
  qty: number;
  revenue: number;
}

interface ChartPoint {
  label: string;
  ยอดขาย: number;
  กำไร: number;
}

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export default function ReportsPage() {
  const [period, setPeriod] = useState<Period>('week');
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadReport(period); }, [period]);

  const loadReport = async (p: Period) => {
    setLoading(true);
    const now = new Date();
    let start: Date;
    if (p === 'week') {
      start = new Date(now); start.setDate(now.getDate() - 6);
    } else if (p === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      start = new Date(now.getFullYear(), 0, 1);
    }
    start.setHours(0, 0, 0, 0);

    const { data: txData } = await supabase
      .from('transactions')
      .select('*, items:transaction_items(product_name, quantity, unit_price, cost, subtotal)')
      .gte('created_at', start.toISOString())
      .eq('status', 'completed')
      .order('created_at');

    const txArr = Array.isArray(txData) ? txData : [];
    const totalSales = txArr.reduce((s: number, t: any) => s + t.total, 0);
    const totalOrders = txArr.length;
    const totalProfit = txArr.reduce((s: number, t: any) => {
      const items = Array.isArray(t.items) ? t.items : [];
      return s + items.reduce((si: number, i: any) => si + ((i.unit_price - i.cost) * i.quantity), 0);
    }, 0);
    const profitMargin = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;
    const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;
    setSummary({ totalSales, totalOrders, totalProfit, profitMargin, avgOrderValue });

    // Top products
    const productMap: Record<string, TopProduct> = {};
    txArr.forEach((t: any) => {
      (Array.isArray(t.items) ? t.items : []).forEach((i: any) => {
        if (!productMap[i.product_name]) {
          productMap[i.product_name] = { name: i.product_name, qty: 0, revenue: 0 };
        }
        productMap[i.product_name].qty += i.quantity;
        productMap[i.product_name].revenue += i.subtotal;
      });
    });
    setTopProducts(Object.values(productMap).sort((a, b) => b.qty - a.qty).slice(0, 10));

    // Chart data
    if (p === 'week') {
      const days: ChartPoint[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now); d.setDate(now.getDate() - i);
        const ds = d.toISOString().split('T')[0];
        const dayTx = txArr.filter((t: any) => t.created_at.startsWith(ds));
        const sales = dayTx.reduce((s: number, t: any) => s + t.total, 0);
        const profit = dayTx.reduce((s: number, t: any) => {
          const items = Array.isArray(t.items) ? t.items : [];
          return s + items.reduce((si: number, it: any) => si + ((it.unit_price - it.cost) * it.quantity), 0);
        }, 0);
        days.push({ label: formatDate(d, 'short'), ยอดขาย: Math.round(sales), กำไร: Math.round(profit) });
      }
      setChartData(days);
    } else if (p === 'month') {
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const days: ChartPoint[] = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const ds = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayTx = txArr.filter((t: any) => t.created_at.startsWith(ds));
        const sales = dayTx.reduce((s: number, t: any) => s + t.total, 0);
        const profit = dayTx.reduce((s: number, t: any) => {
          const items = Array.isArray(t.items) ? t.items : [];
          return s + items.reduce((si: number, it: any) => si + ((it.unit_price - it.cost) * it.quantity), 0);
        }, 0);
        days.push({ label: `${d}`, ยอดขาย: Math.round(sales), กำไร: Math.round(profit) });
      }
      setChartData(days);
    } else {
      const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
      const pts: ChartPoint[] = months.map((label, mi) => {
        const monthTx = txArr.filter((t: any) => new Date(t.created_at).getMonth() === mi);
        const sales = monthTx.reduce((s: number, t: any) => s + t.total, 0);
        const profit = monthTx.reduce((s: number, t: any) => {
          const items = Array.isArray(t.items) ? t.items : [];
          return s + items.reduce((si: number, it: any) => si + ((it.unit_price - it.cost) * it.quantity), 0);
        }, 0);
        return { label, ยอดขาย: Math.round(sales), กำไร: Math.round(profit) };
      });
      setChartData(pts);
    }
    setLoading(false);
  };

  const periodLabel = { week: '7 วันล่าสุด', month: 'เดือนนี้', year: 'ปีนี้' };

  const statCards = [
    { title: 'ยอดขายรวม', value: summary ? formatCurrency(summary.totalSales) : '-', icon: DollarSign, color: 'text-primary', bg: 'bg-primary/10' },
    { title: 'จำนวนออเดอร์', value: summary ? `${summary.totalOrders} รายการ` : '-', icon: ShoppingBag, color: 'text-info', bg: 'bg-info/10' },
    { title: 'กำไรรวม', value: summary ? formatCurrency(summary.totalProfit) : '-', icon: TrendingUp, color: 'text-success', bg: 'bg-success/10' },
    { title: 'อัตรากำไร', value: summary ? `${summary.profitMargin.toFixed(1)}%` : '-', icon: TrendingDown, color: 'text-warning', bg: 'bg-warning/10' },
    { title: 'มูลค่าเฉลี่ย/ออเดอร์', value: summary ? formatCurrency(summary.avgOrderValue) : '-', icon: CalendarDays, color: 'text-chart-4', bg: 'bg-chart-4/10' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground text-balance">รายงาน</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{periodLabel[period]}</p>
        </div>
        <div className="md:ml-auto">
          <Tabs value={period} onValueChange={v => setPeriod(v as Period)}>
            <TabsList>
              <TabsTrigger value="week">7 วัน</TabsTrigger>
              <TabsTrigger value="month">เดือนนี้</TabsTrigger>
              <TabsTrigger value="year">ปีนี้</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

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
            <CardTitle className="text-base font-semibold">ยอดขาย & กำไร</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="w-full h-56 bg-muted" />
            ) : (
              <div className="w-full min-w-0 overflow-hidden">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tickFormatter={v => `฿${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
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

        {/* Top products pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">สินค้าขายดี (ยอดขาย)</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="w-full h-56 bg-muted" />
            ) : topProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-56 text-muted-foreground">
                <Package className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">ไม่มีข้อมูล</p>
              </div>
            ) : (
              <div className="w-full min-w-0 overflow-hidden">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={topProducts.slice(0, 5)}
                      dataKey="qty"
                      nameKey="name"
                      cx="50%" cy="50%"
                      outerRadius={70}
                      label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {topProducts.slice(0, 5).map((_, index) => (
                        <Cell key={index} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number, name: string) => [value + ' ชิ้น', name]} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
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
          <CardTitle className="text-base font-semibold">สินค้าขายดี 10 อันดับ</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto w-full max-w-full">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">#</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">สินค้า</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">ขายได้ (ชิ้น)</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground whitespace-nowrap">ยอดขาย</th>
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
                    <td colSpan={4} className="text-center py-8 text-muted-foreground text-sm">ยังไม่มีข้อมูลการขาย</td>
                  </tr>
                ) : topProducts.map((p, i) => (
                  <tr key={p.name} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-xs font-bold text-primary-foreground ${i < 3 ? 'bg-primary' : 'bg-muted text-muted-foreground'}`}>
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
