import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { KeyRound, Plus, Trash2, Copy, Ban, RotateCcw, Smartphone, CalendarPlus } from "lucide-react";
import { format } from "date-fns";

interface License {
  id: string;
  key_value: string;
  client_name: string;
  role: "admin" | "staff";
  device_limit: number;
  expires_at: string | null;
  revoked: boolean;
  notes: string | null;
  created_at: string;
}
interface DeviceRow {
  id: string;
  license_id: string;
  device_id: string;
  device_label: string | null;
  last_seen_at: string;
}

const Licenses = () => {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    client_name: "",
    role: "staff" as "admin" | "staff",
    device_limit: 1,
    expires_in_days: 365,
    notes: "",
  });
  const [showDevicesFor, setShowDevicesFor] = useState<License | null>(null);
  const [renewFor, setRenewFor] = useState<License | null>(null);
  const [renewDays, setRenewDays] = useState(365);
  const [renewBusy, setRenewBusy] = useState(false);

  const renew = async () => {
    if (!renewFor) return;
    const days = Math.max(1, renewDays | 0);
    // Extend from current expiry if still in the future, otherwise from now.
    const base = renewFor.expires_at && new Date(renewFor.expires_at) > new Date()
      ? new Date(renewFor.expires_at)
      : new Date();
    const newExpiry = new Date(base.getTime() + days * 86400_000).toISOString();
    setRenewBusy(true);
    try {
      const { error } = await supabase.from("license_keys")
        .update({ expires_at: newExpiry, revoked: false })
        .eq("id", renewFor.id);
      if (error) throw error;
      toast.success(`Renewed — valid until ${format(new Date(newExpiry), "PP")}. All data preserved.`);
      setRenewFor(null);
      setRenewDays(365);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setRenewBusy(false); }
  };

  useEffect(() => { document.title = "Licenses · SGH POS"; load(); }, []);

  const load = async () => {
    const [{ data: l }, { data: d }] = await Promise.all([
      supabase.from("license_keys").select("*").order("created_at", { ascending: false }),
      supabase.from("license_devices").select("*").order("last_seen_at", { ascending: false }),
    ]);
    setLicenses((l ?? []) as License[]);
    setDevices((d ?? []) as DeviceRow[]);
  };

  const generate = async () => {
    if (!form.client_name.trim()) return toast.error("Client name required");
    setBusy(true);
    try {
      // generate key value via DB function
      const { data: keyData, error: keyErr } = await supabase.rpc("generate_license_key");
      if (keyErr) throw keyErr;
      const key_value = keyData as string;
      const expires_at = form.expires_in_days > 0
        ? new Date(Date.now() + form.expires_in_days * 86400_000).toISOString()
        : null;
      const { error } = await supabase.from("license_keys").insert({
        key_value,
        client_name: form.client_name.trim(),
        role: form.role,
        device_limit: form.device_limit,
        expires_at,
        notes: form.notes.trim() || null,
      });
      if (error) throw error;
      toast.success("License key generated");
      setOpen(false);
      setForm({ client_name: "", role: "staff", device_limit: 1, expires_in_days: 365, notes: "" });
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const toggleRevoke = async (lic: License) => {
    const { error } = await supabase.from("license_keys")
      .update({ revoked: !lic.revoked }).eq("id", lic.id);
    if (error) return toast.error(error.message);
    toast.success(lic.revoked ? "License re-enabled" : "License revoked");
    load();
  };

  const remove = async (lic: License) => {
    if (!confirm(`Delete license for ${lic.client_name}? This frees all its devices.`)) return;
    const { error } = await supabase.from("license_keys").delete().eq("id", lic.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  const freeDevice = async (d: DeviceRow) => {
    if (!confirm("Remove this device? The user will need to re-enter the key.")) return;
    const { error } = await supabase.from("license_devices").delete().eq("id", d.id);
    if (error) return toast.error(error.message);
    toast.success("Device removed");
    load();
  };

  const copy = (txt: string) => { navigator.clipboard.writeText(txt); toast.success("Copied"); };

  const isExpired = (l: License) => l.expires_at && new Date(l.expires_at) < new Date();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <KeyRound className="h-7 w-7 text-primary" /> License Keys
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Generate and manage access keys for clients.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Generate Key</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Generate new license key</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Client / business name</Label>
                <Input value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Role</Label>
                  <Select value={form.role} onValueChange={(v: "admin" | "staff") => setForm({ ...form, role: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="staff">Staff (POS only)</SelectItem>
                      <SelectItem value="admin">Admin (full access)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Device limit</Label>
                  <Input type="number" min={1} max={50} value={form.device_limit}
                    onChange={e => setForm({ ...form, device_limit: parseInt(e.target.value) || 1 })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Expires in (days, 0 = never)</Label>
                <Input type="number" min={0} value={form.expires_in_days}
                  onChange={e => setForm({ ...form, expires_in_days: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1">
                <Label>Notes (optional)</Label>
                <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={generate} disabled={busy}>{busy ? "Generating..." : "Generate"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>All licenses ({licenses.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0 sm:p-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Devices</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {licenses.map(l => {
                const used = devices.filter(d => d.license_id === l.id).length;
                return (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.client_name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <code className="text-xs font-mono">{l.key_value}</code>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copy(l.key_value)}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant={l.role === "admin" ? "default" : "secondary"}>{l.role}</Badge></TableCell>
                    <TableCell>
                      <button className="hover:underline" onClick={() => setShowDevicesFor(l)}>
                        {used} / {l.device_limit}
                      </button>
                    </TableCell>
                    <TableCell className="text-xs">
                      {l.expires_at ? format(new Date(l.expires_at), "PP") : "Never"}
                    </TableCell>
                    <TableCell>
                      {l.revoked ? <Badge variant="destructive">Revoked</Badge>
                        : isExpired(l) ? <Badge variant="destructive">Expired</Badge>
                        : <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">Active</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => { setRenewFor(l); setRenewDays(365); }} title="Renew / extend">
                        <CalendarPlus className="h-4 w-4 text-primary" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => toggleRevoke(l)} title={l.revoked ? "Re-enable" : "Revoke"}>
                        {l.revoked ? <RotateCcw className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(l)} title="Delete">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {licenses.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No licenses yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!showDevicesFor} onOpenChange={(o) => !o && setShowDevicesFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5" /> Devices — {showDevicesFor?.client_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {devices.filter(d => d.license_id === showDevicesFor?.id).map(d => (
              <div key={d.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium text-sm">{d.device_label || "Unknown device"}</p>
                  <p className="text-xs text-muted-foreground">Last seen {format(new Date(d.last_seen_at), "PPp")}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => freeDevice(d)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
            {devices.filter(d => d.license_id === showDevicesFor?.id).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No devices activated yet</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renewFor} onOpenChange={(o) => !o && setRenewFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-primary" /> Renew license — {renewFor?.client_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg bg-muted/50 p-3 space-y-1">
              <p><span className="text-muted-foreground">Current expiry:</span>{" "}
                <span className="font-medium">
                  {renewFor?.expires_at ? format(new Date(renewFor.expires_at), "PP") : "Never"}
                </span>
              </p>
              {renewFor?.expires_at && (
                <p className="text-xs text-muted-foreground">
                  {new Date(renewFor.expires_at) > new Date()
                    ? "Extension will be added on top of the current expiry."
                    : "License has expired — new period starts today."}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Extend by (days)</Label>
              <Input type="number" min={1} value={renewDays}
                onChange={e => setRenewDays(parseInt(e.target.value) || 0)} />
              <div className="flex gap-2 pt-1 flex-wrap">
                {[30, 90, 180, 365, 730].map(d => (
                  <Button key={d} size="sm" variant="outline" onClick={() => setRenewDays(d)}>
                    {d >= 365 ? `${d / 365}y` : `${d}d`}
                  </Button>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              The same license key, devices, products, sales and quotations are kept — nothing is lost.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenewFor(null)}>Cancel</Button>
            <Button onClick={renew} disabled={renewBusy || renewDays < 1}>
              {renewBusy ? "Renewing..." : "Renew license"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Licenses;
