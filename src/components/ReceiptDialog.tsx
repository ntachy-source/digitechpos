import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

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

export const ReceiptDialog = ({ open, onOpenChange, receipt }: Props) => {
  const handlePrint = () => {
    if (!receipt) return;
    const w = window.open("", "_blank", "width=380,height=640");
    if (!w) return;
    const date = new Date(receipt.createdAt).toLocaleString();
    const itemsHtml = receipt.items.map(i => `
      <tr>
        <td>
          <div>${i.brand} ${i.model}</div>
          <div class="imei">${i.imei_serial}</div>
        </td>
        <td class="right">$${Number(i.sale_price).toFixed(2)}</td>
      </tr>`).join("");
    w.document.write(`
      <html><head><title>Receipt ${receipt.saleId.slice(0, 8)}</title>
      <style>
        body{font-family:system-ui,monospace;padding:16px;max-width:320px;margin:0 auto;color:#000}
        h1{font-size:18px;margin:0 0 4px;text-align:center}
        .sub{text-align:center;font-size:12px;color:#444;margin-bottom:12px}
        hr{border:none;border-top:1px dashed #999;margin:8px 0}
        table{width:100%;border-collapse:collapse;font-size:12px}
        td{padding:4px 0;vertical-align:top}
        .right{text-align:right;white-space:nowrap}
        .imei{font-family:monospace;font-size:10px;color:#666}
        .total{font-size:16px;font-weight:700;display:flex;justify-content:space-between;margin-top:8px}
        .meta{font-size:11px;color:#444;margin-bottom:8px}
        .foot{text-align:center;font-size:11px;color:#444;margin-top:12px}
      </style></head>
      <body onload="window.print();setTimeout(()=>window.close(),300)">
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
      </body></html>
    `);
    w.document.close();
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
            <Button onClick={handlePrint} className="w-full">
              <Printer className="h-4 w-4 mr-2" /> Print Receipt
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
