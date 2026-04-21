import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, ShoppingCart, DollarSign, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface Stats {
  inStock: number;
  soldToday: number;
  revenueToday: number;
  totalSold: number;
}

const Dashboard = () => {
  const { role } = useAuth();
  const [stats, setStats] = useState<Stats>({ inStock: 0, soldToday: 0, revenueToday: 0, totalSold: 0 });

  useEffect(() => {
    document.title = "Dashboard · ScanPOS";
    load();
  }, []);

  const load = async () => {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const [{ count: inStock }, { count: totalSold }, { data: todaysSales }] = await Promise.all([
      supabase.from("products").select("*", { count: "exact", head: true }).eq("status", "in_stock"),
      supabase.from("products").select("*", { count: "exact", head: true }).eq("status", "sold"),
      supabase.from("sales").select("total").gte("created_at", todayStart.toISOString()),
    ]);
    const revenueToday = (todaysSales ?? []).reduce((s, r: any) => s + Number(r.total), 0);
    setStats({
      inStock: inStock ?? 0,
      totalSold: totalSold ?? 0,
      soldToday: todaysSales?.length ?? 0,
      revenueToday,
    });
  };

  const cards = [
    { label: "In Stock", value: stats.inStock, icon: Package, color: "text-primary", bg: "bg-primary/10" },
    { label: "Sales Today", value: stats.soldToday, icon: ShoppingCart, color: "text-accent", bg: "bg-accent/10" },
    { label: "Revenue Today", value: `$${stats.revenueToday.toFixed(2)}`, icon: DollarSign, color: "text-success", bg: "bg-success/10" },
    { label: "Total Sold", value: stats.totalSold, icon: CheckCircle2, color: "text-warning", bg: "bg-warning/10" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Welcome back. Here's a snapshot of your store.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(c => (
          <Card key={c.label} className="border-border/60 shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${c.bg}`}>
                <c.icon className={`h-4 w-4 ${c.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/60 shadow-card">
        <CardHeader>
          <CardTitle>Quick Start</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• Go to <strong className="text-foreground">Point of Sale</strong> to scan a product QR and process a sale.</p>
          {role === "admin" && <p>• Go to <strong className="text-foreground">Inventory</strong> to add new gadgets and print QR labels.</p>}
          {role === "admin" && <p>• Visit <strong className="text-foreground">Reports</strong> for sales trends and stock insights.</p>}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
