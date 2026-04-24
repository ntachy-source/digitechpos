// Activate a license key — provisions a hidden auth account for this device
// and returns credentials the client uses to sign in. Replaces username/password.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  key?: string;
  device_id?: string;
  device_label?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body: Body = await req.json();
    const key = (body.key ?? "").trim().toUpperCase();
    const deviceId = (body.device_id ?? "").trim();
    const deviceLabel = (body.device_label ?? "").slice(0, 80) || null;

    if (!key || !deviceId) {
      return json({ error: "Missing key or device id" }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    // 1. Validate the license key (do not consume slot yet)
    const { data: lic, error: licErr } = await admin
      .from("license_keys")
      .select("id, role, client_name, expires_at, revoked, device_limit")
      .eq("key_value", key)
      .maybeSingle();

    if (licErr) return json({ error: licErr.message }, 500);
    if (!lic) return json({ error: "Invalid license key" }, 404);
    if (lic.revoked) return json({ error: "This license has been revoked" }, 403);
    if (lic.expires_at && new Date(lic.expires_at) < new Date()) {
      return json({ error: "This license has expired" }, 403);
    }

    // 2. Check existing device record
    const { data: existing } = await admin
      .from("license_devices")
      .select("id, user_id")
      .eq("license_id", lic.id)
      .eq("device_id", deviceId)
      .maybeSingle();

    let userId = existing?.user_id ?? null;

    // 3. If new device, enforce limit
    if (!existing) {
      const { count } = await admin
        .from("license_devices")
        .select("id", { count: "exact", head: true })
        .eq("license_id", lic.id);
      if ((count ?? 0) >= lic.device_limit) {
        return json({ error: "Device limit reached for this license" }, 403);
      }
    }

    // 4. Provision (or reuse) a hidden auth user for this device
    const email = `dev-${deviceId.slice(0, 16)}-${lic.id.slice(0, 8)}@sgh.local`;
    const password = `${lic.id}.${deviceId}`; // deterministic; never exposed

    if (!userId) {
      // try create
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { license_id: lic.id, device_id: deviceId, client_name: lic.client_name },
      });
      if (cErr && !/already/i.test(cErr.message)) {
        return json({ error: cErr.message }, 500);
      }
      userId = created?.user?.id ?? null;
      if (!userId) {
        // fetch existing by email
        const { data: list } = await admin.auth.admin.listUsers();
        userId = list.users.find((u) => u.email === email)?.id ?? null;
      }
      if (!userId) return json({ error: "Could not provision device account" }, 500);
    } else {
      // make sure password matches expectation (rotate if needed)
      await admin.auth.admin.updateUserById(userId, { password });
    }

    // 5. Upsert device record
    if (existing) {
      await admin.from("license_devices").update({
        user_id: userId,
        last_seen_at: new Date().toISOString(),
        device_label: deviceLabel ?? undefined,
      }).eq("id", existing.id);
    } else {
      await admin.from("license_devices").insert({
        license_id: lic.id,
        device_id: deviceId,
        user_id: userId,
        device_label: deviceLabel,
      });
    }

    // 6. Ensure profile + role
    await admin.from("profiles").upsert({
      id: userId,
      full_name: lic.client_name,
      email,
    });
    await admin.from("user_roles").delete().eq("user_id", userId);
    await admin.from("user_roles").insert({ user_id: userId, role: lic.role });

    // 7. Return credentials so the client signs in
    return json({
      email,
      password,
      role: lic.role,
      client_name: lic.client_name,
      expires_at: lic.expires_at,
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
