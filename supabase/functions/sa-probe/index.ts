import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SA_BASE = "https://api.searchatlas.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const apiKey = Deno.env.get("SEARCH_ATLAS_API_KEY");
  if (!apiKey) return new Response(JSON.stringify({ error: "no key" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const url = new URL(req.url);
  const domain = url.searchParams.get("domain") ?? "108aveanimalhospital.com";
  const pid = url.searchParams.get("pid") ?? "551407";

  const candidates = [
    `/api/customer/projects/projects?limit=100`,
    `/api/v1/se/${pid}/`,
    `/api/v1/se/${pid}/backlinks/`,
    `/api/v1/se/${pid}/backlinks/refdomains/`,
    `/api/v1/se/${pid}/refdomains/`,
    `/api/v1/se/${pid}/overview/`,
    `/api/v1/se/${pid}/history/`,
    `/api/v1/se/?domain=${domain}`,
    `/api/v1/se/refdomains/?domain=${domain}`,
    `/api/v1/se/backlinks/?domain=${domain}`,
    `/api/v1/se/site_explorer/?domain=${domain}`,
    `/api/v1/site-explorer/${pid}/`,
    `/api/v1/site-explorer/${pid}/refdomains/`,
    `/api/v1/site-explorer/${pid}/backlinks/`,
    `/api/v1/site-explorer/?domain=${domain}`,
    `/api/v1/site-explorer/?id=${pid}`,
  ];

  const out: Record<string, unknown> = {};
  for (const path of candidates) {
    try {
      const r = await fetch(SA_BASE + path, { headers: { "X-API-Key": apiKey, Accept: "application/json" } });
      const t = await r.text();
      const trimmed = t.startsWith("\n<!doctype") ? "[404 html]" : t.slice(0, 3500);
      out[path] = { status: r.status, body: trimmed };
    } catch (e) {
      out[path] = { error: String(e) };
    }
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
