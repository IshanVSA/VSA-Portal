import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;
const KNOWN_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1eW9zc2dxdWl5dW9xYmVlbnJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNjMwODksImV4cCI6MjA4NjgzOTA4OX0.EGwUbBiZSLKFyZEKUDPIF9xm41t1QRjOcQ6_v4lxgs0";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth: CRON_SECRET, anon key (from pg_cron), or admin user
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const isCronCall =
      (CRON_SECRET && token === CRON_SECRET) || token === KNOWN_ANON_KEY;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (!isCronCall) {
      if (!token) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const supabaseAuth = createClient(
        SUPABASE_URL,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await supabaseAuth.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!roleData || !["admin", "concierge"].includes(roleData.role)) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Find connected clinics
    const { data: creds } = await supabase
      .from("clinic_api_credentials")
      .select("clinic_id, meta_page_id, meta_page_access_token");

    const connected = (creds || []).filter(
      (c) => c.meta_page_id && c.meta_page_access_token
    );

    console.log(`Meta cron: syncing ${connected.length} connected clinics`);

    const results: any[] = [];
    for (const c of connected) {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/sync-meta-analytics`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-cron-secret": CRON_SECRET,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ clinic_id: c.clinic_id }),
          }
        );
        const j = await res.json().catch(() => ({}));
        results.push({
          clinic_id: c.clinic_id,
          status: res.ok ? "ok" : "error",
          detail: res.ok ? j.synced : j.error,
        });
      } catch (e: any) {
        results.push({
          clinic_id: c.clinic_id,
          status: "error",
          detail: String(e?.message || e),
        });
      }
    }

    console.log("Meta cron complete:", JSON.stringify(results));
    return new Response(
      JSON.stringify({ processed: connected.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Meta cron unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
