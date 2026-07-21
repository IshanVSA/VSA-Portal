import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  signState,
  verifyState,
  tryParseLegacyState,
  safeRedirectBase,
  logSecurityEvent,
} from "../_shared/security.ts";

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
const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY")!;

const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/google-oauth?action=callback`;
const FRONTEND_URL = Deno.env.get("SITE_URL") || "https://portal.vsavetmedia.com";

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

async function refreshGoogleAccessToken(refreshToken: string): Promise<string | null> {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || tokenData.error || !tokenData.access_token) {
    console.warn("Google Ads token reuse failed:", tokenData.error || tokenRes.status);
    return null;
  }
  return tokenData.access_token;
}

async function listGoogleAdsAccounts(accessToken: string) {
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
    throw new Error("list_customers");
  }
  let customersData: { resourceNames?: string[]; error?: unknown };
  try {
    customersData = JSON.parse(customersText);
  } catch {
    console.error("List customers non-JSON response:", customersText.substring(0, 500));
    throw new Error("list_customers");
  }
  if (customersData.error) {
    console.error("List customers API error:", JSON.stringify(customersData.error));
    throw new Error("list_customers");
  }

  const resourceNames: string[] = customersData.resourceNames || [];
  if (resourceNames.length === 0) return [];

  const accountsMap = new Map<string, { customer_id: string; name: string; login_customer_id: string }>();

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
    if (!accountsMap.has(account.customer_id)) accountsMap.set(account.customer_id, account);
  };

  for (const rn of resourceNames) {
    const custId = rn.replace("customers/", "");

    try {
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

  return Array.from(accountsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }) };

  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
  const supabaseAuth = createClient(SUPABASE_URL, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error } = await supabaseAuth.auth.getUser();
  if (error || !user) return { response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }) };

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
  if (roleData?.role !== "admin") return { response: new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }) };

  return { supabase, user };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    // ── USE EXISTING TOKEN ──
    // When reconnecting many clinics under the same agency Google Ads login,
    // reuse an already-saved refresh token to list accounts instead of sending
    // the admin through Google's verification/consent screen for every clinic.
    if (action === "use_existing") {
      const admin = await requireAdmin(req);
      if (admin.response) return admin.response;

      const { clinic_id } = await req.json();
      if (!clinic_id) {
        return new Response(JSON.stringify({ error: "clinic_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: existingCred } = await admin.supabase!
        .from("clinic_api_credentials")
        .select("google_ads_refresh_token")
        .not("google_ads_refresh_token", "is", null)
        .limit(1)
        .maybeSingle();

      if (!existingCred?.google_ads_refresh_token) {
        return new Response(JSON.stringify({ error: "No reusable Google Ads connection found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const refreshToken = await decryptToken(existingCred.google_ads_refresh_token);
      const accessToken = await refreshGoogleAccessToken(refreshToken);
      if (!accessToken) {
        return new Response(JSON.stringify({ error: "Stored Google Ads connection needs reauthorization" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const accounts = await listGoogleAdsAccounts(accessToken);
      if (accounts.length === 0) {
        return new Response(JSON.stringify({ error: "No Google Ads accounts found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: tempToken, error: storeError } = await admin.supabase!
        .from("oauth_temp_tokens")
        .insert({
          clinic_id,
          provider: "google_ads",
          payload: { accounts, refresh_token: refreshToken },
        })
        .select("id")
        .single();

      if (storeError || !tempToken) {
        console.error("Failed to store reused OAuth temp token:", storeError);
        return new Response(JSON.stringify({ error: "Failed to prepare account picker" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await logSecurityEvent(req, {
        action: "google_oauth.use_existing",
        actor_user_id: admin.user!.id,
        clinic_id,
      });

      return new Response(JSON.stringify({ token_ref: tempToken.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── AUTHORIZE ──
    if (action === "authorize") {
      const clinicId = url.searchParams.get("clinic_id");
      const requestedOrigin = url.searchParams.get("origin");
      // Only accept origins on the allow-list; otherwise force production.
      const originUrl = safeRedirectBase(requestedOrigin, FRONTEND_URL);
      if (!clinicId) {
        return new Response(JSON.stringify({ error: "clinic_id is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await logSecurityEvent(req, {
        action: "google_oauth.authorize",
        clinic_id: clinicId,
        metadata: { requested_origin: requestedOrigin, resolved_origin: originUrl },
      });

      // HMAC-signed, short-lived state. Attacker cannot forge a state with a
      // different clinic_id or origin without the server's signing secret.
      const state = await signState({ clinic_id: clinicId, origin: originUrl });
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

      // Parse state (signed preferred; legacy base64 fallback for in-flight flows)
      let parsedState: Record<string, any> | null = null;
      if (stateParam) {
        parsedState = await verifyState(stateParam);
        if (!parsedState) parsedState = tryParseLegacyState(stateParam);
      }
      // Re-validate origin from state against allow-list
      const requestedOrigin = parsedState?.origin as string | undefined;
      const redirectBase = safeRedirectBase(requestedOrigin, FRONTEND_URL);

      if (errorParam) {
        console.error("Google OAuth error:", errorParam);
        await logSecurityEvent(req, {
          action: "google_oauth.callback_error",
          clinic_id: parsedState?.clinic_id ?? null,
          metadata: { error: errorParam },
        });
        return new Response(null, {
          status: 302,
          headers: { Location: `${redirectBase}/clinics?error=oauth_denied` },
        });
      }

      if (!code || !stateParam || !parsedState) {
        await logSecurityEvent(req, {
          action: "google_oauth.invalid_state",
          metadata: {
            had_code: !!code,
            had_state: !!stateParam,
            verified: !!parsedState,
          },
        });
        return new Response(JSON.stringify({ error: "Missing or invalid state" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { clinic_id, provider } = parsedState;



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

      if (provider === "gsc") {
        const sitesRes = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const sitesText = await sitesRes.text();
        if (!sitesRes.ok) {
          console.error("GSC sites.list failed:", sitesRes.status, sitesText.substring(0, 500));
          return new Response(null, {
            status: 302,
            headers: { Location: `${redirectBase}/clinics/${clinic_id}?error=list_sites` },
          });
        }

        let sitesData: any;
        try {
          sitesData = JSON.parse(sitesText);
        } catch {
          return new Response(null, {
            status: 302,
            headers: { Location: `${redirectBase}/clinics/${clinic_id}?error=list_sites` },
          });
        }

        const sites: Array<{ site_url: string; permission_level: string }> = [];
        for (const site of sitesData.siteEntry || []) {
          if (["siteOwner", "siteFullUser", "siteRestrictedUser"].includes(site.permissionLevel)) {
            sites.push({ site_url: site.siteUrl, permission_level: site.permissionLevel });
          }
        }

        if (sites.length === 0) {
          return new Response(null, {
            status: 302,
            headers: { Location: `${redirectBase}/clinics/${clinic_id}?error=no_sites` },
          });
        }

        const supabaseStore = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const { data: tempToken, error: storeError } = await supabaseStore
          .from("oauth_temp_tokens")
          .insert({
            clinic_id,
            provider: "gsc",
            payload: { sites, refresh_token: refreshToken },
          })
          .select("id")
          .single();

        if (storeError || !tempToken) {
          console.error("Failed to store GSC OAuth temp token:", storeError);
          return new Response(null, {
            status: 302,
            headers: { Location: `${redirectBase}/clinics/${clinic_id}?error=token_store` },
          });
        }

        return new Response(null, {
          status: 302,
          headers: { Location: `${redirectBase}/clinics/${clinic_id}?gsc_token_ref=${tempToken.id}` },
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

      await logSecurityEvent(req, {
        action: "google_oauth.disconnect",
        actor_user_id: disconnectUser.id,
        clinic_id,
      });

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
