import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Allow CRON_SECRET or service-role calls only
  const cronSecret = Deno.env.get("CRON_SECRET");
  const auth = req.headers.get("authorization") || "";
  const provided = req.headers.get("x-cron-secret") || auth.replace(/^Bearer\s+/i, "");
  if (cronSecret && provided !== cronSecret && provided !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: tickets, error } = await supabase
    .from("department_tickets")
    .select("id")
    .eq("ticket_type", "Content Request")
    .eq("content_approval_status", "pending")
    .lt("content_ready_for_review_at", cutoff)
    .limit(200);

  if (error) {
    console.error("auto-approve query failed", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ids = (tickets ?? []).map((t: any) => t.id);
  if (ids.length === 0) {
    return new Response(JSON.stringify({ ok: true, approved: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const nowIso = new Date().toISOString();
  const { error: upErr } = await supabase
    .from("department_tickets")
    .update({ content_approval_status: "auto_approved", content_approved_at: nowIso, updated_at: nowIso } as any)
    .in("id", ids);

  if (upErr) {
    console.error("auto-approve update failed", upErr);
    return new Response(JSON.stringify({ error: upErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, approved: ids.length, ids }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
