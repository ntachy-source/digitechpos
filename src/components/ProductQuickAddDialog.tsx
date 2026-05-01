import { useState } from "react";
import { z } from "zod";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { QrPrintDialog } from "@/components/QrPrintDialog";
import { generateQrPayload } from "@/lib/qr";
import { getActiveLicenseId } from "@/lib/license";
import { toast } from "sonner";

const CATEGORIES = [
  "Mobile Phone",
  "Smart Watch",
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
  brand: z.string().trim().min(1, "Brand is required").max(60),
  model: z.string().trim().min(1, "Model is required").max(80),
  category: z.string().trim().min(1, "Category is required").max(40),
  imei_serial: z.string().trim().min(1, "IMEI / serial is required").max(64),
  cost_price: z.number().nonnegative("Cost price cannot be negative"),
  sale_price: z.number().nonnegative("Sale price cannot be negative"),
  notes: z.string().max(500).optional(),
});

const emptyForm = { brand: "", model: "", category: "Mobile Phone", imei_serial: "", cost_price: "", sale_price: "", notes: "", quantity: "1" };

interface ProductQuickAddDialogProps {
  onAdded?: () => void;
  triggerClassName?: string;
}

export const ProductQuickAddDialog = ({ onAdded, triggerClassName }: ProductQuickAddDialogProps) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [customCategory, setCustomCategory] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [printProduct, setPrintProduct] = useState<any | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Math.max(1, Math.min(100, parseInt(form.quantity) || 1));
    const parsed = productSchema.safeParse({
      ...form,
      cost_price: Number(form.cost_price),
      sale_price: Number(form.sale_price),
    });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }

    setBusy(true);
    try {
      const licenseId = await getActiveLicenseId();
      if (!licenseId) throw new Error("No active license found");
      const { data: { user } } = await supabase.auth.getUser();

      const rows = Array.from({ length: qty }, (_, i) => {
        const serial = qty === 1 ? parsed.data.imei_serial : `${parsed.data.imei_serial}-${String(i + 1).padStart(3, "0")}`;
        return {
          brand: parsed.data.brand,
          model: parsed.data.model,
          category: parsed.data.category,
          imei_serial: serial,
          cost_price: parsed.data.cost_price,
          sale_price: parsed.data.sale_price,
          notes: parsed.data.notes,
          qr_code: generateQrPayload(serial),
          created_by: user?.id,
          license_id: licenseId,
        } as any;
      });

      const { data, error } = await supabase.from("products").insert(rows).select();
      if (error) throw error;
      toast.success(`${qty} product${qty > 1 ? "s" : ""} added`);
      setOpen(false);
      setForm(emptyForm);
      setCustomCategory(false);
      if (data && data.length === 1) setPrintProduct(data[0]);
      onAdded?.();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not add product");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setForm(emptyForm); setCustomCategory(false); } }}>
        <DialogTrigger asChild>
          <Button className={triggerClassName}><Plus className="h-4 w-4 mr-2" /> Add Product</Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Product</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Brand</Label>
                <Input value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} required /></div>
              <div className="space-y-2"><Label>Model</Label>
                <Input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} required /></div>
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
                <Input value={form.imei_serial} onChange={e => setForm({ ...form, imei_serial: e.target.value })} required /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Cost Price</Label>
                <Input type="number" step="0.01" value={form.cost_price} onChange={e => setForm({ ...form, cost_price: e.target.value })} required /></div>
              <div className="space-y-2"><Label>Sale Price</Label>
                <Input type="number" step="0.01" value={form.sale_price} onChange={e => setForm({ ...form, sale_price: e.target.value })} required /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Quantity</Label>
                <Input type="number" min="1" max="100" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} required />
                {parseInt(form.quantity) > 1 && (
                  <p className="text-xs text-muted-foreground">Serial numbers will be auto-suffixed (-001, -002, …)</p>
                )}
              </div>
              <div className="space-y-2"><Label>Notes</Label>
                <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} maxLength={500} /></div>
            </div>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Adding..." : `Add ${parseInt(form.quantity) > 1 ? parseInt(form.quantity) + " Products" : "& Generate QR"}`}</Button>
          </form>
        </DialogContent>
      </Dialog>
      <QrPrintDialog open={!!printProduct} onOpenChange={o => !o && setPrintProduct(null)} product={printProduct} />
    </>
  );
};
