import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const GOOGLE_ADS_DEVELOPER_TOKEN = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN")!;

const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/google-oauth?action=callback`;
const FRONTEND_URL = Deno.env.get("SITE_URL") || "https://portal.vsavetmedia.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    // ── AUTHORIZE ──
    if (action === "authorize") {
      const clinicId = url.searchParams.get("clinic_id");
      const originUrl = url.searchParams.get("origin") || FRONTEND_URL;
      if (!clinicId) {
        return new Response(JSON.stringify({ error: "clinic_id is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const state = btoa(JSON.stringify({ clinic_id: clinicId, origin: originUrl }));
      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent("https://www.googleapis.com/auth/adwords")}` +
        `&access_type=offline` +
        `&prompt=consent` +
        `&state=${encodeURIComponent(state)}`;

      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: authUrl },
      });
    }

    // ── CALLBACK ──
    if (action === "callback") {
      const code = url.searchParams.get("code");
      const stateParam = url.searchParams.get("state");
      const errorParam = url.searchParams.get("error");

      if (errorParam) {
        console.error("Google OAuth error:", errorParam);
        const fallbackUrl = stateParam
          ? JSON.parse(atob(stateParam)).origin || FRONTEND_URL
          : FRONTEND_URL;
        return new Response(null, {
          status: 302,
          headers: { Location: `${fallbackUrl}/clinics?error=oauth_denied` },
        });
      }

      if (!code || !stateParam) {
        return new Response(JSON.stringify({ error: "Missing code or state" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { clinic_id, origin, provider } = JSON.parse(atob(stateParam));
      const redirectBase = origin || FRONTEND_URL;

      // Exchange code for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code",
        }),
      });
      const tokenData = await tokenRes.json();
      if (tokenData.error) {
        console.error("Token exchange error:", tokenData.error);
        return new Response(null, {
          status: 302,
          headers: { Location: `${redirectBase}/clinics/${clinic_id}?error=token_exchange` },
        });
      }

      const accessToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token;

      if (!refreshToken) {
        console.error("No refresh token received");
        return new Response(null, {
          status: 302,
          headers: { Location: `${redirectBase}/clinics/${clinic_id}?error=no_refresh_token` },
        });
      }


      if (provider === "ga4") {
        const sumRes = await fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const sumText = await sumRes.text();
        if (!sumRes.ok) {
          console.error("GA4 accountSummaries failed:", sumRes.status, sumText.substring(0, 500));
          return new Response(null, {
            status: 302,
            headers: { Location: `${redirectBase}/clinics/${clinic_id}?error=list_properties` },
          });
        }

        let sumData: any;
        try {
          sumData = JSON.parse(sumText);
        } catch {
          return new Response(null, {
            status: 302,
            headers: { Location: `${redirectBase}/clinics/${clinic_id}?error=list_properties` },
          });
        }

        const properties: Array<{ property: string; property_id: string; display_name: string; account_name: string }> = [];
        for (const account of sumData.accountSummaries || []) {
          const accountName = account.displayName || account.account || "GA4 Account";
          for (const property of account.propertySummaries || []) {
            const propertyResource = property.property as string;
            const propertyId = propertyResource.replace("properties/", "");
            properties.push({
              property: propertyResource,
              property_id: propertyId,
              display_name: property.displayName || propertyId,
              account_name: accountName,
            });
          }
        }

        if (properties.length === 0) {
          return new Response(null, {
            status: 302,
            headers: { Location: `${redirectBase}/clinics/${clinic_id}?error=no_properties` },
          });
        }

        const supabaseStore = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const { data: tempToken, error: storeError } = await supabaseStore
          .from("oauth_temp_tokens")
          .insert({
            clinic_id,
            provider: "ga4",
            payload: { properties, refresh_token: refreshToken },
          })
          .select("id")
          .single();

        if (storeError || !tempToken) {
          console.error("Failed to store GA4 OAuth temp token:", storeError);
          return new Response(null, {
            status: 302,
            headers: { Location: `${redirectBase}/clinics/${clinic_id}?error=token_store` },
          });
        }

        return new Response(null, {
          status: 302,
          headers: { Location: `${redirectBase}/clinics/${clinic_id}?ga4_token_ref=${tempToken.id}` },
        });
      }

      // List accessible customer accounts
      const customersRes = await fetch(
        "https://googleads.googleapis.com/v23/customers:listAccessibleCustomers",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN,
          },
        }
      );
      const customersText = await customersRes.text();
      if (!customersRes.ok) {
        console.error("List customers HTTP error:", customersRes.status, customersText.substring(0, 1000));
        return new Response(null, {
          status: 302,
          headers: { Location: `${redirectBase}/clinics/${clinic_id}?error=list_customers` },
        });
      }
      let customersData: { resourceNames?: string[]; error?: unknown };
      try {
        customersData = JSON.parse(customersText);
      } catch {
        console.error("List customers non-JSON response:", customersText.substring(0, 500));
        return new Response(null, {
          status: 302,
          headers: { Location: `${redirectBase}/clinics/${clinic_id}?error=list_customers` },
        });
      }
      if (customersData.error) {
        console.error("List customers API error:", JSON.stringify(customersData.error));
        return new Response(null, {
          status: 302,
          headers: { Location: `${redirectBase}/clinics/${clinic_id}?error=list_customers` },
        });
      }

      const resourceNames: string[] = customersData.resourceNames || [];
      if (resourceNames.length === 0) {
        return new Response(null, {
          status: 302,
          headers: { Location: `${redirectBase}/clinics/${clinic_id}?error=no_accounts` },
        });
      }

      // Build account list (supports MCC by querying customer_client directly)
      const accountsMap = new Map<string, { customer_id: string; name: string; login_customer_id: string }>();

      const parseSearchStream = (raw: string): any[] => {
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          // Some environments may return newline-delimited JSON chunks
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

      const searchGoogleAds = async ({
        customerId,
        loginCustomerId,
        query,
      }: {
        customerId: string;
        loginCustomerId: string;
        query: string;
      }) => {
        const res = await fetch(
          `https://googleads.googleapis.com/v23/customers/${customerId}/googleAds:searchStream`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN,
              "login-customer-id": loginCustomerId,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ query }),
          }
        );

        const text = await res.text();
        if (!res.ok) {
          console.warn(
            `googleAds:searchStream failed for customer ${customerId} (login ${loginCustomerId})`,
            res.status,
            text.substring(0, 500)
          );
          return null;
        }

        const batches = parseSearchStream(text);
        if (batches.length === 0) {
          console.warn(`Empty/invalid searchStream response for customer ${customerId}:`, text.substring(0, 500));
          return null;
        }

        return batches;
      };

      const upsertAccount = (account: { customer_id: string; name: string; login_customer_id: string }) => {
        if (!accountsMap.has(account.customer_id)) {
          accountsMap.set(account.customer_id, account);
        }
      };

      for (const rn of resourceNames) {
        const custId = rn.replace("customers/", "");

        try {
          // Try to load child client accounts (works when custId is an MCC/manager account)
          const childQuery = `SELECT
            customer_client.id,
            customer_client.descriptive_name,
            customer_client.manager,
            customer_client.status
          FROM customer_client
          WHERE customer_client.manager = false
            AND customer_client.status = 'ENABLED'`;

          const childBatches = await searchGoogleAds({
            customerId: custId,
            loginCustomerId: custId,
            query: childQuery,
          });

          let childCount = 0;
          if (childBatches) {
            for (const batch of childBatches) {
              const rows = batch.results || [];
              for (const row of rows) {
                const cc = row.customerClient;
                if (!cc) continue;

                const childId = String(cc.id || "").trim();
                if (!childId) continue;

                upsertAccount({
                  customer_id: childId,
                  name: cc.descriptiveName || childId,
                  login_customer_id: custId,
                });
                childCount += 1;
              }
            }
          }

          if (childCount > 0) {
            console.log(`Loaded ${childCount} sub-accounts from manager ${custId}`);
            continue;
          }

          // Fallback: treat as a direct/non-manager account and fetch its display name
          const selfQuery = `SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1`;
          const selfBatches = await searchGoogleAds({
            customerId: custId,
            loginCustomerId: custId,
            query: selfQuery,
          });

          const selfRow = selfBatches?.[0]?.results?.[0]?.customer;
          upsertAccount({
            customer_id: custId,
            name: selfRow?.descriptiveName || custId,
            login_customer_id: custId,
          });
        } catch (e) {
          console.warn(`Failed to process accessible account ${custId}:`, e);
          upsertAccount({ customer_id: custId, name: custId, login_customer_id: custId });
        }
      }

      const accounts = Array.from(accountsMap.values()).sort((a, b) => a.name.localeCompare(b.name));

      if (accounts.length === 0) {
        return new Response(null, {
          status: 302,
          headers: { Location: `${redirectBase}/clinics/${clinic_id}?error=no_accounts` },
        });
      }

      console.log(`Found ${accounts.length} accounts for selection`);
      
      // Store tokens server-side, pass only a UUID reference in the URL
      const supabaseStore = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: tempToken, error: storeError } = await supabaseStore
        .from("oauth_temp_tokens")
        .insert({
          clinic_id: clinic_id,
          provider: "google_ads",
          payload: { accounts, refresh_token: refreshToken },
        })
        .select("id")
        .single();

      if (storeError || !tempToken) {
        console.error("Failed to store OAuth temp token:", storeError);
        return new Response(null, {
          status: 302,
          headers: { Location: `${redirectBase}/clinics/${clinic_id}?error=token_store` },
        });
      }

      return new Response(null, {
        status: 302,
        headers: {
          Location: `${redirectBase}/clinics/${clinic_id}?google_token_ref=${tempToken.id}`,
        },
      });
    }

    // ── DISCONNECT ──
    if (action === "disconnect") {
      // Auth check: require admin
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
      const supabaseAuth = createClient(SUPABASE_URL, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user: disconnectUser }, error: disconnectAuthErr } = await supabaseAuth.auth.getUser();
      if (disconnectAuthErr || !disconnectUser) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: disconnectRole } = await supabase
        .from("user_roles").select("role").eq("user_id", disconnectUser.id).maybeSingle();
      if (disconnectRole?.role !== "admin") {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const body = await req.json();
      const { clinic_id } = body;
      if (!clinic_id) {
        return new Response(JSON.stringify({ error: "clinic_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabase
        .from("clinic_api_credentials")
        .update({
          google_ads_refresh_token: null,
          google_ads_customer_id: null,
          google_ads_login_customer_id: null,
          google_ads_account_name: null,
          last_google_sync_at: null,
        })
        .eq("clinic_id", clinic_id);

      if (error) {
        console.error("Disconnect error:", error);
        return new Response(JSON.stringify({ error: "Failed to disconnect" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("google-oauth error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
