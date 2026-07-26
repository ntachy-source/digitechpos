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
import { Plus, QrCode, Trash2, Search, Pencil } from "lucide-react";
import { toast } from "sonner";
import { generateQrPayload } from "@/lib/qr";
import { QrPrintDialog } from "@/components/QrPrintDialog";
import { getActiveLicenseId } from "@/lib/license";

const CATEGORIES = [
  "Mobile Phone",
  "Smart Watch",
  "Liquor",
  "Tablet",
  "Laptop",
  "Headphones / Earbuds",
  "Phone Cover",
  "Screen Protector",
  "Charger / Cable",
  "Power Bank",
  "Speaker",
  "Camera",
  "Accessory",
  "Other",
];

const productSchema = z.object({
  brand: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(40),
  imei_serial: z.string().trim().min(1).max(64),
  cost_price: z.number().nonnegative(),
  sale_price: z.number().nonnegative(),
  notes: z.string().max(500).optional(),
});

const emptyForm = { brand: "", model: "", category: "Mobile Phone", imei_serial: "", cost_price: "", sale_price: "", notes: "" };

const Inventory = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [printProduct, setPrintProduct] = useState<any | null>(null);
  const [customCategory, setCustomCategory] = useState(false);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => { document.title = "Inventory · SGH POS"; load(); }, []);

  const load = async () => {
    const { data, error } = await supabase
      .from("products").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setProducts(data ?? []);
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setCustomCategory(false);
    setOpen(true);
  };

  const openEdit = (p: any) => {
    setEditingId(p.id);
    setForm({
      brand: p.brand ?? "", model: p.model ?? "", category: p.category ?? "Mobile Phone",
      imei_serial: p.imei_serial ?? "", cost_price: String(p.cost_price ?? ""),
      sale_price: String(p.sale_price ?? ""), notes: p.notes ?? "",
    });
    setCustomCategory(!CATEGORIES.includes(p.category));
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = productSchema.safeParse({
      ...form,
      cost_price: Number(form.cost_price),
      sale_price: Number(form.sale_price),
    });
    if (!parsed.success) { toast.error(parsed.error.errors[0].message); return; }

    if (editingId) {
      const { data, error } = await supabase.from("products").update({
        brand: parsed.data.brand,
        model: parsed.data.model,
        category: parsed.data.category,
        imei_serial: parsed.data.imei_serial,
        cost_price: parsed.data.cost_price,
        sale_price: parsed.data.sale_price,
        notes: parsed.data.notes,
        qr_code: generateQrPayload(parsed.data.imei_serial),
      }).eq("id", editingId).select().single();
      if (error) { toast.error(error.message); return; }
      toast.success("Product updated");
      setOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      load();
      return;
    }

    const licenseId = await getActiveLicenseId();
    if (!licenseId) { toast.error("No active license found"); return; }
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
      license_id: licenseId,
    } as any]).select().single();

    if (error) { toast.error(error.message); return; }
    toast.success("Product added");
    setOpen(false);
    setForm(emptyForm);
    setPrintProduct(data);
    load();
  };

  const remove = async (p: any) => {
    if (p.status === "sold") {
      toast.error("Cannot delete sold products (sales history references them).");
      return;
    }
    if (!confirm(`Delete ${p.brand} ${p.model}?`)) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  const filtered = products.filter(p =>
    [p.brand, p.model, p.imei_serial].some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start sm:items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Inventory</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">Manage products and generate QR labels.</p>
        </div>
        <Button onClick={openAdd} className="w-full sm:w-auto"><Plus className="h-4 w-4 mr-2" /> Add Product</Button>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditingId(null); setForm(emptyForm); } }}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingId ? "Edit Product" : "Stock-in New Product"}</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Brand</Label>
                  <Input value={form.brand} onChange={e => setForm({...form, brand: e.target.value})} required /></div>
                <div className="space-y-2"><Label>Model</Label>
                  <Input value={form.model} onChange={e => setForm({...form, model: e.target.value})} required /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Category</Label>
                  {customCategory ? (
                    <Input
                      placeholder="Enter category"
                      value={form.category}
                      onChange={e => setForm({ ...form, category: e.target.value })}
                      onBlur={() => { if (!form.category.trim()) { setCustomCategory(false); setForm({ ...form, category: "Mobile Phone" }); } }}
                      autoFocus
                      required
                    />
                  ) : (
                    <Select
                      value={form.category}
                      onValueChange={(v) => {
                        if (v === "__custom__") { setCustomCategory(true); setForm({ ...form, category: "" }); }
                        else setForm({ ...form, category: v });
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        <SelectItem value="__custom__">+ Custom…</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-2"><Label>IMEI / Serial / SKU</Label>
                  <Input value={form.imei_serial} onChange={e => setForm({...form, imei_serial: e.target.value})} required /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Cost Price</Label>
                  <Input type="number" step="0.01" value={form.cost_price} onChange={e => setForm({...form, cost_price: e.target.value})} required /></div>
                <div className="space-y-2"><Label>Sale Price</Label>
                  <Input type="number" step="0.01" value={form.sale_price} onChange={e => setForm({...form, sale_price: e.target.value})} required /></div>
              </div>
              <div className="space-y-2"><Label>Notes</Label>
                <Textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} maxLength={500} /></div>
              <Button type="submit" className="w-full">{editingId ? "Save Changes" : "Add & Generate QR"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-border/60 shadow-card">
        <CardHeader>
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search brand, model, IMEI..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
          {/* Mobile card list */}
          <div className="md:hidden space-y-3">
            {filtered.length === 0 && (
              <p className="text-center text-muted-foreground py-8 text-sm">No products yet.</p>
            )}
            {filtered.map(p => (
              <div key={p.id} className="rounded-lg border p-3 bg-card space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{p.brand} {p.model}</p>
                    <p className="text-xs text-muted-foreground">{p.category}</p>
                    <p className="text-xs font-mono text-muted-foreground truncate mt-1">{p.imei_serial}</p>
                  </div>
                  <Badge variant={p.status === "in_stock" ? "default" : "secondary"}
                    className={p.status === "in_stock" ? "bg-success text-success-foreground shrink-0" : "shrink-0"}>
                    {p.status === "in_stock" ? "In Stock" : "Sold"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="font-semibold">${Number(p.sale_price).toFixed(2)}</span>
                  <div className="flex">
                    <Button variant="ghost" size="icon" title="Print QR" onClick={() => setPrintProduct(p)}><QrCode className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" title="Edit" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" title="Delete" onClick={() => remove(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
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
                      <Button variant="ghost" size="icon" title="Print QR" onClick={() => setPrintProduct(p)}><QrCode className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Edit" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Delete" onClick={() => remove(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <QrPrintDialog open={!!printProduct} onOpenChange={o => !o && setPrintProduct(null)} product={printProduct} />
    </div>
  );
};

export default Inventory;
