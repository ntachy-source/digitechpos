import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getActiveLicenseId } from "@/lib/license";

export const useBusinessName = () => {
  const [name, setName] = useState<string>("MPOFU Technologies");
  const [tagline, setTagline] = useState<string>("Gadget Store");

  const load = async () => {
    try {
      const licenseId = await getActiveLicenseId();
      if (!licenseId) return;
      const { data } = await supabase
        .from("business_settings")
        .select("business_name")
        .eq("license_id", licenseId)
        .maybeSingle();
      if (data?.business_name) {
        setName(data.business_name);
        setTagline("Point of Sale");
      }
    } catch {}
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`business_settings_branding_${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "business_settings" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { name, tagline, reload: load };
};
