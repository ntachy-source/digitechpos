import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { renderQrToDataUrl } from "@/lib/qr";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  product: { brand: string; model: string; imei_serial: string; sale_price: number; qr_code: string } | null;
}

export const QrPrintDialog = ({ open, onOpenChange, product }: Props) => {
  const [dataUrl, setDataUrl] = useState<string>("");

  useEffect(() => {
    if (open && product) {
      renderQrToDataUrl(product.qr_code).then(setDataUrl).catch(() => setDataUrl(""));
    } else {
      setDataUrl("");
    }
  }, [open, product]);

  const handlePrint = () => {
    if (!dataUrl || !product) return;
    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) return;
    w.document.write(`
      <html><head><title>Label - ${product.imei_serial}</title>
      <style>
        body{font-family:system-ui;padding:24px;text-align:center}
        img{width:240px;height:240px}
        .meta{margin-top:12px}
        .brand{font-size:18px;font-weight:600}
        .model{font-size:14px;color:#444}
        .imei{font-family:monospace;font-size:12px;margin-top:8px}
        .price{font-size:16px;font-weight:600;margin-top:6px}
      </style></head>
      <body onload="window.print();setTimeout(()=>window.close(),300)">
        <img src="${dataUrl}" />
        <div class="meta">
          <div class="brand">${product.brand}</div>
          <div class="model">${product.model}</div>
          <div class="imei">${product.imei_serial}</div>
          <div class="price">$${Number(product.sale_price).toFixed(2)}</div>
        </div>
      </body></html>
    `);
    w.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Product QR Code</DialogTitle>
        </DialogHeader>
        {product && (
          <div className="space-y-4 text-center">
            <div className="flex justify-center bg-white rounded-lg p-4 border min-h-[260px] items-center">
              {dataUrl ? <img src={dataUrl} alt="QR code" className="w-56 h-56" /> : <span className="text-sm text-muted-foreground">Generating…</span>}
            </div>
            <div>
              <p className="font-semibold">{product.brand} {product.model}</p>
              <p className="font-mono text-sm text-muted-foreground">{product.imei_serial}</p>
              <p className="text-lg font-semibold mt-1">${Number(product.sale_price).toFixed(2)}</p>
            </div>
            <Button onClick={handlePrint} className="w-full">
              <Printer className="h-4 w-4 mr-2" /> Print Label
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
