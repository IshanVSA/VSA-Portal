import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// TEMPORARY diagnostic function: introspects the Search Atlas MCP server and
// probes REST endpoints so we can see exactly which data sources return rows.
// Protected by SA_BULK_SECRET.

const MCP_BASES = [
  "https://mcp.searchatlas.com/mcp/",
  "https://mcp.searchatlas.com/api/v1/mcp",
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function authHeaders(apiKey: string) {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (apiKey.split(".").length === 3) h.Authorization = `Bearer ${apiKey}`;
  else h["X-API-KEY"] = apiKey;
  return h;
}

function parseBody(text: string): unknown {
  const t = text.trimStart();
  if (t.startsWith("event:") || t.startsWith("data:")) {
    const frames = t.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim()).filter((p) => p && p !== "[DONE]");
    for (const p of frames.reverse()) { try { return JSON.parse(p); } catch { /* next */ } }
  }
  try { return JSON.parse(text); } catch { return text.slice(0, 800); }
}

async function mcp(base: string, apiKey: string, body: unknown) {
  const res = await fetch(base, { method: "POST", headers: authHeaders(apiKey), body: JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, data: parseBody(text) };
}

function summarize(data: unknown, full: boolean) {
  if (full) return data;
  const s = JSON.stringify(data);
  return s.length > 1500 ? s.slice(0, 1500) + "…" : JSON.parse(s);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // TEMPORARY diagnostic endpoint. Returns no secrets; deleted after the probe run.

  const apiKey = Deno.env.get("SEARCH_ATLAS_API_KEY");
  if (!apiKey) return json({ error: "SEARCH_ATLAS_API_KEY missing" }, 500);

  const body = await req.json().catch(() => ({} as any));
  const mode: string = body.mode ?? "tools";
  const full: boolean = body.full === true;

  // 1) tools/list against both bases
  if (mode === "tools") {
    const out: Record<string, unknown> = {};
    for (const base of MCP_BASES) {
      const r = await mcp(base, apiKey, { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
      const tools = (r.data as any)?.result?.tools;
      out[base] = Array.isArray(tools)
        ? tools.map((t: any) => ({
            name: t.name,
            description: String(t.description ?? "").slice(0, 160),
            required: t.inputSchema?.required ?? [],
            props: Object.keys(t.inputSchema?.properties ?? {}),
          }))
        : { status: r.status, data: summarize(r.data, full) };
    }
    return json(out);
  }

  // 2) call a specific tool
  if (mode === "call") {
    const name: string = body.name;
    const params: Record<string, unknown> = body.params ?? {};
    const base: string = body.base ?? MCP_BASES[0];
    const r = await mcp(base, apiKey, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: params } });
    return json({ status: r.status, data: summarize(r.data, full) });
  }

  // 3) raw REST probe
  if (mode === "rest") {
    const url: string = body.url;
    const method: string = body.method ?? "GET";
    const res = await fetch(url, {
      method,
      headers: authHeaders(apiKey),
      body: body.payload ? JSON.stringify(body.payload) : undefined,
    });
    const text = await res.text();
    return json({ status: res.status, ct: res.headers.get("content-type"), data: summarize(parseBody(text), full) });
  }

  return json({ error: "unknown mode" }, 400);
});
