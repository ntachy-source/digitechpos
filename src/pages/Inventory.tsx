import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, QrCode, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { generateQrPayload } from "@/lib/qr";
import { QrPrintDialog } from "@/components/QrPrintDialog";

const productSchema = z.object({
  brand: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(40),
  imei_serial: z.string().trim().min(4).max(32),
  cost_price: z.number().nonnegative(),
  sale_price: z.number().nonnegative(),
  notes: z.string().max(500).optional(),
});

const Inventory = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [printProduct, setPrintProduct] = useState<any | null>(null);
  const [form, setForm] = useState({
    brand: "", model: "", category: "Mobile Phone",
    imei_serial: "", cost_price: "", sale_price: "", notes: "",
  });

  useEffect(() => { document.title = "Inventory · ScanPOS"; load(); }, []);

  const load = async () => {
    const { data, error } = await supabase
      .from("products").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setProducts(data ?? []);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = productSchema.safeParse({
      ...form,
      cost_price: Number(form.cost_price),
      sale_price: Number(form.sale_price),
    });
    if (!parsed.success) { toast.error(parsed.error.errors[0].message); return; }

    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("products").insert([{
      brand: parsed.data.brand,
      model: parsed.data.model,
      category: parsed.data.category,
      imei_serial: parsed.data.imei_serial,
      cost_price: parsed.data.cost_price,
      sale_price: parsed.data.sale_price,
      notes: parsed.data.notes,
      qr_code: generateQrPayload(parsed.data.imei_serial),
      created_by: user?.id,
    }]).select().single();

    if (error) { toast.error(error.message); return; }
    toast.success("Product added");
    setOpen(false);
    setForm({ brand: "", model: "", category: "Mobile Phone", imei_serial: "", cost_price: "", sale_price: "", notes: "" });
    setPrintProduct(data);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  const filtered = products.filter(p =>
    [p.brand, p.model, p.imei_serial].some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">Inventory</h1>
          <p className="text-muted-foreground mt-1">Manage products and generate QR labels.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Add Product</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Stock-in New Product</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Brand</Label>
                  <Input value={form.brand} onChange={e => setForm({...form, brand: e.target.value})} required /></div>
                <div className="space-y-2"><Label>Model</Label>
                  <Input value={form.model} onChange={e => setForm({...form, model: e.target.value})} required /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Category</Label>
                  <Input value={form.category} onChange={e => setForm({...form, category: e.target.value})} required /></div>
                <div className="space-y-2"><Label>IMEI / Serial</Label>
                  <Input value={form.imei_serial} onChange={e => setForm({...form, imei_serial: e.target.value})} required /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Cost Price</Label>
                  <Input type="number" step="0.01" value={form.cost_price} onChange={e => setForm({...form, cost_price: e.target.value})} required /></div>
                <div className="space-y-2"><Label>Sale Price</Label>
                  <Input type="number" step="0.01" value={form.sale_price} onChange={e => setForm({...form, sale_price: e.target.value})} required /></div>
              </div>
              <div className="space-y-2"><Label>Notes</Label>
                <Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} maxLength={500} /></div>
              <Button type="submit" className="w-full">Add & Generate QR</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-border/60 shadow-card">
        <CardHeader>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search brand, model, IMEI..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>IMEI / Serial</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No products yet.</TableCell></TableRow>
              )}
              {filtered.map(p => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium">{p.brand} {p.model}</div>
                    <div className="text-xs text-muted-foreground">{p.category}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.imei_serial}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === "in_stock" ? "default" : "secondary"}
                      className={p.status === "in_stock" ? "bg-success text-success-foreground" : ""}>
                      {p.status === "in_stock" ? "In Stock" : "Sold"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">${Number(p.sale_price).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setPrintProduct(p)}><QrCode className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <QrPrintDialog open={!!printProduct} onOpenChange={o => !o && setPrintProduct(null)} product={printProduct} />
    </div>
  );
};

export default Inventory;
