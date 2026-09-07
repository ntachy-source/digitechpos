import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { KeyRound, ShieldCheck } from "lucide-react";
import { getDeviceId, getDeviceLabel } from "@/lib/device";

const Auth = () => {
  const [licenseKey, setLicenseKey] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    document.title = "Activate License · MPOFU Technologies";
  }, []);

  useEffect(() => {
    if (!loading && user) navigate("/dashboard", { replace: true });
  }, [user, loading, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = licenseKey.trim().toUpperCase();
    if (!key) {
      toast.error("Enter your license key");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("activate-license", {
        body: {
          key,
          device_id: getDeviceId(),
          device_label: getDeviceLabel(),
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const { email, password, client_name } = data as { email: string; password: string; client_name: string };
      const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signErr) throw signErr;
      toast.success(`Welcome, ${client_name}!`);
      navigate("/dashboard", { replace: true });

    } catch (err: any) {
      const msg = err?.message ?? "Activation failed";
      if (/expired/i.test(msg)) {
        toast.error("License expired", {
          description: "Ask your administrator to renew this key — all your products, sales and quotations will be preserved.",
          duration: 8000,
        });
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-subtle p-4">
      <Card className="w-full max-w-md shadow-elegant border-border/60">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-card">
            <ShieldCheck className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">MPOFU Technologies</CardTitle>
          <CardDescription>Enter your license key to activate this device</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="license" className="flex items-center gap-2">
                <KeyRound className="h-4 w-4" /> License Key
              </Label>
              <Input
                id="license"
                type="text"
                required
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                placeholder="SGH-XXXX-XXXX-XXXX-XXXX"
                className="font-mono text-center tracking-wider"
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Activating..." : "Activate"}
            </Button>
            <p className="text-xs text-muted-foreground text-center pt-2">
              Don't have a key? Contact your administrator.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
