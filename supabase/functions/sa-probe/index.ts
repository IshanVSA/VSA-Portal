import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async () => {
  const apiKey = Deno.env.get("SEARCH_ATLAS_API_KEY")!;
  const r = await fetch(`https://api.searchatlas.com/api/customer/projects/projects?limit=100`, { headers: { "X-API-Key": apiKey, Accept: "application/json" } });
  const j = await r.json();
  const match = (j.results || []).find((p: any) => (p.domain_url || "").includes("108ave"));
  const se = match?.data?.se ?? {};
  const summary: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(se)) {
    if (Array.isArray(v)) {
      const sample = v[0];
      summary[k] = { type: "array", length: v.length, sampleKeys: sample && typeof sample === "object" ? Object.keys(sample) : typeof sample, last: v[v.length - 1] };
    } else if (v && typeof v === "object") {
      summary[k] = { type: "object", keys: Object.keys(v as object) };
    } else {
      summary[k] = v;
    }
  }
  return new Response(JSON.stringify({ topLevelKeys: Object.keys(match || {}), seKeysSummary: summary }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
