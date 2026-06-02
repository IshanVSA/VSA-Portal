import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async () => {
  const apiKey = Deno.env.get("SEARCH_ATLAS_API_KEY")!;
  const r = await fetch(`https://api.searchatlas.com/api/customer/projects/projects?limit=100`, { headers: { "X-API-Key": apiKey, Accept: "application/json" } });
  const j = await r.json();
  const match = (j.results || []).find((p: any) => (p.domain_url || "").includes("108ave"));
  return new Response(JSON.stringify({ data_v2: match?.data_v2 ?? null, top: { sa_id: match?.sa_id, otto_id: match?.otto_id, se_id: match?.se_id, krt_id: match?.krt_id, llmv_id: match?.llmv_id, location: match?.location, domain_rating: match?.domain_rating } }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
