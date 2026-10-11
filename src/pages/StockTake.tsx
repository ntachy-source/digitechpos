import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ClipboardCheck, Download, RotateCcw, Search, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useBusinessName } from "@/hooks/useBusinessName";
import { downloadTablePdf, money } from "@/lib/pdfExport";

interface P { id: string; brand: string; model: string; category: string; imei_serial: string; quantity: number; cost_price: number; sale_price: number; }
const KEY = "stocktake-counts";

const StockTake = () => {
  const { role } = useAuth();
  const { name: bizName } = useBusinessName();
  const [products, setProducts] = useState<P[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
  });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "uncounted" | "variance">("all");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.from("products")
      .select("id, brand, model, category, imei_serial, quantity, cost_price, sale_price")
      .eq("status", "in_stock").order("brand");
    if (error) return toast.error(error.message);
    setProducts((data ?? []) as P[]);
  };
  useEffect(() => { load(); }, []);

  const setCount = (id: string, v: string) => {
    setCounts(prev => {
      const next = { ...prev, [id]: v };
      if (v === "") delete next[id];
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  };

  const rows = useMemo(() => products.map(p => {
    const c = counts[p.id];
    const counted = c === undefined || c === "" ? null : Math.max(0, Math.floor(Number(c)));
    const variance = counted === null ? null : counted - p.quantity;
    return { ...p, counted, variance, varValue: variance === null ? 0 : variance * Number(p.cost_price) };
  }), [products, counts]);

  const shown = rows.filter(r => {
    const q = search.toLowerCase().trim();
    if (q && ![r.brand, r.model, r.category, r.imei_serial].some(v => v?.toLowerCase().includes(q))) return false;
    if (filter === "uncounted") return r.counted === null;
    if (filter === "variance") return r.variance !== null && r.variance !== 0;
    return true;
  });

  const countedN = rows.filter(r => r.counted !== null).length;
  const varianceItems = rows.filter(r => r.variance);
  const netValue = rows.reduce((s, r) => s + r.varValue, 0);

  const exportPdf = () => {
    downloadTablePdf({
      title: "Stock Take Report", businessName: bizName, filename: `stock-take-${new Date().toISOString().slice(0, 10)}`, landscape: true,
      summary: [
        ["Products", String(rows.length)], ["Counted", `${countedN} of ${rows.length}`],
        ["Items with variance", String(varianceItems.length)], ["Net variance (cost)", money(netValue)],
      ],
      head: ["Product", "Category", "IMEI / Serial", "System qty", "Counted", "Variance", "Variance value"],
      rows: rows.map(r => [`${r.brand} ${r.model}`, r.category, r.imei_serial, r.quantity, r.counted ?? "—",
        r.variance === null ? "—" : (r.variance > 0 ? `+${r.variance}` : r.variance), r.variance === null ? "—" : money(r.varValue)]),
    });
  };

  const apply = async () => {
    setBusy(true);
    let failed = 0;
    for (const r of varianceItems) {
      const q = r.counted!;
      const { error } = await supabase.from("products").update(q <= 0 ? { quantity: 0, status: "sold" } : { quantity: q }).eq("id", r.id);
      if (error) failed++;
    }
    setBusy(false); setConfirm(false);
    if (failed) toast.error(`${failed} products could not be updated`);
    else toast.success("Stock quantities updated");
    localStorage.removeItem(KEY); setCounts({}); load();
  };

  const reset = () => { localStorage.removeItem(KEY); setCounts({}); toast.info("Counts cleared"); };

  const varBadge = (v: number | null) => v === null ? <span className="text-muted-foreground">—</span>
    : v === 0 ? <Badge variant="secondary">OK</Badge>
    : <Badge variant={v < 0 ? "destructive" : "default"}>{v > 0 ? `+${v}` : v}</Badge>;

  const countInput = (r: typeof rows[number]) => (
    <Input type="number" inputMode="numeric" min={0} value={counts[r.id] ?? ""} placeholder={String(r.quantity)}
      onChange={e => setCount(r.id, e.target.value)} className="h-9 w-20 text-center" />
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><ClipboardCheck className="h-7 w-7 text-primary" /> Stock Take</h1>
          <p className="text-muted-foreground mt-1 text-sm">Count what's on the shelf, compare with the system, then update stock.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={reset} disabled={!countedN}><RotateCcw className="h-4 w-4 mr-1" /> Clear</Button>
          <Button variant="outline" size="sm" onClick={exportPdf}><Download className="h-4 w-4 mr-1" /> PDF</Button>
          {role === "admin" && (
            <Button size="sm" onClick={() => setConfirm(true)} disabled={!varianceItems.length}><CheckCircle2 className="h-4 w-4 mr-1" /> Apply counts</Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[["Products", rows.length], ["Counted", `${countedN}/${rows.length}`], ["With variance", varianceItems.length], ["Net variance", money(netValue)]].map(([l, v]) => (
          <Card key={l as string} className="shadow-card"><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{l}</p><p className="text-xl font-bold mt-1">{v}</p>
          </CardContent></Card>
        ))}
      </div>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
            <CardTitle className="text-base">Count sheet</CardTitle>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex rounded-md border p-0.5 text-xs">
                {(["all", "uncounted", "variance"] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)} className={`flex-1 px-3 py-1.5 rounded capitalize ${filter === f ? "bg-primary text-primary-foreground" : ""}`}>{f}</button>
                ))}
              </div>
              <div className="relative sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="pl-9 h-9" />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="md:hidden space-y-2">
            {shown.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">Nothing to show.</p>}
            {shown.map(r => (
              <div key={r.id} className="flex items-center gap-3 p-3 border rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{r.brand} {r.model}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.category} · System: {r.quantity}</p>
                  <div className="mt-1">{varBadge(r.variance)}</div>
                </div>
                {countInput(r)}
              </div>
            ))}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Product</TableHead><TableHead>Category</TableHead><TableHead>IMEI / Serial</TableHead>
                <TableHead className="text-center">System</TableHead><TableHead className="text-center">Counted</TableHead>
                <TableHead className="text-center">Variance</TableHead><TableHead className="text-right">Value</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {shown.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Nothing to show.</TableCell></TableRow>}
                {shown.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.brand} {r.model}</TableCell>
                    <TableCell>{r.category}</TableCell>
                    <TableCell className="font-mono text-xs">{r.imei_serial}</TableCell>
                    <TableCell className="text-center">{r.quantity}</TableCell>
                    <TableCell className="flex justify-center">{countInput(r)}</TableCell>
                    <TableCell className="text-center">{varBadge(r.variance)}</TableCell>
                    <TableCell className="text-right">{r.variance === null ? "—" : money(r.varValue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update stock to counted quantities?</AlertDialogTitle>
            <AlertDialogDescription>{varianceItems.length} products will be changed to match your count. Download the PDF first if you want a record.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={apply} disabled={busy}>{busy ? "Updating..." : "Apply"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default StockTake;
