import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY")!;

async function decryptToken(encryptedText: string): Promise<string> {
  if (!encryptedText || !encryptedText.startsWith("enc:")) return encryptedText;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const keyHash = await crypto.subtle.digest("SHA-256", encoder.encode(ENCRYPTION_KEY));
  const key = await crypto.subtle.importKey("raw", keyHash, "AES-GCM", false, ["decrypt"]);
  const combined = Uint8Array.from(atob(encryptedText.slice(4)), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return decoder.decode(decrypted);
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const GOOGLE_ADS_DEVELOPER_TOKEN = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN")!;

async function syncClinic(
  supabase: ReturnType<typeof createClient>,
  clinicId: string,
  clinicName: string,
  refreshToken: string,
  customerId: string,
  loginCustomerId: string
): Promise<{ clinic: string; status: string; error?: string }> {
  try {
    const decryptedRefreshToken = await decryptToken(refreshToken);

    // Refresh access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: decryptedRefreshToken,
        grant_type: "refresh_token",
      }),
    });
    const tokenData = await tokenRes.json();
    if (tokenData.error) {
      console.error(`Token refresh failed for ${clinicName}:`, tokenData.error);
      return { clinic: clinicName, status: "token_error", error: tokenData.error };
    }

    const accessToken = tokenData.access_token;
    const cid = customerId.replace(/-/g, "");
    const lcid = (loginCustomerId || customerId).replace(/-/g, "");

    // Query Google Ads API
    const gaqlQuery = `
      SELECT campaign.name, metrics.clicks, metrics.impressions,
             metrics.cost_micros, metrics.conversions,
             segments.date
      FROM campaign
      WHERE segments.date DURING LAST_30_DAYS
    `;

    const searchRes = await fetch(
      `https://googleads.googleapis.com/v23/customers/${cid}/googleAds:searchStream`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN,
          "login-customer-id": lcid,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: gaqlQuery }),
      }
    );

    const rawText = await searchRes.text();

    const parseSearchStream = (raw: string): any[] => {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return raw
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .flatMap((line) => {
            try {
              const parsed = JSON.parse(line);
              return Array.isArray(parsed) ? parsed : [parsed];
            } catch {
              return [];
            }
          });
      }
    };

    const batches = parseSearchStream(rawText);

    if (batches.length > 0 && batches[0].error) {
      console.error(`Google Ads API error for ${clinicName}:`, batches[0].error.message);
      return { clinic: clinicName, status: "api_error", error: batches[0].error.message };
    }

    // Aggregate
    let totalClicks = 0;
    let totalImpressions = 0;
    let totalCostMicros = 0;
    let totalConversions = 0;
    const dailyMap: Record<string, { clicks: number; impressions: number; cost_micros: number; conversions: number }> = {};
    const campaignMap: Record<string, { clicks: number; impressions: number; cost_micros: number; conversions: number }> = {};

    for (const batch of batches) {
      for (const row of batch.results || []) {
        const clicks = parseInt(row.metrics?.clicks || "0");
        const impressions = parseInt(row.metrics?.impressions || "0");
        const costMicros = parseInt(row.metrics?.costMicros || "0");
        const conversions = parseFloat(row.metrics?.conversions || "0");
        const date = row.segments?.date || "unknown";
        const campaignName = row.campaign?.name || "Unknown Campaign";

        totalClicks += clicks;
        totalImpressions += impressions;
        totalCostMicros += costMicros;
        totalConversions += conversions;

        if (!dailyMap[date]) dailyMap[date] = { clicks: 0, impressions: 0, cost_micros: 0, conversions: 0 };
        dailyMap[date].clicks += clicks;
        dailyMap[date].impressions += impressions;
        dailyMap[date].cost_micros += costMicros;
        dailyMap[date].conversions += conversions;

        if (!campaignMap[campaignName]) campaignMap[campaignName] = { clicks: 0, impressions: 0, cost_micros: 0, conversions: 0 };
        campaignMap[campaignName].clicks += clicks;
        campaignMap[campaignName].impressions += impressions;
        campaignMap[campaignName].cost_micros += costMicros;
        campaignMap[campaignName].conversions += conversions;
      }
    }

    const dailyTrends = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        clicks: data.clicks,
        impressions: data.impressions,
        cost: data.cost_micros / 1_000_000,
        conversions: data.conversions,
      }));

    const campaigns = Object.entries(campaignMap).map(([name, data]) => ({
      name,
      clicks: data.clicks,
      impressions: data.impressions,
      cost: data.cost_micros / 1_000_000,
      conversions: data.conversions,
    }));

    const today = new Date().toISOString().slice(0, 10);

    const { error: insertError } = await supabase.from("analytics").insert({
      clinic_id: clinicId,
      platform: "google_ads",
      metric_type: "monthly_summary",
      date: today,
      value: totalClicks,
      metrics_json: {
        clicks: totalClicks,
        impressions: totalImpressions,
        cost: totalCostMicros / 1_000_000,
        conversions: totalConversions,
        daily_trends: dailyTrends,
        campaigns,
      },
    });

    if (insertError) {
      console.error(`Insert error for ${clinicName}:`, insertError);
      return { clinic: clinicName, status: "insert_error", error: insertError.message };
    }

    // Update last sync timestamp
    await supabase
      .from("clinic_api_credentials")
      .update({ last_google_sync_at: new Date().toISOString() })
      .eq("clinic_id", clinicId);

    console.log(`Synced ${clinicName}: ${totalClicks} clicks, ${totalImpressions} impressions`);
    return { clinic: clinicName, status: "ok" };
  } catch (err) {
    console.error(`Unexpected error for ${clinicName}:`, err);
    return { clinic: clinicName, status: "error", error: String(err) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate CRON_SECRET or admin role
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const cronSecret = Deno.env.get("CRON_SECRET");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    const isCronCall = (cronSecret && token === cronSecret) || (anonKey && token === anonKey);

    if (!isCronCall) {
      const supabaseAuth = createClient(SUPABASE_URL, token, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const supabaseCheck = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: roleData } = await supabaseCheck
        .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      if (roleData?.role !== "admin") {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get all clinics with Google Ads credentials configured
    const { data: creds, error: credsErr } = await supabase
      .from("clinic_api_credentials")
      .select("clinic_id, google_ads_refresh_token, google_ads_customer_id, google_ads_login_customer_id");

    if (credsErr) {
      console.error("Failed to fetch credentials:", credsErr);
      return new Response(JSON.stringify({ error: "Failed to fetch credentials" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const connectedClinics = (creds || []).filter(
      (c) => c.google_ads_refresh_token && c.google_ads_customer_id
    );

    console.log(`Google Ads cron: found ${connectedClinics.length} connected clinics`);

    if (connectedClinics.length === 0) {
      return new Response(JSON.stringify({ processed: 0, results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get clinic names for logging
    const clinicIds = connectedClinics.map((c) => c.clinic_id);
    const { data: clinicRows } = await supabase
      .from("clinics")
      .select("id, clinic_name")
      .in("id", clinicIds);

    const clinicNameMap: Record<string, string> = {};
    for (const c of clinicRows || []) {
      clinicNameMap[c.id] = c.clinic_name;
    }

    const results = [];
    for (const cred of connectedClinics) {
      const result = await syncClinic(
        supabase,
        cred.clinic_id,
        clinicNameMap[cred.clinic_id] || cred.clinic_id,
        cred.google_ads_refresh_token!,
        cred.google_ads_customer_id!,
        cred.google_ads_login_customer_id || cred.google_ads_customer_id!
      );
      results.push(result);
    }

    console.log("Google Ads cron complete:", JSON.stringify(results));
    return new Response(
      JSON.stringify({ processed: connectedClinics.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Google Ads cron unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
