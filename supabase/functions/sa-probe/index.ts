// Temporary diagnostic probe for Search Atlas backlink endpoints.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SA_BASE = "https://api.searchatlas.com";
const MCP_BASE = "https://mcp.searchatlas.com/api/v1/mcp";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const apiKey = Deno.env.get("SEARCH_ATLAS_API_KEY");
  if (!apiKey) return new Response(JSON.stringify({ error: "no key" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const url = new URL(req.url);
  const domain = url.searchParams.get("domain") ?? "108aveanimalhospital.com";
  const pid = url.searchParams.get("pid") ?? "551407";

  const restCandidates = [
    `/backlink/projects/${pid}`,
    `/backlink/projects/${pid}/refdomains?limit=10`,
    `/backlink/projects/${pid}/referring-domains?limit=10`,
    `/backlink/projects/${pid}/backlinks?limit=10`,
    `/backlink/projects/${pid}/overview`,
    `/backlink/projects/${pid}/history`,
    `/backlink/projects/${pid}/new-lost?limit=10`,
    `/backlink/projects/${pid}/anchors?limit=10`,
    `/backlink/backlink-profile-analysis?domain=${domain}`,
    `/backlink/backlink-research?domain=${domain}`,
    `/backlink/backlink-research/refdomains?domain=${domain}&limit=10`,
    `/backlink/backlink-research/backlinks?domain=${domain}&limit=10`,
    `/backlink/backlink-research/new-lost?domain=${domain}`,
    `/backlink/backlink-research/history?domain=${domain}`,
  ];

  const out: Record<string, unknown> = {};
  for (const path of restCandidates) {
    try {
      const r = await fetch(SA_BASE + path, { headers: { "X-API-Key": apiKey, Accept: "application/json" } });
      const t = await r.text();
      out[path] = { status: r.status, body: t.slice(0, 2000) };
    } catch (e) {
      out[path] = { error: String(e) };
    }
  }

  // MCP probes
  const mcpProbes = [
    { tool: "backlinks", op: "get_site_backlinks", params: { project_id: pid, domain } },
    { tool: "backlinks", op: "get_site_referring_domains", params: { project_id: pid, domain, limit: 10 } },
  ];
  for (const p of mcpProbes) {
    try {
      const r = await fetch(MCP_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-KEY": apiKey, Accept: "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method: "tools/call", params: { name: p.tool, arguments: { op: p.op, params: p.params } } }),
      });
      const t = await r.text();
      out[`mcp:${p.tool}.${p.op}`] = { status: r.status, body: t.slice(0, 4000) };
    } catch (e) {
      out[`mcp:${p.tool}.${p.op}`] = { error: String(e) };
    }
  }

  return new Response(JSON.stringify(out, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
