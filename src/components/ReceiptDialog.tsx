import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { useRef } from "react";

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
  const itemsHtml = receipt.items
    .map(
      (i) => `
    <tr>
      <td>
        <div>${i.brand} ${i.model}</div>
        <div class="imei">${i.imei_serial}</div>
      </td>
      <td class="right">$${Number(i.sale_price).toFixed(2)}</td>
    </tr>`
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"/><title>Receipt ${receipt.saleId.slice(0, 8)}</title>
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
    </style></head>
    <body>
      <h1>SGH POS</h1>
      <div class="sub">Sales Receipt</div>
      <div class="meta">
        <div>Receipt #: ${receipt.saleId.slice(0, 8).toUpperCase()}</div>
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
    </body></html>`;
};

export const ReceiptDialog = ({ open, onOpenChange, receipt }: Props) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handlePrint = () => {
    if (!receipt) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(buildReceiptHtml(receipt));
    doc.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }, 250);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Sale Receipt</DialogTitle>
        </DialogHeader>
        {receipt && (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              #{receipt.saleId.slice(0, 8).toUpperCase()} · {new Date(receipt.createdAt).toLocaleString()}
            </div>
            {receipt.customerName && (
              <div className="text-sm">
                Customer: <span className="font-medium">{receipt.customerName}</span>
              </div>
            )}
            {receipt.customerAddress && (
              <div className="text-xs text-muted-foreground">{receipt.customerAddress}</div>
            )}
            <div className="border rounded-lg divide-y">
              {receipt.items.map((i, idx) => (
                <div key={idx} className="flex justify-between p-2 text-sm">
                  <div>
                    <div className="font-medium">
                      {i.brand} {i.model}
                    </div>
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
              Opens your system print dialog. Choose any installed or thermal printer.
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
