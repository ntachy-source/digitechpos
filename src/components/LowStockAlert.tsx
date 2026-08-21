import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, PackageCheck } from "lucide-react";
import { useLowStock } from "@/hooks/useLowStock";

export const LowStockAlert = () => {
  const { items, loading, threshold, updateThreshold } = useLowStock();

  return (
    <Card className="border-border/60 shadow-card">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className={`h-4 w-4 ${items.length ? "text-warning" : "text-muted-foreground"}`} />
          Low Stock Alerts
          {items.length > 0 && <Badge variant="destructive">{items.length}</Badge>}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Label htmlFor="lowStock" className="text-xs text-muted-foreground whitespace-nowrap">Alert at or below</Label>
          <Input
            id="lowStock"
            type="number"
            min={1}
            value={threshold}
            onChange={(e) => updateThreshold(Number(e.target.value) || 1)}
            className="h-8 w-20"
          />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Checking stock…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <PackageCheck className="h-4 w-4 text-success" /> All products are above the low-stock threshold.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {items.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.brand} {p.model}</p>
                  <p className="text-xs text-muted-foreground truncate">{p.category} · {p.imei_serial}</p>
                </div>
                <Badge variant={p.quantity <= 1 ? "destructive" : "secondary"} className="shrink-0">
                  {p.quantity} left
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
