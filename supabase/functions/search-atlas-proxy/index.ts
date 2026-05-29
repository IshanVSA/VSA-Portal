import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Whitelisted Search Atlas endpoints (read-only). Path-prefix match.
const ALLOWED_PREFIXES = [
  "/api/agent/projects",            // Agent projects list
  "/api/agent/otto",                // OTTO status
  "/api/customer/projects/projects",// Core customer projects
  "/api/site-auditor",              // Site audit details / issues
  "/api/v2/site-audit",             // Site audit v2 events stream
  "/api/v1/rank-tracker",           // Rank tracker / heatmap grids
  "/api/agent/local-seo-heatmaps",  // Local SEO heatmaps
  "/backlink/projects",             // Backlink projects + refdomains
  "/backlink/backlink-profile-analysis",
  "/backlink/backlink-research",
  "/api/v1/projects",               // LLM visibility projects
  "/api/v1/brand",                  // LLM brand metrics (POST allowed)
  "/api/v1/se",                     // Site Explorer / LLM visibility SE
  "/api/v1/keyword_details",        // Keyword metrics
  "/search-console/api/v2/keywords",
  "/search-console/api/v2/keyword-rankings",
  "/search-console/api/v2/keyword-historical-performance",
];

const ALLOWED_METHODS = ["GET", "POST"];
const SA_BASE = "https://api.searchatlas.com";

function isPathAllowed(path: string) {
  if (!path.startsWith("/")) return false;
  return ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p + "?"));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ---- Auth: require a signed-in user ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authError } = await supabase.auth.getClaims(token);
    if (authError || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- API key ----
    const apiKey = Deno.env.get("SEARCH_ATLAS_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "SEARCH_ATLAS_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Parse body ----
    const body = await req.json().catch(() => ({}));
    const path: string = body?.path ?? "";
    const method: string = (body?.method ?? "GET").toUpperCase();
    const query: Record<string, string | number | boolean> | undefined = body?.query;
    const payload: unknown = body?.body;

    if (!path || typeof path !== "string") {
      return new Response(JSON.stringify({ error: "Missing 'path'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!ALLOWED_METHODS.includes(method)) {
      return new Response(JSON.stringify({ error: `Method ${method} not allowed` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!isPathAllowed(path)) {
      return new Response(JSON.stringify({ error: `Path not allowed: ${path}` }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Build URL ----
    const url = new URL(SA_BASE + path);
    if (query && typeof query === "object") {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
      }
    }

    // ---- Forward request ----
    const init: RequestInit = {
      method,
      headers: {
        "X-API-Key": apiKey,
        "Accept": "application/json",
        ...(payload !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
    };

    const upstream = await fetch(url.toString(), init);
    const text = await upstream.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = text; }

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({
          error: `Search Atlas ${upstream.status}`,
          status: upstream.status,
          details: data,
        }),
        { status: upstream.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("search-atlas-proxy error", e);
    return new Response(JSON.stringify({ error: (e as Error).message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
