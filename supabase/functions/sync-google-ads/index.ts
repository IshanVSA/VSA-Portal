import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  const combined = Uint8Array.from(atob(encryptedText.slice(4)), c => c.charCodeAt(0));
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (!roleData || !["admin", "concierge"].includes(roleData.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { clinic_id } = await req.json();
    if (!clinic_id) {
      return new Response(JSON.stringify({ error: "clinic_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get credentials
    const { data: creds } = await supabase
      .from("clinic_api_credentials")
      .select("google_ads_refresh_token, google_ads_customer_id, google_ads_login_customer_id")
      .eq("clinic_id", clinic_id)
      .maybeSingle();

    if (!creds?.google_ads_refresh_token || !creds?.google_ads_customer_id) {
      return new Response(JSON.stringify({ error: "Google Ads credentials not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Exchange refresh token for access token
    const decryptedRefreshToken = await decryptToken(creds.google_ads_refresh_token);
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
      console.error("Token refresh error:", tokenData.error);
      return new Response(JSON.stringify({ error: "Failed to refresh access token" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = tokenData.access_token;
    const customerId = creds.google_ads_customer_id.replace(/-/g, "");
    const loginCustomerId = (creds.google_ads_login_customer_id || creds.google_ads_customer_id).replace(/-/g, "");

    // Query Google Ads API
    const gaqlQuery = `
      SELECT campaign.name, metrics.clicks, metrics.impressions,
             metrics.cost_micros, metrics.conversions,
             segments.date
      FROM campaign
      WHERE segments.date DURING LAST_30_DAYS
    `;

    const searchRes = await fetch(
      `https://googleads.googleapis.com/v23/customers/${customerId}/googleAds:searchStream`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN,
          "login-customer-id": loginCustomerId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: gaqlQuery }),
      }
    );

    const rawText = await searchRes.text();
    console.log(`searchStream response: ${rawText.length} bytes`);

    // Parse newline-delimited JSON (same pattern as google-oauth)
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
    console.log(`Parsed ${batches.length} batches`);

    // Check for API error in first batch
    if (batches.length > 0 && batches[0].error) {
      console.error("Google Ads search error:", JSON.stringify(batches[0].error));
      return new Response(JSON.stringify({ error: "Google Ads API error: " + (batches[0].error.message || "Unknown") }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Aggregate results
    let totalClicks = 0;
    let totalImpressions = 0;
    let totalCostMicros = 0;
    let totalConversions = 0;
    const dailyMap: Record<string, { clicks: number; impressions: number; cost_micros: number; conversions: number }> = {};
    const campaignMap: Record<string, { clicks: number; impressions: number; cost_micros: number; conversions: number }> = {};

    for (const batch of batches) {
      const results = batch.results || [];
      for (const row of results) {
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

    // Insert analytics
    const { error: insertError } = await supabase.from("analytics").insert({
      clinic_id,
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

    if (insertError) console.error("Analytics insert error:", insertError);

    // Update last sync timestamp
    const { error: syncUpdateError } = await supabase
      .from("clinic_api_credentials")
      .update({ last_google_sync_at: new Date().toISOString() })
      .eq("clinic_id", clinic_id);
    if (syncUpdateError) console.error("Failed to update last_google_sync_at:", syncUpdateError);
    else console.log("Updated last_google_sync_at for clinic", clinic_id);

    return new Response(
      JSON.stringify({ success: true, clicks: totalClicks, impressions: totalImpressions }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("sync-google-ads error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
