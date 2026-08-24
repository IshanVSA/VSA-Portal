// Opaque media resolver: /f/<token> streams the underlying storage object so
// the raw Supabase URL (project ref, bucket, UUID paths) is never exposed.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders as baseCorsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Range must be an allowed request header and the range/length response
// headers must be exposed, otherwise mobile browsers cannot seek/play video.
const corsHeaders = {
  ...baseCorsHeaders,
  "Access-Control-Allow-Headers": `${(baseCorsHeaders as Record<string, string>)["Access-Control-Allow-Headers"] ?? ""}, range`,
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Expose-Headers": "content-length, content-range, accept-ranges, content-type",
};

const TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/;

const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  gif: "image/gif", avif: "image/avif", svg: "image/svg+xml",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4",
  pdf: "application/pdf", html: "text/html; charset=utf-8", zip: "application/zip",
};

// Video playback fires many range requests for the same token. Cache the
// resolved signed URL per token so only the first request pays for the
// short_links lookup + signing round trips.
type Resolved = { id: string; objectPath: string; signedUrl: string; expiresAt: number };
const resolvedCache = new Map<string, Resolved>();
const SIGNED_TTL_SECONDS = 60 * 60;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const token = url.pathname.split("/").filter(Boolean).pop() ?? "";

    if (!TOKEN_RE.test(token)) {
      return new Response("Not found", { status: 404, headers: corsHeaders });
    }

    let resolved = resolvedCache.get(token);
    if (!resolved || resolved.expiresAt < Date.now() + 60_000) {
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

      // Resolve a short-lived signed URL and proxy it, forwarding Range headers.
      // Mobile browsers (iOS Safari especially) require 206 partial responses to
      // play <video>; a plain full-body 200 stream silently fails to start.
      const { data: signed, error: signError } = await admin.storage
        .from(link.bucket)
        .createSignedUrl(link.object_path, SIGNED_TTL_SECONDS);

      if (signError || !signed?.signedUrl) {
        return new Response("Not found", { status: 404, headers: corsHeaders });
      }

      resolved = {
        id: link.id,
        objectPath: link.object_path,
        signedUrl: signed.signedUrl,
        expiresAt: Date.now() + SIGNED_TTL_SECONDS * 1000,
      };
      resolvedCache.set(token, resolved);

      // Best-effort access accounting; only on the (rare) cold resolve.
      admin
        .from("short_links")
        .update({ last_accessed_at: new Date().toISOString() })
        .eq("id", link.id)
        .then(() => {}, () => {});
    }

    const link = { id: resolved.id, object_path: resolved.objectPath };
    const signed = { signedUrl: resolved.signedUrl };


    const range = req.headers.get("range");
    const upstream = await fetch(signed.signedUrl, {
      method: req.method === "HEAD" ? "HEAD" : "GET",
      headers: range ? { Range: range } : undefined,
    });

    if (!upstream.ok && upstream.status !== 206) {
      return new Response("Not found", { status: 404, headers: corsHeaders });
    }

    // Best-effort access accounting; never blocks the response.
    admin
      .from("short_links")
      .update({ last_accessed_at: new Date().toISOString() })
      .eq("id", link.id)
      .then(() => {}, () => {});

    const ext = link.object_path.split(".").pop()?.toLowerCase() ?? "";
    const upstreamType = upstream.headers.get("content-type") ?? "";
    const contentType = upstreamType && upstreamType !== "application/octet-stream"
      ? upstreamType
      : (MIME[ext] ?? "application/octet-stream");

    const headers = new Headers({
      ...corsHeaders,
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
      "Accept-Ranges": "bytes",
      "Content-Disposition": `inline; filename="${(link.object_path.split("/").pop() ?? "file").replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
    });

    for (const h of ["content-length", "content-range", "etag", "last-modified"]) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }

    return new Response(req.method === "HEAD" ? null : upstream.body, {
      status: upstream.status === 206 ? 206 : 200,
      headers,
    });
  } catch (_e) {
    return new Response("Not found", { status: 404, headers: corsHeaders });
  }
});
