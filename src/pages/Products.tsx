import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QrCode, Search, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { QrPrintDialog } from "@/components/QrPrintDialog";
import { ProductEditDialog } from "@/components/ProductEditDialog";

const Products = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [printProduct, setPrintProduct] = useState<any | null>(null);
  const [editProduct, setEditProduct] = useState<any | null>(null);

  useEffect(() => {
    document.title = "Products · SGH POS";
    load();
  }, []);

  const load = async () => {
    const { data, error } = await supabase
      .from("products").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setProducts(data ?? []);
  };

  const deleteProduct = async (id: string) => {
    if (!confirm("Are you sure you want to delete this product?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Product deleted");
    load();
  };

  const filtered = products.filter(p =>
    [p.brand, p.model, p.imei_serial].some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Products</h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">Browse all products and view their QR codes.</p>
      </div>

      <Card className="border-border/60 shadow-card">
        <CardHeader>
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search brand, model, IMEI..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
          {/* Mobile */}
          <div className="md:hidden space-y-3">
            {filtered.length === 0 && <p className="text-center text-muted-foreground py-8 text-sm">No products yet.</p>}
            {filtered.map(p => (
              <div key={p.id} className="rounded-lg border p-3 bg-card space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{p.brand} {p.model}</p>
                    <p className="text-xs text-muted-foreground">{p.category}</p>
                    <p className="text-xs font-mono text-muted-foreground truncate mt-1">{p.imei_serial}</p>
                  </div>
                  <Badge variant={p.status === "in_stock" ? "default" : "secondary"}
                    className={p.status === "in_stock" ? "bg-success text-success-foreground shrink-0" : "shrink-0"}>
                    {p.status === "in_stock" ? "In Stock" : "Sold"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="font-semibold">${Number(p.sale_price).toFixed(2)}</span>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" onClick={() => setEditProduct(p)}>
                      <Pencil className="h-4 w-4 mr-1" /> Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setPrintProduct(p)}>
                      <QrCode className="h-4 w-4 mr-1" /> QR
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => deleteProduct(p.id)}>
                      <Trash2 className="h-4 w-4 mr-1" /> Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>IMEI / Serial</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No products yet.</TableCell></TableRow>
                )}
                {filtered.map(p => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.brand} {p.model}</div>
                      <div className="text-xs text-muted-foreground">{p.category}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p.imei_serial}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "in_stock" ? "default" : "secondary"}
                        className={p.status === "in_stock" ? "bg-success text-success-foreground" : ""}>
                        {p.status === "in_stock" ? "In Stock" : "Sold"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">${Number(p.sale_price).toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" title="Edit" onClick={() => setEditProduct(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="View QR" onClick={() => setPrintProduct(p)}>
                          <QrCode className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <QrPrintDialog open={!!printProduct} onOpenChange={o => !o && setPrintProduct(null)} product={printProduct} />
      <ProductEditDialog open={!!editProduct} onOpenChange={o => !o && setEditProduct(null)} product={editProduct} onSaved={load} />
    </div>
  );
};

export default Products;
