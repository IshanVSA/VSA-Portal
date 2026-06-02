import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SA_BASE = "https://api.searchatlas.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const apiKey = Deno.env.get("SEARCH_ATLAS_API_KEY");
  if (!apiKey) return new Response("no key", { status: 500 });
  const r = await fetch(`${SA_BASE}/api/customer/projects/projects?limit=100`, { headers: { "X-API-Key": apiKey, Accept: "application/json" } });
  const j = await r.json();
  const match = (j.results || []).find((p: any) => (p.domain_url || "").includes("108ave"));
  // Return all keys + the se object verbatim for that project
  return new Response(JSON.stringify({ topKeys: Object.keys(match || {}), se: match?.data?.se, llm: match?.data?.llmv ?? null, raw_keys_in_data: Object.keys(match?.data || {}) }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
