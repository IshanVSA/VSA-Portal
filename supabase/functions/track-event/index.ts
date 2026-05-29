// Public endpoint called from clinic websites to record session_start and cta_click events.
// No JWT required — runs with service role to bypass RLS for inserts.
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const VALID_EVENTS = ["session_start", "cta_click"];
const VALID_CTAS = ["book_appointment", "find_us", "call_us", "new_client_form", "email_contact"];
const VALID_CHANNELS = ["organic", "paid", "direct", "social", "referral", "email"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: cors });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: cors });
  }

  const clinic_id = String(body.clinic_id || "").trim();
  const event_type = String(body.event_type || "");
  const cta_type = body.cta_type ? String(body.cta_type) : null;
  const channel = VALID_CHANNELS.includes(String(body.channel)) ? String(body.channel) : "direct";

  if (!clinic_id || clinic_id === "UNSET") {
    return new Response(JSON.stringify({ error: "missing clinic_id" }), { status: 400, headers: cors });
  }
  if (!VALID_EVENTS.includes(event_type)) {
    return new Response(JSON.stringify({ error: "bad event_type" }), { status: 400, headers: cors });
  }
  if (event_type === "cta_click" && (!cta_type || !VALID_CTAS.includes(cta_type))) {
    return new Response(JSON.stringify({ error: "bad cta_type" }), { status: 400, headers: cors });
  }

  const { error } = await supabase.from("tracking_events").insert({
    clinic_id,
    event_type,
    cta_type,
    channel,
    source: body.source ? String(body.source).slice(0, 120) : null,
    landing_page: body.landing_page ? String(body.landing_page).slice(0, 500) : null,
    page_path: body.page_path ? String(body.page_path).slice(0, 500) : null,
    session_id: body.session_id ? String(body.session_id).slice(0, 64) : null,
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors });
});
