import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveLicenseId } from "@/lib/license";

export interface ReceiptData {
  saleId: string;
  createdAt: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  items: { brand: string; model: string; imei_serial: string; sale_price: number }[];
  total: number;
}

interface BusinessInfo {
  business_name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  tax_id: string | null;
  logo_url: string | null;
  invoice_footer: string | null;
}

const FALLBACK: BusinessInfo = {
  business_name: "SGH Gadget Store",
  address: "9th Ave & J. Moyo, Amaya Mall Shop 35",
  phone: "0775545181",
  email: null,
  tax_id: null,
  logo_url: null,
  invoice_footer: "Thank you for your purchase!",
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  receipt: ReceiptData | null;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const buildReceiptHtml = (receipt: ReceiptData, biz: BusinessInfo) => {
  const date = new Date(receipt.createdAt).toLocaleString();
  const itemCount = receipt.items.length;
  const itemsHtml = receipt.items
    .map(
      (i) => `
    <tr>
      <td>
        <div class="item-name">${escapeHtml(i.brand)} ${escapeHtml(i.model)}</div>
        <div class="imei">SN: ${escapeHtml(i.imei_serial)}</div>
      </td>
      <td class="right">$${Number(i.sale_price).toFixed(2)}</td>
    </tr>`
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"/><title>Receipt ${receipt.saleId.slice(0, 8)}</title>
    <style>
      @page { size: auto; margin: 4mm; }
      * { box-sizing: border-box; }
      html,body{margin:0;padding:0;color:#000;background:#fff}
      body{font-family:'Courier New',monospace;padding:0;width:100%;font-size:13pt;line-height:1.35}
      .wrap{width:100%;max-width:100%;margin:0 auto}
      .center{text-align:center}
      .logo{max-height:80px;max-width:60%;margin:0 auto 6px;display:block;object-fit:contain}
      .biz-name{font-size:20pt;font-weight:800;letter-spacing:.5px;margin:0}
      .biz-line{font-size:11pt;margin:1px 0}
      hr{border:none;border-top:1px dashed #000;margin:6px 0}
      .double{border-top:2px solid #000;margin:6px 0}
      .meta{font-size:11pt}
      .meta div{display:flex;justify-content:space-between;gap:8px}
      table{width:100%;border-collapse:collapse;font-size:12pt}
      td{padding:3px 0;vertical-align:top}
      .right{text-align:right;white-space:nowrap}
      .item-name{font-weight:700}
      .imei{font-size:10pt;color:#222}
      .totals{font-size:12pt}
      .totals div{display:flex;justify-content:space-between;padding:2px 0}
      .grand{font-size:16pt;font-weight:800;border-top:1px dashed #000;border-bottom:1px dashed #000;padding:5px 0;margin-top:2px}
      .foot{text-align:center;font-size:10pt;margin-top:8px}
      .thanks{font-weight:700;font-size:13pt;margin-top:6px}
      .barcode{text-align:center;font-family:'Libre Barcode 39',monospace;font-size:11pt;margin-top:6px;letter-spacing:1px}
      @media print {
        html,body{width:100%}
        body{font-size:13pt}
      }
    </style></head>
    <body><div class="wrap">
      ${biz.logo_url ? `<img src="${escapeHtml(biz.logo_url)}" class="logo" alt="logo"/>` : ""}
      <div class="center">
        <p class="biz-name">${escapeHtml(biz.business_name)}</p>
        ${biz.address ? `<div class="biz-line">${escapeHtml(biz.address)}</div>` : ""}
        ${biz.phone ? `<div class="biz-line">Tel: ${escapeHtml(biz.phone)}</div>` : ""}
        ${biz.email ? `<div class="biz-line">${escapeHtml(biz.email)}</div>` : ""}
        ${biz.tax_id ? `<div class="biz-line">Tax ID: ${escapeHtml(biz.tax_id)}</div>` : ""}
      </div>
      <div class="double"></div>
      <div class="center" style="font-weight:700;font-size:12px;margin-bottom:4px">SALES RECEIPT</div>
      <div class="meta">
        <div><span>Receipt #</span><span>${receipt.saleId.slice(0, 8).toUpperCase()}</span></div>
        <div><span>Date</span><span>${escapeHtml(date)}</span></div>
        ${receipt.customerName ? `<div><span>Customer</span><span>${escapeHtml(receipt.customerName)}</span></div>` : ""}
        ${receipt.customerPhone ? `<div><span>Phone</span><span>${escapeHtml(receipt.customerPhone)}</span></div>` : ""}
        ${receipt.customerAddress ? `<div><span>Address</span><span>${escapeHtml(receipt.customerAddress)}</span></div>` : ""}
      </div>
      <hr/>
      <table>
        <thead>
          <tr><td style="font-weight:700;border-bottom:1px dashed #000">Item</td><td class="right" style="font-weight:700;border-bottom:1px dashed #000">Price</td></tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <hr/>
      <div class="totals">
        <div><span>Items</span><span>${itemCount}</span></div>
        <div><span>Subtotal</span><span>$${receipt.total.toFixed(2)}</span></div>
        <div class="grand"><span>TOTAL</span><span>$${receipt.total.toFixed(2)}</span></div>
      </div>
      <div class="thanks center">Thank you for your purchase!</div>
      ${biz.invoice_footer ? `<div class="foot">${escapeHtml(biz.invoice_footer)}</div>` : ""}
      <div class="foot">Goods sold are not returnable.<br/>Keep this receipt for warranty claims.</div>
      <div class="barcode">*${receipt.saleId.slice(0, 8).toUpperCase()}*</div>
      </div>
    </body></html>`;
};

export const ReceiptDialog = ({ open, onOpenChange, receipt }: Props) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [biz, setBiz] = useState<BusinessInfo>(FALLBACK);

  useEffect(() => {
    (async () => {
      try {
        const licenseId = await getActiveLicenseId();
        if (!licenseId) return;
        const { data } = await supabase
          .from("business_settings")
          .select("business_name,address,phone,email,tax_id,logo_url,invoice_footer")
          .eq("license_id", licenseId)
          .maybeSingle();
        if (data) {
          setBiz({
            business_name: data.business_name || FALLBACK.business_name,
            address: data.address || FALLBACK.address,
            phone: data.phone || FALLBACK.phone,
            email: data.email,
            tax_id: data.tax_id,
            logo_url: data.logo_url,
            invoice_footer: data.invoice_footer,
          });
        }
      } catch {}
    })();
  }, [open]);

  const handlePrint = () => {
    if (!receipt) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(buildReceiptHtml(receipt, biz));
    doc.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Sale Receipt</DialogTitle>
        </DialogHeader>
        {receipt && (
          <div className="space-y-3">
            <div className="text-center border-b pb-3">
              {biz.logo_url && (
                <img src={biz.logo_url} alt="logo" className="h-12 mx-auto object-contain mb-1" />
              )}
              <div className="font-bold text-base">{biz.business_name}</div>
              {biz.address && <div className="text-xs text-muted-foreground">{biz.address}</div>}
              {biz.phone && <div className="text-xs text-muted-foreground">Tel: {biz.phone}</div>}
              {biz.email && <div className="text-xs text-muted-foreground">{biz.email}</div>}
            </div>

            <div className="text-xs text-muted-foreground flex justify-between">
              <span>#{receipt.saleId.slice(0, 8).toUpperCase()}</span>
              <span>{new Date(receipt.createdAt).toLocaleString()}</span>
            </div>
            {(receipt.customerName || receipt.customerPhone || receipt.customerAddress) && (
              <div className="text-xs space-y-0.5 bg-secondary/40 rounded p-2">
                {receipt.customerName && <div><span className="text-muted-foreground">Customer: </span><span className="font-medium">{receipt.customerName}</span></div>}
                {receipt.customerPhone && <div><span className="text-muted-foreground">Phone: </span>{receipt.customerPhone}</div>}
                {receipt.customerAddress && <div><span className="text-muted-foreground">Address: </span>{receipt.customerAddress}</div>}
              </div>
            )}
            <div className="border rounded-lg divide-y">
              {receipt.items.map((i, idx) => (
                <div key={idx} className="flex justify-between p-2 text-sm">
                  <div>
                    <div className="font-medium">{i.brand} {i.model}</div>
                    <div className="text-xs font-mono text-muted-foreground">{i.imei_serial}</div>
                  </div>
                  <div className="font-medium">${Number(i.sale_price).toFixed(2)}</div>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-lg font-bold pt-2 border-t">
              <span>Total</span>
              <span>${receipt.total.toFixed(2)}</span>
            </div>

            <Button onClick={handlePrint} className="w-full">
              <Printer className="h-4 w-4 mr-2" /> Print Receipt
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              Opens your system print dialog. Works with thermal & standard printers.
            </p>
          </div>
        )}
        <iframe
          ref={iframeRef}
          title="receipt-print"
          style={{ position: "fixed", right: 0, bottom: 0, width: 0, height: 0, border: 0 }}
        />
      </DialogContent>
    </Dialog>
  );
};
