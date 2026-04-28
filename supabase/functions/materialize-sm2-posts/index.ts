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

const STORAGE_BUCKET = "department-files";

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

    // Build a public URL helper for our public bucket
    const publicUrlFor = (path: string | null | undefined): string | null => {
      if (!path) return null;
      const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      return data?.publicUrl || null;
    };

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

    // Load matching sm2_posts to pick up images (cover + gallery) the concierge uploaded
    const { data: sm2Posts } = await supabase
      .from("sm2_posts")
      .select("id, post_number, position, image_path, image_paths, scheduled_date")
      .eq("generation_id", generationId);

    // Index by post_number first (preferred), then by position as fallback
    const sm2ByNumber = new Map<number, any>();
    const sm2ByPosition = new Map<number, any>();
    (sm2Posts || []).forEach((row) => {
      if (typeof row.post_number === "number") sm2ByNumber.set(row.post_number, row);
      if (typeof row.position === "number") sm2ByPosition.set(row.position, row);
    });

    const imagesForIndex = (planNumber: number | undefined, idx: number) => {
      const row =
        (typeof planNumber === "number" && sm2ByNumber.get(planNumber)) ||
        sm2ByPosition.get(idx) ||
        null;
      if (!row) return { cover: null as string | null, gallery: [] as string[] };
      const cover = publicUrlFor(row.image_path);
      const gallery = (row.image_paths || [])
        .map((p: string) => publicUrlFor(p))
        .filter((u: string | null): u is string => !!u);
      return { cover, gallery };
    };

    // Idempotency: if posts already materialized, just refresh image URLs and exit.
    const { data: existingRows } = await supabase
      .from("content_posts")
      .select("id, tags, scheduled_date")
      .eq("clinic_id", gen.clinic_id)
      .contains("tags", [`sm2:${generationId}`])
      .order("scheduled_date", { ascending: true });

    const pd = (gen.pipeline_data || {}) as any;
    const planPosts: PlanPost[] = pd?.plan?.posts || [];
    const writePosts: WritePost[] = Array.isArray(pd?.write) ? pd.write : (pd?.write?.posts || []);

    if ((existingRows?.length || 0) > 0) {
      // Refresh image_url / image_urls on existing rows so newly uploaded images appear.
      let updatedCount = 0;
      for (let i = 0; i < (existingRows || []).length; i++) {
        const row = existingRows![i];
        const planRow = planPosts[i];
        const { cover, gallery } = imagesForIndex(planRow?.number, i);
        if (!cover && gallery.length === 0) continue;
        const { error: upErr } = await supabase
          .from("content_posts")
          .update({ image_url: cover, image_urls: gallery })
          .eq("id", row.id);
        if (!upErr) updatedCount++;
      }
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: "already_materialized", updated_images: updatedCount }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

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

    const rows = planPosts.map((p, idx) => {
      const w = (typeof p.number === "number" ? writeByNumber.get(p.number) : undefined) || {};
      let scheduled = p.date_suggestion || null;
      if (scheduled && monthStart && monthEnd && (scheduled < monthStart || scheduled > monthEnd)) {
        scheduled = null;
      }
      const captionFull = [w.caption, w.hashtags, w.disclaimer].filter(Boolean).join("\n\n");
      const title = w.hook_a || p.hook_a_direction || p.topic || "Untitled Post";
      const { cover, gallery } = imagesForIndex(p.number, idx);
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
        image_url: cover,
        image_urls: gallery,
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
