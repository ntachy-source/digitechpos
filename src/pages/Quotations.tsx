import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { toast } from "sonner";
import { FileSpreadsheet, Plus, Printer, Download, Eye, Trash2 } from "lucide-react";
import { format } from "date-fns";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { getActiveLicenseId } from "@/lib/license";

interface QuoteItem { description: string; quantity: number; unit_price: number; }
interface BizSnapshot {
  business_name: string; address?: string | null; phone?: string | null;
  email?: string | null; tax_id?: string | null; logo_url?: string | null; invoice_footer?: string | null;
}
interface Quotation {
  id: string;
  quote_number: string;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  client_address: string | null;
  notes: string | null;
  subtotal: number;
  total: number;
  discount: number;
  tax: number;
  status: string;
  valid_until: string | null;
  items: QuoteItem[];
  business_snapshot: BizSnapshot | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  accepted: "bg-green-500/15 text-green-700 dark:text-green-400",
  declined: "bg-destructive/15 text-destructive",
  expired: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
};

const Quotations = () => {
  const [quotes, setQuotes] = useState<Quotation[]>([]);
  const [open, setOpen] = useState(false);
  const [previewing, setPreviewing] = useState<Quotation | null>(null);
  const [busy, setBusy] = useState(false);
  const [biz, setBiz] = useState<BizSnapshot | null>(null);

  const [client, setClient] = useState({ name: "", phone: "", email: "", address: "" });
  const [items, setItems] = useState<QuoteItem[]>([{ description: "", quantity: 1, unit_price: 0 }]);
  const [notes, setNotes] = useState("");
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [validUntil, setValidUntil] = useState("");

  useEffect(() => {
    document.title = "Quotations · SGH POS";
    load();
    loadBiz();
  }, []);

  const load = async () => {
    const { data, error } = await supabase.from("quotations" as any).select("*").order("created_at", { ascending: false });
    if (error) return toast.error(error.message);
    setQuotes((data ?? []) as unknown as Quotation[]);
  };

  const loadBiz = async () => {
    const licenseId = await getActiveLicenseId();
    if (!licenseId) return;
    const { data } = await supabase.from("business_settings").select("*").eq("license_id", licenseId).maybeSingle();
    if (data) setBiz(data as any);
  };

  const subtotal = items.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unit_price || 0), 0);
  const total = Math.max(0, subtotal - Number(discount || 0) + Number(tax || 0));

  const updateItem = (i: number, patch: Partial<QuoteItem>) =>
    setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const addItem = () => setItems([...items, { description: "", quantity: 1, unit_price: 0 }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));

  const reset = () => {
    setClient({ name: "", phone: "", email: "", address: "" });
    setItems([{ description: "", quantity: 1, unit_price: 0 }]);
    setNotes(""); setDiscount(0); setTax(0); setValidUntil("");
  };

  const create = async () => {
    if (!client.name.trim()) return toast.error("Client name is required");
    const valid = items.filter(i => i.description.trim());
    if (valid.length === 0) return toast.error("Add at least one item with a description");
    setBusy(true);
    const licenseId = await getActiveLicenseId();
    if (!licenseId) { setBusy(false); return toast.error("No active license"); }
    const { data: userRes } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("quotations" as any).insert({
      client_name: client.name || null,
      client_phone: client.phone || null,
      client_email: client.email || null,
      client_address: client.address || null,
      notes: notes || null,
      items: valid as any,
      subtotal, discount, tax, total,
      valid_until: validUntil || null,
      business_snapshot: biz as any,
      license_id: licenseId,
      created_by: userRes.user?.id,
    } as any).select().single();
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Quotation ${(data as any).quote_number} created`);
    reset();
    setOpen(false);
    load();
    // Wait for editor dialog to fully close before opening the preview
    setTimeout(() => setPreviewing(data as unknown as Quotation), 250);
  };

  const setStatus = async (q: Quotation, status: string) => {
    const { error } = await supabase.from("quotations" as any).update({ status }).eq("id", q.id);
    if (error) return toast.error(error.message);
    toast.success(`Marked as ${status}`);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold flex items-center gap-2">
              <FileSpreadsheet className="h-6 w-6 sm:h-7 sm:w-7 text-primary shrink-0" /> Quotations
            </h1>
            <p className="text-muted-foreground mt-1 text-xs sm:text-sm">Create quotes and review sales history.</p>
          </div>
          <Button onClick={() => setOpen(true)} size="sm" className="sm:size-default">
            <Plus className="h-4 w-4 mr-2" /> New Quotation
          </Button>
        </div>

      <Card>
        <CardHeader className="px-4 sm:px-6"><CardTitle className="text-base sm:text-lg">All quotations ({quotes.length})</CardTitle></CardHeader>
        <CardContent className="px-0 sm:px-6">
          {/* Mobile cards */}
          <div className="sm:hidden divide-y">
            {quotes.map(q => (
              <button key={q.id} onClick={() => setPreviewing(q)} className="w-full text-left px-4 py-3 active:bg-muted/50">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-muted-foreground">{q.quote_number}</div>
                    <div className="font-medium truncate">{q.client_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{format(new Date(q.created_at), "PP")}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold">${Number(q.total).toFixed(2)}</div>
                    <Badge variant="secondary" className={`mt-1 text-[10px] ${STATUS_COLORS[q.status] ?? ""}`}>{q.status}</Badge>
                  </div>
                </div>
              </button>
            ))}
            {quotes.length === 0 && <div className="text-center text-muted-foreground py-8 text-sm">No quotations yet</div>}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quote #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Valid until</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map(q => (
                  <TableRow key={q.id}>
                    <TableCell className="font-mono text-xs">{q.quote_number}</TableCell>
                    <TableCell>{q.client_name || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-xs">{format(new Date(q.created_at), "PP")}</TableCell>
                    <TableCell className="text-xs">{q.valid_until ? format(new Date(q.valid_until), "PP") : "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={STATUS_COLORS[q.status] ?? ""}>{q.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold">${Number(q.total).toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setPreviewing(q)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {quotes.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No quotations yet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

        {/* Editor */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>New Quotation</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Client name *</Label>
                  <Input value={client.name} onChange={e => setClient({ ...client, name: e.target.value })} /></div>
                <div className="space-y-1"><Label>Phone</Label>
                  <Input value={client.phone} onChange={e => setClient({ ...client, phone: e.target.value })} /></div>
                <div className="space-y-1"><Label>Email</Label>
                  <Input type="email" value={client.email} onChange={e => setClient({ ...client, email: e.target.value })} /></div>
                <div className="space-y-1"><Label>Address</Label>
                  <Input value={client.address} onChange={e => setClient({ ...client, address: e.target.value })} /></div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Items</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addItem}>
                    <Plus className="h-4 w-4 mr-1" /> Add line
                  </Button>
                </div>
                {items.map((it, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <Input className="col-span-12 sm:col-span-6" placeholder="Description (e.g. iPhone 14 128GB)"
                      value={it.description} onChange={e => updateItem(i, { description: e.target.value })} />
                    <Input className="col-span-4 sm:col-span-2" type="number" min={1} placeholder="Qty"
                      value={it.quantity} onChange={e => updateItem(i, { quantity: Number(e.target.value) })} />
                    <Input className="col-span-6 sm:col-span-3" type="number" min={0} step="0.01" placeholder="Unit price"
                      value={it.unit_price} onChange={e => updateItem(i, { unit_price: Number(e.target.value) })} />
                    <Button type="button" size="icon" variant="ghost" className="col-span-2 sm:col-span-1"
                      onClick={() => removeItem(i)} disabled={items.length === 1}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1"><Label>Discount</Label>
                  <Input type="number" min={0} step="0.01" value={discount} onChange={e => setDiscount(Number(e.target.value))} /></div>
                <div className="space-y-1"><Label>Tax</Label>
                  <Input type="number" min={0} step="0.01" value={tax} onChange={e => setTax(Number(e.target.value))} /></div>
                <div className="space-y-1"><Label>Valid until</Label>
                  <Input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} /></div>
              </div>

              <div className="rounded-lg border p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Discount</span><span>−${Number(discount).toFixed(2)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Tax</span><span>+${Number(tax).toFixed(2)}</span></div>
                <div className="flex justify-between font-bold border-t pt-2"><span>Total</span><span>${total.toFixed(2)}</span></div>
              </div>

              <div className="space-y-1">
                <Label>Notes</Label>
                <Textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Terms, delivery time, payment instructions..." />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={create} disabled={busy}>{busy ? "Creating..." : "Create Quotation"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      <QuotePreview quote={previewing} onClose={() => setPreviewing(null)} onStatus={setStatus} />
    </div>
  );
};

const QuotePreview = ({ quote, onClose, onStatus }: {
  quote: Quotation | null; onClose: () => void; onStatus: (q: Quotation, s: string) => void;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  if (!quote) return null;
  const biz = quote.business_snapshot ?? { business_name: "Business" } as BizSnapshot;

  const print = () => {
    const html = ref.current?.outerHTML;
    if (!html) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>${quote.quote_number}</title>
      <script src="https://cdn.tailwindcss.com"><\/script></head><body>${html}</body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); w.close(); }, 400);
  };

  const downloadPdf = async () => {
    if (!ref.current) return;
    // Clone node off-screen at fixed A4 width so layout doesn't depend on viewport
    const source = ref.current;
    const clone = source.cloneNode(true) as HTMLElement;
    const A4_W_PX = 794; // ~ A4 width at 96dpi
    const wrapper = document.createElement("div");
    wrapper.style.cssText = `position:fixed;left:-10000px;top:0;width:${A4_W_PX}px;background:#ffffff;`;
    clone.style.width = `${A4_W_PX}px`;
    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    try {
      const imgs = Array.from(clone.querySelectorAll("img"));
      await Promise.all(imgs.map(im => new Promise<void>(resolve => {
        if (im.complete && im.naturalWidth > 0) return resolve();
        im.onload = () => resolve(); im.onerror = () => resolve();
      })));

      const canvas = await html2canvas(clone, { scale: 1.5, backgroundColor: "#ffffff", useCORS: true, logging: false, windowWidth: A4_W_PX });

      const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
      const JPEG_QUALITY = 0.7;
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 0;
      const usableW = pageW - margin * 2;
      const ratio = usableW / canvas.width;
      const fullH = canvas.height * ratio;

      if (fullH <= pageH) {
        pdf.addImage(canvas.toDataURL("image/jpeg", JPEG_QUALITY), "JPEG", margin, margin, usableW, fullH, undefined, "FAST");
      } else {
        // Slice the canvas into page-sized chunks
        const pageHeightPx = Math.floor((pageH / ratio));
        let rendered = 0;
        let first = true;
        while (rendered < canvas.height) {
          const sliceH = Math.min(pageHeightPx, canvas.height - rendered);
          const pageCanvas = document.createElement("canvas");
          pageCanvas.width = canvas.width;
          pageCanvas.height = sliceH;
          const ctx = pageCanvas.getContext("2d");
          if (!ctx) break;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
          ctx.drawImage(canvas, 0, rendered, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
          if (!first) pdf.addPage();
          first = false;
          pdf.addImage(pageCanvas.toDataURL("image/jpeg", JPEG_QUALITY), "JPEG", margin, margin, usableW, sliceH * ratio, undefined, "FAST");
          rendered += sliceH;
        }
      }

      pdf.save(`${quote.quote_number}.pdf`);
    } finally {
      document.body.removeChild(wrapper);
    }
  };

  return (
    <Dialog open={!!quote} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto p-0 w-[calc(100%-1rem)] sm:w-full">
        <DialogTitle className="sr-only">Quotation {quote.quote_number}</DialogTitle>
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 px-3 sm:px-6 py-2 sm:py-3 border-b bg-background">
          <Select value={quote.status} onValueChange={(v) => onStatus(quote, v)}>
            <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="declined">Declined</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={print}><Printer className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Print</span></Button>
          <Button size="sm" onClick={downloadPdf}><Download className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">PDF</span></Button>
        </div>

        <div className="p-2 sm:p-6 bg-slate-100">
          <div ref={ref} className="bg-white text-slate-900 rounded shadow-sm">
            {/* Accent bar */}
            <div className="h-2 bg-slate-900 rounded-t" />

            <div className="p-4 sm:p-8">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:gap-6 pb-4 sm:pb-6 border-b border-slate-200">
                <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                  {biz.logo_url && (
                    <img src={biz.logo_url} alt="" crossOrigin="anonymous" className="h-14 w-14 sm:h-16 sm:w-16 object-contain rounded shrink-0" />
                  )}
                  <div className="min-w-0">
                    <h2 className="text-lg sm:text-2xl font-bold tracking-tight leading-tight break-words">{biz.business_name}</h2>
                    {biz.address && <p className="text-xs text-slate-600 whitespace-pre-line mt-1">{biz.address}</p>}
                    <p className="text-xs text-slate-600 mt-0.5">
                      {[biz.phone, biz.email].filter(Boolean).join(" · ")}
                    </p>
                    {biz.tax_id && <p className="text-xs text-slate-600">Tax ID: {biz.tax_id}</p>}
                  </div>
                </div>
                <div className="sm:text-right shrink-0">
                  <p className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">QUOTATION</p>
                  <p className="text-xs font-mono text-slate-500 mt-1">{quote.quote_number}</p>
                  <p className="text-xs text-slate-600 mt-2">Date: {format(new Date(quote.created_at), "PPP")}</p>
                  {quote.valid_until && (
                    <p className="text-xs text-slate-600">Valid until: {format(new Date(quote.valid_until), "PPP")}</p>
                  )}
                </div>
              </div>

              {/* Bill to */}
              <div className="grid grid-cols-2 gap-6 mt-6">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Quote for</p>
                  <p className="font-semibold text-base">{quote.client_name || "—"}</p>
                  {quote.client_address && <p className="text-xs text-slate-600 whitespace-pre-line mt-0.5">{quote.client_address}</p>}
                  {quote.client_phone && <p className="text-xs text-slate-600">{quote.client_phone}</p>}
                  {quote.client_email && <p className="text-xs text-slate-600">{quote.client_email}</p>}
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Status</p>
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase bg-slate-900 text-white">
                    {quote.status}
                  </span>
                </div>
              </div>

              {/* Items */}
              <table className="w-full mt-8 text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-left text-xs uppercase tracking-wider">
                    <th className="py-3 px-3 font-semibold">Description</th>
                    <th className="py-3 px-3 text-right font-semibold w-16">Qty</th>
                    <th className="py-3 px-3 text-right font-semibold w-24">Unit Price</th>
                    <th className="py-3 px-3 text-right font-semibold w-28">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.items.map((it, i) => (
                    <tr key={i} className="border-b border-slate-200">
                      <td className="py-3 px-3">{it.description}</td>
                      <td className="py-3 px-3 text-right">{it.quantity}</td>
                      <td className="py-3 px-3 text-right">${Number(it.unit_price).toFixed(2)}</td>
                      <td className="py-3 px-3 text-right font-medium">${(Number(it.quantity) * Number(it.unit_price)).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div className="flex justify-end mt-6">
                <div className="w-72 space-y-1.5 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span><span>${Number(quote.subtotal).toFixed(2)}</span>
                  </div>
                  {Number(quote.discount) > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Discount</span><span>−${Number(quote.discount).toFixed(2)}</span>
                    </div>
                  )}
                  {Number(quote.tax) > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Tax</span><span>+${Number(quote.tax).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between bg-slate-900 text-white px-3 py-2.5 rounded mt-2 font-bold text-base">
                    <span>Total</span><span>${Number(quote.total).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Notes & Footer */}
              {(quote.notes || biz.invoice_footer) && (
                <div className="mt-10 pt-4 border-t border-slate-200 text-xs text-slate-600 whitespace-pre-line space-y-2">
                  {quote.notes && (
                    <div>
                      <p className="font-semibold text-slate-900 uppercase tracking-wider text-[10px] mb-1">Notes</p>
                      <p>{quote.notes}</p>
                    </div>
                  )}
                  {biz.invoice_footer && (
                    <p className="text-center text-slate-500 pt-2">{biz.invoice_footer}</p>
                  )}
                </div>
              )}

              <div className="mt-8 pt-4 border-t border-slate-200 text-center text-[10px] text-slate-400 uppercase tracking-wider">
                Thank you for your business
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default Quotations;
