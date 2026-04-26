import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, Plus, Printer, Download, Eye, Upload, Image as ImageIcon } from "lucide-react";
import { format } from "date-fns";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { getActiveLicenseId } from "@/lib/license";

interface InvoiceItem { brand: string; model: string; imei_serial: string; sale_price: number; }
interface BizSnapshot {
  business_name: string; address?: string | null; phone?: string | null;
  email?: string | null; tax_id?: string | null; logo_url?: string | null; invoice_footer?: string | null;
}
interface Invoice {
  id: string;
  invoice_number: string;
  sale_id: string | null;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  client_address: string | null;
  notes: string | null;
  subtotal: number;
  total: number;
  items: InvoiceItem[];
  business_snapshot: BizSnapshot | null;
  created_at: string;
}
interface SaleOption {
  id: string;
  created_at: string;
  total: number;
  customer_name: string | null;
  customer_phone: string | null;
}

const Invoices = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [sales, setSales] = useState<SaleOption[]>([]);
  const [open, setOpen] = useState(false);
  const [previewing, setPreviewing] = useState<Invoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [businessSettings, setBusinessSettings] = useState<(BizSnapshot & { id: string }) | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // form state
  const [selectedSale, setSelectedSale] = useState<string>("");
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [client, setClient] = useState({ name: "", phone: "", email: "", address: "" });
  const [notes, setNotes] = useState("");

  useEffect(() => { document.title = "Invoices · SGH POS"; load(); loadBusinessSettings(); }, []);

  const load = async () => {
    const [{ data: inv }, { data: sl }] = await Promise.all([
      supabase.from("invoices").select("*").order("created_at", { ascending: false }),
      supabase.from("sales").select("id, created_at, total, customer_name, customer_phone").order("created_at", { ascending: false }).limit(100),
    ]);
    setInvoices((inv ?? []) as unknown as Invoice[]);
    setSales((sl ?? []) as SaleOption[]);
  };

  const loadBusinessSettings = async () => {
    try {
      const licenseId = await getActiveLicenseId();
      if (!licenseId) return;
      const { data, error } = await supabase.from("business_settings").select("*").eq("license_id", licenseId).maybeSingle();
      if (error) throw error;
      if (data) { setBusinessSettings(data as any); return; }
      const { data: created, error: createError } = await supabase.from("business_settings").insert({
        business_name: "SGH Gadget Store",
        license_id: licenseId,
      } as any).select("*").single();
      if (createError) throw createError;
      setBusinessSettings(created as any);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not load invoice settings");
    }
  };

  const onPickSale = async (saleId: string) => {
    setSelectedSale(saleId);
    const sale = sales.find(s => s.id === saleId);
    if (sale) {
      setClient({
        name: sale.customer_name ?? "", phone: sale.customer_phone ?? "", email: "", address: "",
      });
    }
    const { data, error } = await supabase
      .from("sale_items")
      .select("price, products(brand, model, imei_serial)")
      .eq("sale_id", saleId);
    if (error) return toast.error(error.message);
    setItems((data ?? []).map((r: any) => ({
      brand: r.products?.brand ?? "",
      model: r.products?.model ?? "",
      imei_serial: r.products?.imei_serial ?? "",
      sale_price: Number(r.price),
    })));
  };

  const onLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast.error("Logo must be under 2MB");
    setUploadingLogo(true);
    try {
      const licenseId = await getActiveLicenseId();
      if (!licenseId) throw new Error("No active license found");
      const ext = file.name.split(".").pop() || "png";
      const path = `license-${licenseId}/invoice-logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("logos").getPublicUrl(path);
      const payload = { business_name: businessSettings?.business_name || "SGH Gadget Store", logo_url: publicUrl, license_id: licenseId } as any;
      const { data, error: saveError } = businessSettings?.id
        ? await supabase.from("business_settings").update({ logo_url: publicUrl }).eq("id", businessSettings.id).select("*").single()
        : await supabase.from("business_settings").insert(payload).select("*").single();
      if (saveError) throw saveError;
      setBusinessSettings(data as any);
      toast.success("Invoice logo updated");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not upload logo");
    } finally {
      setUploadingLogo(false);
    }
  };

  const create = async () => {
    if (!selectedSale) return toast.error("Pick a sale before creating an invoice");
    if (items.length === 0) return toast.error("Add at least one item");
    setBusy(true);
    const licenseId = await getActiveLicenseId();
    if (!licenseId) { setBusy(false); return toast.error("No active license found"); }
    const biz = businessSettings;
    const subtotal = items.reduce((s, i) => s + Number(i.sale_price), 0);
    const total = subtotal;
    const { data: userRes } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("invoices").insert({
      sale_id: selectedSale || null,
      client_name: client.name || null,
      client_phone: client.phone || null,
      client_email: client.email || null,
      client_address: client.address || null,
      notes: notes || null,
      subtotal, total,
      items: items as any,
      business_snapshot: biz as any,
      created_by: userRes.user?.id,
      license_id: licenseId,
    } as any).select().single();
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Invoice ${(data as any).invoice_number} created`);
    setOpen(false);
    setSelectedSale(""); setItems([]); setClient({ name: "", phone: "", email: "", address: "" }); setNotes("");
    load();
    setPreviewing(data as unknown as Invoice);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <FileText className="h-7 w-7 text-primary" /> Invoices
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Generate professional invoices from completed sales.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" /> New Invoice</Button>
      </div>

      <Card>
        <CardHeader><CardTitle>All invoices ({invoices.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0 sm:p-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map(inv => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                  <TableCell>{inv.client_name || <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-xs">{format(new Date(inv.created_at), "PP")}</TableCell>
                  <TableCell className="text-right font-semibold">${Number(inv.total).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setPreviewing(inv)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {invoices.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No invoices yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Editor */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Invoice</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-4 rounded-lg border p-3">
              <div className="h-16 w-16 rounded-lg border bg-muted flex items-center justify-center overflow-hidden shrink-0">
                {businessSettings?.logo_url ? <img src={businessSettings.logo_url} alt="Invoice logo" className="object-contain h-full w-full" />
                  : <ImageIcon className="h-6 w-6 text-muted-foreground" />}
              </div>
              <div className="min-w-0">
                <Label htmlFor="invoice-logo" className="cursor-pointer inline-flex items-center gap-2 text-sm bg-secondary px-3 py-2 rounded-md">
                  <Upload className="h-4 w-4" /> {uploadingLogo ? "Uploading..." : "Upload invoice logo"}
                </Label>
                <input id="invoice-logo" type="file" accept="image/*" className="hidden" onChange={onLogo} disabled={uploadingLogo} />
                <p className="text-xs text-muted-foreground mt-2">This logo appears on generated invoices.</p>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Pick a sale</Label>
              <Select value={selectedSale} onValueChange={onPickSale}>
                <SelectTrigger><SelectValue placeholder="Choose the sale products for this invoice..." /></SelectTrigger>
                <SelectContent>
                  {sales.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {format(new Date(s.created_at), "PP")} · ${Number(s.total).toFixed(2)} · {s.customer_name || "Walk-in"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Items</Label>
              {items.length === 0 && (
                <p className="text-xs text-muted-foreground border rounded-lg p-3 text-center">
                  No items yet. Pick a completed sale above.
                </p>
              )}
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center border rounded-lg p-2 text-sm">
                  <div className="col-span-12 sm:col-span-5 font-medium">{it.brand} {it.model}</div>
                  <div className="col-span-7 sm:col-span-4 font-mono text-xs text-muted-foreground truncate">{it.imei_serial}</div>
                  <div className="col-span-5 sm:col-span-3 text-right font-semibold">
                    ${Number(it.sale_price).toFixed(2)}
                  </div>
                </div>
              ))}
              {items.length > 0 && (
                <div className="flex justify-between text-sm font-semibold px-2">
                  <span>Total</span>
                  <span>${items.reduce((s, i) => s + Number(i.sale_price), 0).toFixed(2)}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Client name</Label>
                <Input value={client.name} onChange={e => setClient({ ...client, name: e.target.value })} /></div>
              <div className="space-y-1"><Label>Phone</Label>
                <Input value={client.phone} onChange={e => setClient({ ...client, phone: e.target.value })} /></div>
              <div className="space-y-1"><Label>Email</Label>
                <Input type="email" value={client.email} onChange={e => setClient({ ...client, email: e.target.value })} /></div>
              <div className="space-y-1"><Label>Address</Label>
                <Input value={client.address} onChange={e => setClient({ ...client, address: e.target.value })} /></div>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any extra notes for this invoice..." />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={create} disabled={busy}>{busy ? "Creating..." : "Create Invoice"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InvoicePreview invoice={previewing} onClose={() => setPreviewing(null)} />
    </div>
  );
};

const InvoicePreview = ({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) => {
  const ref = useRef<HTMLDivElement>(null);

  if (!invoice) return null;
  const biz = invoice.business_snapshot ?? { business_name: "Business" } as BizSnapshot;

  const print = () => {
    const html = ref.current?.outerHTML;
    if (!html) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>${invoice.invoice_number}</title>
      <script src="https://cdn.tailwindcss.com"><\/script></head><body>${html}</body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); w.close(); }, 400);
  };

  const downloadPdf = async () => {
    if (!ref.current) return;
    const canvas = await html2canvas(ref.current, { scale: 2, backgroundColor: "#ffffff" });
    const img = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = (canvas.height * pw) / canvas.width;
    pdf.addImage(img, "PNG", 0, 0, pw, ph);
    pdf.save(`${invoice.invoice_number}.pdf`);
  };

  return (
    <Dialog open={!!invoice} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 pr-8">
            <span>Invoice {invoice.invoice_number}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={print}><Printer className="h-4 w-4 mr-2" />Print</Button>
              <Button size="sm" onClick={downloadPdf}><Download className="h-4 w-4 mr-2" />PDF</Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div ref={ref} className="bg-white text-slate-900 p-8 rounded border" style={{ minHeight: 600 }}>
          <div className="flex items-start justify-between gap-6 border-b pb-4">
            <div className="flex items-center gap-3">
              {biz.logo_url && <img src={biz.logo_url} alt="" crossOrigin="anonymous" className="h-16 w-16 object-contain" />}
              <div>
                <h2 className="text-xl font-bold">{biz.business_name}</h2>
                {biz.address && <p className="text-xs whitespace-pre-line">{biz.address}</p>}
                <p className="text-xs">
                  {[biz.phone, biz.email].filter(Boolean).join(" · ")}
                  {biz.tax_id && <> · Tax ID: {biz.tax_id}</>}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold tracking-tight">INVOICE</p>
              <p className="text-xs font-mono">{invoice.invoice_number}</p>
              <p className="text-xs">{format(new Date(invoice.created_at), "PPP")}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 mt-4">
            <div>
              <p className="text-xs uppercase text-slate-500 mb-1">Bill to</p>
              <p className="font-semibold">{invoice.client_name || "—"}</p>
              {invoice.client_address && <p className="text-xs whitespace-pre-line">{invoice.client_address}</p>}
              {invoice.client_phone && <p className="text-xs">{invoice.client_phone}</p>}
              {invoice.client_email && <p className="text-xs">{invoice.client_email}</p>}
            </div>
          </div>

          <table className="w-full mt-6 text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-xs uppercase text-slate-500">
                <th className="py-2">Item</th>
                <th>IMEI / Serial</th>
                <th className="text-right">Price</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((it, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-2">{it.brand} {it.model}</td>
                  <td className="font-mono text-xs">{it.imei_serial}</td>
                  <td className="text-right">${Number(it.sale_price).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end mt-4">
            <div className="w-64 space-y-1 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>${Number(invoice.subtotal).toFixed(2)}</span></div>
              <div className="flex justify-between border-t pt-2 font-bold text-base">
                <span>Total</span><span>${Number(invoice.total).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {(invoice.notes || biz.invoice_footer) && (
            <div className="mt-8 pt-4 border-t text-xs text-slate-600 whitespace-pre-line">
              {invoice.notes && <p className="mb-2"><strong>Notes:</strong> {invoice.notes}</p>}
              {biz.invoice_footer}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default Invoices;
