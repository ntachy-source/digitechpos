import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScanLine, X, CheckCircle2, Camera, Keyboard, Minus, Plus, Search, Package, Copy } from "lucide-react";
import { toast } from "sonner";
import { parseQrPayload } from "@/lib/qr";
import { QrScanner } from "@/components/QrScanner";
import { ReceiptDialog, type ReceiptData } from "@/components/ReceiptDialog";

interface CartItem { id: string; brand: string; model: string; imei_serial: string; sale_price: number; quantity: number; stock: number; }
interface StockProduct { id: string; brand: string; model: string; category: string | null; imei_serial: string; sale_price: number; quantity: number; }

const POS = () => {
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [stock, setStock] = useState<StockProduct[]>([]);
  const [stockSearch, setStockSearch] = useState("");

  const total = cart.reduce((s, i) => s + Number(i.sale_price) * i.quantity, 0);

  const loadStock = async () => {
    const { data, error } = await supabase
      .from("products")
      .select("id, brand, model, category, imei_serial, sale_price, quantity")
      .eq("status", "in_stock")
      .order("brand", { ascending: true });
    if (error) return toast.error(error.message);
    setStock((data ?? []) as StockProduct[]);
  };

  useEffect(() => { loadStock(); }, []);

  const addProduct = (p: StockProduct) => {
    const existing = cart.find(c => c.id === p.id);
    if (existing) {
      if (existing.quantity >= existing.stock) { toast.info("No more stock available"); return; }
      setCart(prev => prev.map(c => c.id === p.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      setCart(prev => [...prev, { id: p.id, brand: p.brand, model: p.model, imei_serial: p.imei_serial, sale_price: Number(p.sale_price), quantity: 1, stock: p.quantity ?? 1 }]);
    }
    toast.success(`Added: ${p.brand} ${p.model}`);
  };

  const copyId = async (val: string) => {
    try { await navigator.clipboard.writeText(val); toast.success("Product ID copied"); }
    catch { toast.error("Copy failed"); }
  };

  const filteredStock = stock.filter(p => {
    const q = stockSearch.toLowerCase().trim();
    if (!q) return true;
    return [p.brand, p.model, p.category, p.imei_serial].some(v => v?.toLowerCase().includes(q));
  });

  const lookupAndAdd = async (raw: string) => {
    const id = parseQrPayload(raw);
    if (!id) return;
    const existing = cart.find(c => c.imei_serial === id);
    if (existing) {
      if (existing.quantity >= existing.stock) { toast.info("No more stock available"); return; }
      setCart(prev => prev.map(c => c.id === existing.id ? { ...c, quantity: c.quantity + 1 } : c));
      toast.success(`Added another: ${existing.brand} ${existing.model}`);
      return;
    }
    const { data, error } = await supabase
      .from("products")
      .select("id, brand, model, imei_serial, sale_price, status, quantity")
      .eq("imei_serial", id)
      .maybeSingle();
    if (error) return toast.error(error.message);
    if (!data) return toast.error("Product not found");
    if (data.status !== "in_stock") return toast.error("Product is not available");
    setCart(prev => [...prev, { ...(data as any), quantity: 1, stock: (data as any).quantity ?? 1 }]);
    toast.success(`Added: ${data.brand} ${data.model}`);
  };

  const updateQty = (id: string, delta: number) => {
    setCart(prev => prev.map(c => {
      if (c.id !== id) return c;
      const next = c.quantity + delta;
      if (next < 1) return c;
      if (next > c.stock) { toast.info(`Only ${c.stock} in stock`); return c; }
      return { ...c, quantity: next };
    }));
  };

  const setQty = (id: string, value: number) => {
    setCart(prev => prev.map(c => {
      if (c.id !== id) return c;
      const n = Math.max(1, Math.min(c.stock, Math.floor(value) || 1));
      return { ...c, quantity: n };
    }));
  };

  const handleManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (manual.trim()) { lookupAndAdd(manual.trim()); setManual(""); }
  };

  const checkout = async () => {
    if (cart.length === 0) return toast.error("Cart is empty");
    setBusy(true);
    const snapshotItems = cart.flatMap(c =>
      Array.from({ length: c.quantity }, () => ({
        brand: c.brand, model: c.model, imei_serial: c.imei_serial, sale_price: Number(c.sale_price),
      }))
    );
    const snapshotTotal = total;
    const snapshotName = customerName;
    const snapshotPhone = customerPhone;
    const snapshotAddress = customerAddress;
    const { data, error } = await supabase.rpc("process_sale_qty" as any, {
      _items: cart.map(c => ({ product_id: c.id, quantity: c.quantity })),
      _customer_name: customerName || null,
      _customer_phone: customerPhone || null,
      _customer_address: customerAddress || null,
    } as any);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Sale completed! Total: $${snapshotTotal.toFixed(2)}`);
    setReceipt({
      saleId: data as string,
      createdAt: new Date().toISOString(),
      customerName: snapshotName,
      customerPhone: snapshotPhone,
      customerAddress: snapshotAddress,
      items: snapshotItems,
      total: snapshotTotal,
    });
    setCart([]); setCustomerName(""); setCustomerPhone(""); setCustomerAddress("");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Point of Sale</h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">Scan a product QR code to add it to the cart.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
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
                <div key={item.id} className="p-3 rounded-lg border bg-secondary/30 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{item.brand} {item.model}</p>
                      <p className="text-xs font-mono text-muted-foreground truncate">{item.imei_serial}</p>
                      <p className="text-xs text-muted-foreground">${Number(item.sale_price).toFixed(2)} each · {item.stock} in stock</p>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => setCart(cart.filter(c => c.id !== item.id))}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateQty(item.id, -1)} disabled={item.quantity <= 1}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Input
                        type="number"
                        min={1}
                        max={item.stock}
                        value={item.quantity}
                        onChange={e => setQty(item.id, Number(e.target.value))}
                        className="h-8 w-16 text-center"
                      />
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateQty(item.id, 1)} disabled={item.quantity >= item.stock}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <Badge variant="outline" className="font-semibold">${(Number(item.sale_price) * item.quantity).toFixed(2)}</Badge>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t">
              <div className="space-y-1">
                <Label className="text-xs">Customer name</Label>
                <Input value={customerName} onChange={e => setCustomerName(e.target.value)} maxLength={100} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Phone</Label>
                <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} maxLength={32} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Address</Label>
                <Input value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} maxLength={250} placeholder="Street, city, etc." />
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

      <ReceiptDialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)} receipt={receipt} />
    </div>
  );
};

export default POS;
