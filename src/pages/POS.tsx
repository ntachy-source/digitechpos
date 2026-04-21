import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScanLine, X, CheckCircle2, Camera, Keyboard } from "lucide-react";
import { toast } from "sonner";
import { parseQrPayload } from "@/lib/qr";
import { QrScanner } from "@/components/QrScanner";

interface CartItem { id: string; brand: string; model: string; imei_serial: string; sale_price: number; }

const POS = () => {
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [busy, setBusy] = useState(false);

  const total = cart.reduce((s, i) => s + Number(i.sale_price), 0);

  const lookupAndAdd = async (raw: string) => {
    const id = parseQrPayload(raw);
    if (!id) return;
    if (cart.some(c => c.imei_serial === id)) {
      toast.info("Already in cart");
      return;
    }
    const { data, error } = await supabase
      .from("products")
      .select("id, brand, model, imei_serial, sale_price, status")
      .eq("imei_serial", id)
      .maybeSingle();
    if (error) return toast.error(error.message);
    if (!data) return toast.error("Product not found");
    if (data.status !== "in_stock") return toast.error("Product is not available");
    setCart(prev => [...prev, data as CartItem]);
    toast.success(`Added: ${data.brand} ${data.model}`);
  };

  const handleManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (manual.trim()) { lookupAndAdd(manual.trim()); setManual(""); }
  };

  const checkout = async () => {
    if (cart.length === 0) return toast.error("Cart is empty");
    setBusy(true);
    const { data, error } = await supabase.rpc("process_sale", {
      _product_ids: cart.map(c => c.id),
      _customer_name: customerName || null,
      _customer_phone: customerPhone || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Sale completed! Total: $${total.toFixed(2)}`);
    setCart([]); setCustomerName(""); setCustomerPhone("");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Point of Sale</h1>
        <p className="text-muted-foreground mt-1">Scan a product QR code to add it to the cart.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="border-border/60 shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ScanLine className="h-5 w-5 text-primary" /> Scan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {scanning ? (
              <>
                <QrScanner onResult={(t) => lookupAndAdd(t)} onError={(e) => toast.error(e)} />
                <Button variant="outline" className="w-full" onClick={() => setScanning(false)}>
                  Stop Camera
                </Button>
              </>
            ) : (
              <Button className="w-full" onClick={() => setScanning(true)}>
                <Camera className="h-4 w-4 mr-2" /> Start Camera Scanner
              </Button>
            )}
            <form onSubmit={handleManual} className="space-y-2">
              <Label className="flex items-center gap-2 text-sm"><Keyboard className="h-4 w-4" /> Or enter IMEI / Serial</Label>
              <div className="flex gap-2">
                <Input value={manual} onChange={e => setManual(e.target.value)} placeholder="IMEI or serial..." />
                <Button type="submit" variant="secondary">Add</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-card">
          <CardHeader>
            <CardTitle>Cart ({cart.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 max-h-72 overflow-auto">
              {cart.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No items yet</p>}
              {cart.map(item => (
                <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border bg-secondary/30">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{item.brand} {item.model}</p>
                    <p className="text-xs font-mono text-muted-foreground truncate">{item.imei_serial}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline">${Number(item.sale_price).toFixed(2)}</Badge>
                    <Button size="icon" variant="ghost" onClick={() => setCart(cart.filter(c => c.id !== item.id))}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t">
              <div className="space-y-1">
                <Label className="text-xs">Customer name</Label>
                <Input value={customerName} onChange={e => setCustomerName(e.target.value)} maxLength={100} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Phone</Label>
                <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} maxLength={32} />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-2xl font-bold">${total.toFixed(2)}</span>
            </div>

            <Button className="w-full" size="lg" onClick={checkout} disabled={busy || cart.length === 0}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {busy ? "Processing..." : "Complete Sale"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default POS;
