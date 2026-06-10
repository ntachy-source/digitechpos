import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Usb, Plug } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  buildEscPos,
  forgetPrinter,
  getPairedPrinter,
  getPairedPrinterInfo,
  isWebUsbSupported,
  pickPrinter,
  printViaUsb,
} from "@/lib/printer";

export interface ReceiptData {
  saleId: string;
  createdAt: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  items: { brand: string; model: string; imei_serial: string; sale_price: number }[];
  total: number;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  receipt: ReceiptData | null;
}

const buildReceiptHtml = (receipt: ReceiptData) => {
  const date = new Date(receipt.createdAt).toLocaleString();
  const itemsHtml = receipt.items.map(i => `
    <tr>
      <td>
        <div>${i.brand} ${i.model}</div>
        <div class="imei">${i.imei_serial}</div>
      </td>
      <td class="right">$${Number(i.sale_price).toFixed(2)}</td>
    </tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"/><title>Receipt ${receipt.saleId.slice(0,8)}</title>
    <style>
      @page { size: 80mm auto; margin: 4mm; }
      * { box-sizing: border-box; }
      html,body{margin:0;padding:0;color:#000;background:#fff}
      body{font-family:'Courier New',monospace;padding:8px;width:80mm;font-size:12px;line-height:1.35}
      h1{font-size:16px;margin:0 0 2px;text-align:center}
      .sub{text-align:center;font-size:11px;margin-bottom:8px}
      hr{border:none;border-top:1px dashed #000;margin:6px 0}
      table{width:100%;border-collapse:collapse;font-size:12px}
      td{padding:3px 0;vertical-align:top}
      .right{text-align:right;white-space:nowrap}
      .imei{font-size:10px;color:#333}
      .total{font-size:14px;font-weight:700;display:flex;justify-content:space-between;margin-top:6px}
      .meta{font-size:11px;margin-bottom:6px}
      .foot{text-align:center;font-size:11px;margin-top:10px}
      @media print { .noprint { display: none !important; } body { width: auto; } }
    </style></head>
    <body>
      <h1>SGH POS</h1>
      <div class="sub">Sales Receipt</div>
      <div class="meta">
        <div>Receipt #: ${receipt.saleId.slice(0,8).toUpperCase()}</div>
        <div>Date: ${date}</div>
        ${receipt.customerName ? `<div>Customer: ${receipt.customerName}</div>` : ""}
        ${receipt.customerPhone ? `<div>Phone: ${receipt.customerPhone}</div>` : ""}
        ${receipt.customerAddress ? `<div>Address: ${receipt.customerAddress}</div>` : ""}
      </div>
      <hr/>
      <table>${itemsHtml}</table>
      <hr/>
      <div class="total"><span>TOTAL</span><span>$${receipt.total.toFixed(2)}</span></div>
      <div class="foot">Thank you for your purchase!</div>
      <div class="noprint" style="margin-top:16px;text-align:center">
        <button onclick="window.print()" style="padding:8px 16px;font-size:14px;cursor:pointer">Print</button>
      </div>
      <script>
        window.addEventListener('load', function(){
          setTimeout(function(){ try { window.focus(); window.print(); } catch(e){} }, 250);
        });
      </script>
    </body></html>`;
};

export const ReceiptDialog = ({ open, onOpenChange, receipt }: Props) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [pairedName, setPairedName] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const webUsb = isWebUsbSupported();

  useEffect(() => {
    if (!open) return;
    const info = getPairedPrinterInfo();
    setPairedName(info?.name ?? null);
  }, [open]);

  const printViaIframe = () => {
    if (!receipt) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(buildReceiptHtml(receipt));
    doc.close();
    setTimeout(() => {
      try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }
      catch (e) { console.error("Print failed", e); }
    }, 300);
  };

  const printViaWindow = () => {
    if (!receipt) return;
    const w = window.open("", "_blank");
    if (!w) { printViaIframe(); return; }
    w.document.open();
    w.document.write(buildReceiptHtml(receipt));
    w.document.close();
  };

  const handleBrowserPrint = () => {
    try { printViaWindow(); } catch { printViaIframe(); }
  };

  const handleConnectPrinter = async () => {
    try {
      const device = await pickPrinter();
      setPairedName(device.productName || "Printer");
      toast.success(`Connected: ${device.productName || "Printer"}`);
    } catch (e: any) {
      if (e?.name === "NotFoundError") return; // user cancelled
      toast.error(e?.message || "Failed to connect printer");
    }
  };

  const handleForget = () => {
    forgetPrinter();
    setPairedName(null);
    toast.success("Printer disconnected");
  };

  const handleThermalPrint = async () => {
    if (!receipt) return;
    setPrinting(true);
    try {
      let device = await getPairedPrinter();
      if (!device) device = await pickPrinter();
      await printViaUsb(device, buildEscPos({
        saleId: receipt.saleId,
        createdAt: receipt.createdAt,
        customerName: receipt.customerName,
        customerPhone: receipt.customerPhone,
        customerAddress: receipt.customerAddress,
        items: receipt.items,
        total: receipt.total,
      }));
      setPairedName(device.productName || "Printer");
      toast.success("Receipt sent to printer");
    } catch (e: any) {
      toast.error(e?.message || "Print failed");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Sale Receipt</DialogTitle></DialogHeader>
        {receipt && (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              #{receipt.saleId.slice(0, 8).toUpperCase()} · {new Date(receipt.createdAt).toLocaleString()}
            </div>
            {receipt.customerName && <div className="text-sm">Customer: <span className="font-medium">{receipt.customerName}</span></div>}
            {receipt.customerAddress && <div className="text-xs text-muted-foreground">{receipt.customerAddress}</div>}
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
              <span>Total</span><span>${receipt.total.toFixed(2)}</span>
            </div>

            {/* Printer connection */}
            <div className="rounded-lg border p-3 space-y-2 bg-secondary/30">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <Usb className="h-4 w-4 text-primary" />
                  <span className="font-medium">Thermal Printer</span>
                </div>
                {pairedName ? (
                  <span className="text-xs text-green-600 dark:text-green-400">● {pairedName}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">Not connected</span>
                )}
              </div>
              {webUsb ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={handleConnectPrinter}>
                    <Plug className="h-3 w-3 mr-1" /> {pairedName ? "Change" : "Connect Printer"}
                  </Button>
                  {pairedName && (
                    <Button size="sm" variant="ghost" onClick={handleForget}>Forget</Button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Direct printer connection requires Chrome or Edge on desktop/Android. Use the browser print button below instead.
                </p>
              )}
            </div>

            {webUsb && (
              <Button onClick={handleThermalPrint} className="w-full" disabled={printing}>
                <Printer className="h-4 w-4 mr-2" />
                {printing ? "Printing..." : pairedName ? `Print to ${pairedName}` : "Connect & Print"}
              </Button>
            )}
            <Button onClick={handleBrowserPrint} variant={webUsb ? "outline" : "default"} className="w-full">
              <Printer className="h-4 w-4 mr-2" /> Print via Browser Dialog
            </Button>
            <p className="text-[10px] text-muted-foreground text-center">
              Use "Connect Printer" for direct USB thermal printers (ESC/POS). The browser dialog works for any installed printer.
            </p>
          </div>
        )}
        <iframe ref={iframeRef} title="receipt-print" style={{ position: "fixed", right: 0, bottom: 0, width: 0, height: 0, border: 0 }} />
      </DialogContent>
    </Dialog>
  );
};
