// Opaque media resolver: /f/<token> streams the underlying storage object so
// the raw Supabase URL (project ref, bucket, UUID paths) is never exposed.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/;

const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  gif: "image/gif", avif: "image/avif", svg: "image/svg+xml",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4",
  pdf: "application/pdf", html: "text/html; charset=utf-8", zip: "application/zip",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const token = url.pathname.split("/").filter(Boolean).pop() ?? "";

    if (!TOKEN_RE.test(token)) {
      return new Response("Not found", { status: 404, headers: corsHeaders });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: link, error } = await admin
      .from("short_links")
      .select("id, bucket, object_path")
      .eq("token", token)
      .maybeSingle();

    if (error || !link) {
      return new Response("Not found", { status: 404, headers: corsHeaders });
    }

    const { data: file, error: dlError } = await admin.storage
      .from(link.bucket)
      .download(link.object_path);

    if (dlError || !file) {
      return new Response("Not found", { status: 404, headers: corsHeaders });
    }

    // Best-effort access accounting; never blocks the response.
    admin
      .from("short_links")
      .update({ hits: undefined, last_accessed_at: new Date().toISOString() })
      .eq("id", link.id)
      .then(() => {}, () => {});

    const ext = link.object_path.split(".").pop()?.toLowerCase() ?? "";
    const contentType = file.type && file.type !== "application/octet-stream"
      ? file.type
      : (MIME[ext] ?? "application/octet-stream");

    return new Response(file.stream(), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
        "Content-Disposition": `inline; filename="${(link.object_path.split("/").pop() ?? "file").replace(/"/g, "")}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (_e) {
    return new Response("Not found", { status: 404, headers: corsHeaders });
  }
});
