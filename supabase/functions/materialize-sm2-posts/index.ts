// Materialize approved SM2 generation into content_posts rows for the calendar.
// Called when a client (or auto-approve) finalizes an sm2_generations row.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PlanPost {
  number?: number;
  date_suggestion?: string;
  topic?: string;
  pillar?: string;
  format?: string;
  hook_a_direction?: string;
  hook_b_direction?: string;
  image_direction?: string;
  cta_type?: string;
  compliance_flags?: string[];
}

interface WritePost {
  number?: number;
  caption?: string;
  hook_a?: string;
  hook_b?: string;
  hashtags?: string;
  alt_text?: string;
  disclaimer?: string;
  stories_hook?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { generationId } = await req.json();
    if (!generationId) {
      return new Response(JSON.stringify({ error: "generationId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load the generation
    const { data: gen, error: genErr } = await supabase
      .from("sm2_generations")
      .select("id, clinic_id, month_year, approval_status, pipeline_data")
      .eq("id", generationId)
      .single();

    if (genErr || !gen) {
      return new Response(JSON.stringify({ error: genErr?.message || "Generation not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["approved_client", "approved_auto"].includes(gen.approval_status)) {
      return new Response(
        JSON.stringify({ error: `Generation is not approved (status: ${gen.approval_status})` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Idempotency: if posts already materialized for this generation, skip.
    const { data: existing } = await supabase
      .from("content_posts")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", gen.clinic_id)
      .like("tags", `%sm2:${generationId}%`);

    // Use a tag pattern to detect prior materialization
    const { count: existingCount } = await supabase
      .from("content_posts")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", gen.clinic_id)
      .contains("tags", [`sm2:${generationId}`]);

    if ((existingCount || 0) > 0) {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: "already_materialized", count: existingCount }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const pd = (gen.pipeline_data || {}) as any;
    const planPosts: PlanPost[] = pd?.plan?.posts || [];
    const writePosts: WritePost[] = Array.isArray(pd?.write) ? pd.write : (pd?.write?.posts || []);

    if (planPosts.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, inserted: 0, reason: "no_plan_posts" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build month-bound dates
    const [year, month] = (gen.month_year || "").split("-").map(Number);
    let monthStart: string | null = null;
    let monthEnd: string | null = null;
    if (year && month) {
      monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    }

    const writeByNumber = new Map<number, WritePost>();
    writePosts.forEach((w) => {
      if (typeof w?.number === "number") writeByNumber.set(w.number, w);
    });

    const rows = planPosts.map((p) => {
      const w = (typeof p.number === "number" ? writeByNumber.get(p.number) : undefined) || {};
      let scheduled = p.date_suggestion || null;
      if (scheduled && monthStart && monthEnd && (scheduled < monthStart || scheduled > monthEnd)) {
        scheduled = null;
      }
      const captionFull = [w.caption, w.hashtags, w.disclaimer].filter(Boolean).join("\n\n");
      const title = w.hook_a || p.hook_a_direction || p.topic || "Untitled Post";
      return {
        clinic_id: gen.clinic_id,
        title: title.slice(0, 240),
        caption: captionFull || null,
        content: w.caption || null,
        platform: "instagram",
        content_type: (p.format || "").toLowerCase().includes("carousel") ? "CAROUSEL" : "IMAGE",
        scheduled_date: scheduled,
        status: "scheduled",
        workflow_stage: "client_approved",
        tags: [
          `sm2:${generationId}`,
          p.pillar,
          p.cta_type,
          ...(p.compliance_flags || []),
        ].filter(Boolean) as string[],
        compliance_note: (p.compliance_flags || []).join(", ") || null,
      };
    });

    const { error: insErr, data: inserted } = await supabase
      .from("content_posts")
      .insert(rows)
      .select("id");

    if (insErr) {
      return new Response(JSON.stringify({ error: insErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ ok: true, inserted: inserted?.length || 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
