import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { format, subDays, startOfDay } from "date-fns";

const Reports = () => {
  const [chartData, setChartData] = useState<{ day: string; revenue: number; sales: number }[]>([]);
  const [recent, setRecent] = useState<any[]>([]);
  const [totals, setTotals] = useState({ revenue: 0, count: 0 });

  useEffect(() => { document.title = "Reports · MPOFU Technologies"; load(); }, []);

  const load = async () => {
    const since = startOfDay(subDays(new Date(), 6)).toISOString();
    const { data } = await supabase
      .from("sales")
      .select("id, total, created_at, customer_name, sale_items(product_id, price, products(brand, model, imei_serial))")
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    const sales = data ?? [];
    setRecent(sales.slice(0, 10));
    setTotals({
      revenue: sales.reduce((s, r: any) => s + Number(r.total), 0),
      count: sales.length,
    });

    const buckets: Record<string, { revenue: number; sales: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const k = format(subDays(new Date(), i), "MMM d");
      buckets[k] = { revenue: 0, sales: 0 };
    }
    sales.forEach((s: any) => {
      const k = format(new Date(s.created_at), "MMM d");
      if (buckets[k]) {
        buckets[k].revenue += Number(s.total);
        buckets[k].sales += 1;
      }
    });
    setChartData(Object.entries(buckets).map(([day, v]) => ({ day, ...v })));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Reports</h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">Last 7 days of sales activity.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="border-border/60 shadow-card">
          <CardHeader><CardTitle className="text-sm text-muted-foreground">7-day Revenue</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">${totals.revenue.toFixed(2)}</p></CardContent>
        </Card>
        <Card className="border-border/60 shadow-card">
          <CardHeader><CardTitle className="text-sm text-muted-foreground">7-day Sales</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{totals.count}</p></CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-card">
        <CardHeader><CardTitle>Revenue Trend</CardTitle></CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  formatter={(v: number) => `$${v.toFixed(2)}`}
                />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-card">
        <CardHeader><CardTitle>Recent Sales</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-2 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No sales yet.</TableCell></TableRow>
                )}
                {recent.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-sm whitespace-nowrap">{format(new Date(s.created_at), "MMM d, HH:mm")}</TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">
                      {s.sale_items?.map((si: any) => `${si.products?.brand} ${si.products?.model}`).join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-sm">{s.customer_name || "—"}</TableCell>
                    <TableCell className="text-right font-medium whitespace-nowrap">${Number(s.total).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Reports;
