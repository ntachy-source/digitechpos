import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Building2, Upload, Image as ImageIcon, Printer, Plug, Usb } from "lucide-react";
import { getActiveLicenseId } from "@/lib/license";
import { forgetPrinter, getPairedPrinterInfo, isWebUsbSupported, pickPrinter, printViaUsb, buildEscPos, getPairedPrinter } from "@/lib/printer";

interface Settings {
  id: string;
  business_name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  tax_id: string | null;
  logo_url: string | null;
  invoice_footer: string | null;
}

const Settings = () => {
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pairedName, setPairedName] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const webUsb = isWebUsbSupported();

  useEffect(() => {
    const info = getPairedPrinterInfo();
    setPairedName(info?.name ?? null);
  }, []);

  const connectPrinter = async () => {
    try {
      const d = await pickPrinter();
      setPairedName(d.productName || "Printer");
      toast.success(`Connected: ${d.productName || "Printer"}`);
    } catch (e: any) {
      if (e?.name === "NotFoundError") return;
      toast.error(e?.message || "Failed to connect");
    }
  };

  const disconnectPrinter = () => { forgetPrinter(); setPairedName(null); toast.success("Printer disconnected"); };

  const testPrint = async () => {
    setTesting(true);
    try {
      let d = await getPairedPrinter();
      if (!d) d = await pickPrinter();
      await printViaUsb(d, buildEscPos({
        businessName: s?.business_name,
        saleId: "TEST" + Date.now().toString(36),
        createdAt: new Date().toISOString(),
        items: [{ brand: "Test", model: "Print", imei_serial: "TEST-0001", sale_price: 0 }],
        total: 0,
        footer: "Printer test successful",
      }));
      setPairedName(d.productName || "Printer");
      toast.success("Test sent to printer");
    } catch (e: any) {
      toast.error(e?.message || "Test print failed");
    } finally { setTesting(false); }
  };

  useEffect(() => { document.title = "Settings · SGH POS"; load(); }, []);

  const load = async () => {
    const licenseId = await getActiveLicenseId();
    if (!licenseId) return;
    const { data, error } = await supabase.from("business_settings").select("*").eq("license_id", licenseId).maybeSingle();
    if (error) return toast.error(error.message);
    if (data) { setS(data as Settings); return; }
    const { data: created, error: createError } = await supabase.from("business_settings").insert({
      business_name: "SGH Gadget Store",
      license_id: licenseId,
    } as any).select("*").single();
    if (createError) return toast.error(createError.message);
    setS(created as Settings);
  };

  const save = async () => {
    if (!s) return;
    setBusy(true);
    const { error } = await supabase.from("business_settings").update({
      business_name: s.business_name,
      address: s.address,
      phone: s.phone,
      email: s.email,
      tax_id: s.tax_id,
      invoice_footer: s.invoice_footer,
    }).eq("id", s.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Saved");
  };

  const onLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !s) return;
    if (file.size > 2 * 1024 * 1024) return toast.error("Logo must be under 2MB");
    setUploading(true);
    const licenseId = await getActiveLicenseId();
    if (!licenseId) { setUploading(false); return toast.error("No active license found"); }
    const path = `license-${licenseId}/invoice-logo-${Date.now()}.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
    if (error) { setUploading(false); return toast.error(error.message); }
    const { data: { publicUrl } } = supabase.storage.from("logos").getPublicUrl(path);
    await supabase.from("business_settings").update({ logo_url: publicUrl }).eq("id", s.id);
    setUploading(false);
    toast.success("Logo updated");
    load();
  };

  if (!s) return <div className="h-40 grid place-items-center text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <Building2 className="h-7 w-7 text-primary" /> Business Settings
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">These details appear on every invoice.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ImageIcon className="h-5 w-5" /> Logo</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="h-24 w-24 rounded-lg border bg-muted flex items-center justify-center overflow-hidden">
              {s.logo_url ? <img src={s.logo_url} alt="Business logo" className="object-contain h-full w-full" />
                : <ImageIcon className="h-8 w-8 text-muted-foreground" />}
            </div>
            <div>
              <Label htmlFor="logo" className="cursor-pointer inline-flex items-center gap-2 text-sm bg-secondary px-3 py-2 rounded-md">
                <Upload className="h-4 w-4" /> {uploading ? "Uploading..." : "Upload logo"}
              </Label>
              <input id="logo" type="file" accept="image/*" className="hidden" onChange={onLogo} disabled={uploading} />
              <p className="text-xs text-muted-foreground mt-2">PNG/JPG, max 2MB. Recommended square.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Business details</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Business name</Label>
            <Input value={s.business_name} onChange={e => setS({ ...s, business_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input value={s.phone ?? ""} onChange={e => setS({ ...s, phone: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={s.email ?? ""} onChange={e => setS({ ...s, email: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Address</Label>
            <Textarea rows={2} value={s.address ?? ""} onChange={e => setS({ ...s, address: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Tax / VAT ID</Label>
            <Input value={s.tax_id ?? ""} onChange={e => setS({ ...s, tax_id: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Invoice footer / payment terms</Label>
            <Textarea rows={3} value={s.invoice_footer ?? ""} onChange={e => setS({ ...s, invoice_footer: e.target.value })}
              placeholder="Thank you for your business." />
          </div>
          <Button onClick={save} disabled={busy}>{busy ? "Saving..." : "Save changes"}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Printer className="h-5 w-5" /> Receipt Printer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg border bg-secondary/30">
            <div className="flex items-center gap-2">
              <Usb className="h-4 w-4 text-primary" />
              <div>
                <div className="text-sm font-medium">{pairedName ? pairedName : "No printer connected"}</div>
                <div className="text-xs text-muted-foreground">
                  {pairedName ? "Ready to print receipts directly." : "Connect a USB thermal printer (ESC/POS)."}
                </div>
              </div>
            </div>
            {pairedName && <span className="h-2 w-2 rounded-full bg-green-500" />}
          </div>

          {webUsb ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={connectPrinter} variant="outline">
                <Plug className="h-4 w-4 mr-2" /> {pairedName ? "Change Printer" : "Connect Printer"}
              </Button>
              {pairedName && (
                <>
                  <Button onClick={testPrint} disabled={testing}>
                    <Printer className="h-4 w-4 mr-2" /> {testing ? "Printing..." : "Test Print"}
                  </Button>
                  <Button onClick={disconnectPrinter} variant="ghost">Disconnect</Button>
                </>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Direct USB printer connection requires Google Chrome or Microsoft Edge on desktop or Android. On other browsers,
              receipts can still be printed via the system print dialog from the receipt window.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Supports most 58mm/80mm thermal receipt printers (Epson, Star, Bixolon, Citizen, generic ESC/POS).
            The browser remembers your printer after the first connection.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
