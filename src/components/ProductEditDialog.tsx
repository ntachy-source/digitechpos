import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ProductEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: any;
  onSaved: () => void;
}

export const ProductEditDialog = ({ open, onOpenChange, product, onSaved }: ProductEditDialogProps) => {
  const [form, setForm] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const p = form ?? product;
  if (!p) return null;

  const handleOpen = (o: boolean) => {
    if (o && product) setForm({ ...product });
    if (!o) setForm(null);
    onOpenChange(o);
  };

  const set = (key: string, value: string) => setForm((prev: any) => ({ ...(prev ?? product), [key]: value }));

  const save = async () => {
    if (!form) return;
    setBusy(true);
    const { error } = await supabase.from("products").update({
      brand: form.brand,
      model: form.model,
      category: form.category,
      imei_serial: form.imei_serial,
      cost_price: Number(form.cost_price) || 0,
      sale_price: Number(form.sale_price) || 0,
      quantity: Number(form.quantity) || 1,
      notes: form.notes || null,
    }).eq("id", form.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Product updated");
    onSaved();
    handleOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Product</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Brand</Label>
              <Input value={p.brand ?? ""} onChange={e => set("brand", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Model</Label>
              <Input value={p.model ?? ""} onChange={e => set("model", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Category</Label>
            <Input value={p.category ?? ""} onChange={e => set("category", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>IMEI / Serial</Label>
            <Input value={p.imei_serial ?? ""} onChange={e => set("imei_serial", e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Cost Price</Label>
              <Input type="number" value={p.cost_price ?? 0} onChange={e => set("cost_price", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Sale Price</Label>
              <Input type="number" value={p.sale_price ?? 0} onChange={e => set("sale_price", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Quantity</Label>
              <Input type="number" min={1} value={p.quantity ?? 1} onChange={e => set("quantity", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea rows={2} value={p.notes ?? ""} onChange={e => set("notes", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
