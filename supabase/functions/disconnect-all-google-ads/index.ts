import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logSecurityEvent } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabaseAuth = createClient(SUPABASE_URL, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (roleData?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: affected, error: countError } = await supabase
      .from("clinic_api_credentials")
      .select("clinic_id")
      .not("google_ads_refresh_token", "is", null);

    if (countError) {
      console.error("Count query failed:", countError);
    }

    const { error: updateError } = await supabase
      .from("clinic_api_credentials")
      .update({
        google_ads_refresh_token: null,
        google_ads_customer_id: null,
        google_ads_login_customer_id: null,
        google_ads_account_name: null,
        last_google_sync_at: null,
      })
      .not("clinic_id", "is", null);

    if (updateError) {
      console.error("Bulk disconnect failed:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to disconnect", details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Also clear any pending OAuth tokens
    await supabase.from("oauth_temp_tokens").delete().in("provider", ["google_ads", "ga4"]);

    await logSecurityEvent(req, {
      action: "google_ads.bulk_disconnect",
      actor_user_id: user.id,
      metadata: { affected_clinics: affected?.length ?? 0 },
    });

    return new Response(
      JSON.stringify({ success: true, affected: affected?.length ?? 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("disconnect-all-google-ads error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
