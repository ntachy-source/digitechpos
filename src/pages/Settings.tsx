import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Building2, Upload, Image as ImageIcon, Palette, Check } from "lucide-react";
import { ACCENTS, applyAccent, getStoredAccent } from "@/lib/accent";
import { getActiveLicenseId } from "@/lib/license";

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
  const [accent, setAccent] = useState<string>(getStoredAccent());

  const pickAccent = (id: string) => { setAccent(id); applyAccent(id); toast.success("Accent colour updated"); };


  useEffect(() => { document.title = "Settings · Smart Mpofu Technologies"; load(); }, []);

  const load = async () => {
    const licenseId = await getActiveLicenseId();
    if (!licenseId) return;
    const { data, error } = await supabase.from("business_settings").select("*").eq("license_id", licenseId).maybeSingle();
    if (error) return toast.error(error.message);
    if (data) { setS(data as Settings); return; }
    const { data: created, error: createError } = await supabase.from("business_settings").insert({
      business_name: "Smart Mpofu Technologies",
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
        <CardHeader><CardTitle className="flex items-center gap-2"><Palette className="h-5 w-5" /> Accent colour</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">Pick the highlight colour used across buttons, links and menus.</p>
          <div className="flex flex-wrap gap-3">
            {ACCENTS.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => pickAccent(a.id)}
                aria-label={a.label}
                title={a.label}
                className={`h-10 w-10 rounded-full border-2 grid place-items-center transition ${accent === a.id ? "border-foreground scale-105" : "border-transparent"}`}
                style={{ backgroundColor: a.swatch }}
              >
                {accent === a.id && <Check className="h-4 w-4 text-white" />}
              </button>
            ))}
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

    </div>
  );
};

export default Settings;
