import { supabase } from "@/integrations/supabase/client";

export const getActiveLicenseId = async () => {
  const { data, error } = await (supabase.rpc as any)("current_license_id");
  if (error) throw error;
  return data as string | null;
};
