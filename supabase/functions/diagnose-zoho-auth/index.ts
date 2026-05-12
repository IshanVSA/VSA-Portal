// Admin-only diagnostic: calls Zoho's OAuth token endpoint with the
// configured refresh token and returns the raw response (status + body)
// so we can distinguish invalid_client vs invalid_grant vs region issues.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REGIONS: Record<string, string> = {
  ca: "https://accounts.zohocloud.ca/oauth/v2/token",
  com: "https://accounts.zoho.com/oauth/v2/token",
  eu: "https://accounts.zoho.eu/oauth/v2/token",
  in: "https://accounts.zoho.in/oauth/v2/token",
  "com.au": "https://accounts.zoho.com.au/oauth/v2/token",
  jp: "https://accounts.zoho.jp/oauth/v2/token",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims } = await supabaseAuth.auth.getClaims(token);
    const callerId = claims?.claims?.sub as string | undefined;
    if (!callerId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleData } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", callerId).maybeSingle();
    if (roleData?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientId = Deno.env.get("ZOHO_CLIENT_ID") ?? "";
    const clientSecret = Deno.env.get("ZOHO_CLIENT_SECRET") ?? "";
    const refreshToken = Deno.env.get("ZOHO_REFRESH_TOKEN") ?? "";
    const accountId = Deno.env.get("ZOHO_ACCOUNT_ID") ?? "";

    const presence = {
      ZOHO_CLIENT_ID: { present: !!clientId, length: clientId.length, prefix: clientId.slice(0, 6) },
      ZOHO_CLIENT_SECRET: { present: !!clientSecret, length: clientSecret.length },
      ZOHO_REFRESH_TOKEN: { present: !!refreshToken, length: refreshToken.length, prefix: refreshToken.slice(0, 8) },
      ZOHO_ACCOUNT_ID: { present: !!accountId, length: accountId.length },
    };

    if (!clientId || !clientSecret || !refreshToken) {
      return new Response(JSON.stringify({
        ok: false,
        message: "Missing one or more Zoho secrets",
        presence,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Allow ?region=com to override; default tries CA first then probes others.
    const url = new URL(req.url);
    const requestedRegion = url.searchParams.get("region");
    const regionsToTry = requestedRegion && REGIONS[requestedRegion]
      ? [requestedRegion]
      : Object.keys(REGIONS);

    const results: Array<Record<string, unknown>> = [];
    for (const region of regionsToTry) {
      const endpoint = REGIONS[region];
      const params = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      });

      let status = 0;
      let bodyText = "";
      let bodyJson: unknown = null;
      let networkError: string | null = null;

      try {
        const res = await fetch(`${endpoint}?${params.toString()}`, { method: "POST" });
        status = res.status;
        bodyText = await res.text();
        try { bodyJson = JSON.parse(bodyText); } catch { /* keep raw text */ }
      } catch (err) {
        networkError = err instanceof Error ? err.message : String(err);
      }

      const errorCode =
        bodyJson && typeof bodyJson === "object" && "error" in (bodyJson as any)
          ? (bodyJson as any).error
          : null;
      const hasAccessToken =
        bodyJson && typeof bodyJson === "object" && "access_token" in (bodyJson as any);

      results.push({
        region,
        endpoint,
        http_status: status,
        zoho_error: errorCode,
        has_access_token: !!hasAccessToken,
        network_error: networkError,
        body: bodyJson ?? bodyText.slice(0, 500),
      });

      // If we got a token, no need to probe further regions
      if (hasAccessToken) break;
    }

    const interpretation = interpret(results);

    // Optional: probe accountId + send API. Pass ?send=you@example.com
    const sendTo = url.searchParams.get("send");
    let sendProbe: Record<string, unknown> | null = null;
    const successResult = results.find((r) => r.has_access_token);
    if (sendTo && successResult) {
      const accessToken = ((successResult.body as any)?.access_token) as string;
      const apiDomain = ((successResult.body as any)?.api_domain) as string || "https://www.zohoapis.ca";
      // Map api_domain -> mail host. CA uses mail.zohocloud.ca (matches _shared/zoho-mail.ts)
      const dcMap: Record<string, string> = {
        "https://www.zohoapis.ca": "https://mail.zohocloud.ca",
        "https://www.zohoapis.com": "https://mail.zoho.com",
        "https://www.zohoapis.eu": "https://mail.zoho.eu",
        "https://www.zohoapis.in": "https://mail.zoho.in",
        "https://www.zohoapis.com.au": "https://mail.zoho.com.au",
        "https://www.zohoapis.jp": "https://mail.zoho.jp",
      };
      const mailHost = dcMap[apiDomain] ?? "https://mail.zohocloud.ca";

      // 1) Verify accountId by listing accounts
      let acctStatus = 0; let acctBody: unknown = null;
      try {
        const r = await fetch(`${mailHost}/api/accounts`, {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
        });
        acctStatus = r.status;
        const t = await r.text();
        try { acctBody = JSON.parse(t); } catch { acctBody = t.slice(0, 500); }
      } catch (e) { acctBody = String(e); }

      // 2) Try a real send
      let sendStatus = 0; let sendBody: unknown = null;
      if (accountId) {
        try {
          const r = await fetch(`${mailHost}/api/accounts/${accountId}/messages`, {
            method: "POST",
            headers: {
              Authorization: `Zoho-oauthtoken ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              fromAddress: "support@vsavetmedia.ca",
              toAddress: sendTo,
              subject: "VSA Vet Media — Zoho diagnostic test",
              content: "<p>If you received this, Zoho send is fully working.</p>",
              mailFormat: "html",
            }),
          });
          sendStatus = r.status;
          const t = await r.text();
          try { sendBody = JSON.parse(t); } catch { sendBody = t.slice(0, 1000); }
        } catch (e) { sendBody = String(e); }
      }

      sendProbe = {
        api_domain: apiDomain,
        mail_host: mailHost,
        account_id_used: accountId,
        accounts_list: { http_status: acctStatus, body: acctBody },
        send_attempt: { to: sendTo, http_status: sendStatus, body: sendBody },
      };
    }

    return new Response(JSON.stringify({
      ok: true,
      presence,
      results,
      interpretation,
      send_probe: sendProbe,
      hint: sendTo ? undefined : "Append ?send=you@example.com to test the actual send API and verify ZOHO_ACCOUNT_ID.",
    }, null, 2), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: "Internal error",
      message: err instanceof Error ? err.message : String(err),
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

function interpret(results: Array<Record<string, unknown>>): string {
  const success = results.find((r) => r.has_access_token);
  if (success) {
    return `Refresh token is VALID on the '${success.region}' datacenter. ` +
      `If sends are still failing, the issue is downstream (ZOHO_ACCOUNT_ID, scope, or send API), not OAuth.`;
  }
  const codes = results.map((r) => `${r.region}=${r.zoho_error ?? r.http_status}`).join(", ");
  const anyInvalidClient = results.some((r) => r.zoho_error === "invalid_client");
  const anyInvalidGrant = results.some((r) => r.zoho_error === "invalid_grant");
  if (anyInvalidClient && !anyInvalidGrant) {
    return `Zoho returned 'invalid_client' on every region tried (${codes}). ` +
      `=> ZOHO_CLIENT_ID or ZOHO_CLIENT_SECRET is wrong, or the app was deleted in the Zoho API console.`;
  }
  if (anyInvalidGrant) {
    return `Zoho returned 'invalid_grant' (${codes}). ` +
      `=> The ZOHO_REFRESH_TOKEN is revoked, expired, or was issued in a different datacenter than the one accepting it. ` +
      `Generate a new refresh token in the Zoho API console (matching datacenter) with ZohoMail.messages.CREATE scope and update the secret.`;
  }
  return `Zoho rejected every region (${codes}). See 'results' for raw response bodies.`;
}
