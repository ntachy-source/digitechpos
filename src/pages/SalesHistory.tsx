import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { History } from "lucide-react";
import { format } from "date-fns";

interface SaleRow {
  id: string;
  created_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  total: number;
  items_count?: number;
}

const SalesHistory = () => {
  const [sales, setSales] = useState<SaleRow[]>([]);

  useEffect(() => {
    document.title = "Sales History · MPOFU Technologies";
    (async () => {
      const { data } = await supabase
        .from("sales")
        .select("id, created_at, customer_name, customer_phone, total, sale_items(count)")
        .order("created_at", { ascending: false });
      setSales((data ?? []).map((s: any) => ({
        id: s.id,
        created_at: s.created_at,
        customer_name: s.customer_name,
        customer_phone: s.customer_phone,
        total: s.total,
        items_count: s.sale_items?.[0]?.count ?? 0,
      })));
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold flex items-center gap-2">
          <History className="h-6 w-6 sm:h-7 sm:w-7 text-primary shrink-0" /> Sales History
        </h1>
        <p className="text-muted-foreground mt-1 text-xs sm:text-sm">All completed sales transactions.</p>
      </div>

      <Card>
        <CardHeader className="px-4 sm:px-6">
          <CardTitle className="text-base sm:text-lg">All sales ({sales.length})</CardTitle>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          {/* Mobile cards */}
          <div className="sm:hidden divide-y">
            {sales.map(s => (
              <div key={s.id} className="px-4 py-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{s.customer_name || "Walk-in customer"}</div>
                    {s.customer_phone && <div className="text-xs text-muted-foreground">{s.customer_phone}</div>}
                    <div className="text-xs text-muted-foreground">{format(new Date(s.created_at), "PPp")}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold">${Number(s.total).toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground">{s.items_count} item{s.items_count === 1 ? "" : "s"}</div>
                  </div>
                </div>
              </div>
            ))}
            {sales.length === 0 && <div className="text-center text-muted-foreground py-8 text-sm">No sales yet</div>}
          </div>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs">{format(new Date(s.created_at), "PPp")}</TableCell>
                    <TableCell>{s.customer_name || <span className="text-muted-foreground">Walk-in</span>}</TableCell>
                    <TableCell className="text-xs">{s.customer_phone || "—"}</TableCell>
                    <TableCell className="text-right">{s.items_count}</TableCell>
                    <TableCell className="text-right font-semibold">${Number(s.total).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                {sales.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No sales yet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SalesHistory;
