// Auto-connect Google Search Console for all clinics based on domain matching.
// Uses existing refresh tokens from already-connected clinics to enumerate all
// sites the agency account has access to, then matches by domain and upserts
// clinic_gsc_credentials for clinics that aren't yet connected.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const ENCRYPTION_KEY = Deno.env.get("ENCRYPTION_KEY")!;

async function decryptToken(encryptedText: string): Promise<string> {
  if (!encryptedText || !encryptedText.startsWith("enc:")) return encryptedText;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const keyHash = await crypto.subtle.digest("SHA-256", encoder.encode(ENCRYPTION_KEY));
  const key = await crypto.subtle.importKey("raw", keyHash, "AES-GCM", false, ["decrypt"]);
  const combined = Uint8Array.from(atob(encryptedText.slice(4)), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return decoder.decode(decrypted);
}

async function encryptToken(plainText: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyHash = await crypto.subtle.digest("SHA-256", encoder.encode(ENCRYPTION_KEY));
  const key = await crypto.subtle.importKey("raw", keyHash, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plainText));
  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return "enc:" + btoa(String.fromCharCode(...combined));
}

async function fetchAccessToken(refreshToken: string): Promise<string | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  return data.access_token || null;
}

function normalize(u: string): string {
  return (u || "").toLowerCase()
    .replace(/^sc-domain:/, "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "")
    .trim();
}

function rootDomain(host: string): string {
  const parts = host.split("/")[0].split(".");
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}

interface SiteEntry {
  site_url: string;
  permission_level: string;
  refresh_token: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const cronHeader = req.headers.get("x-cron-secret") || "";
    const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
    const isServiceCall =
      token === SUPABASE_SERVICE_ROLE_KEY ||
      (CRON_SECRET && (token === CRON_SECRET || cronHeader === CRON_SECRET));

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let userId: string | null = null;

    if (!isServiceCall) {
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
      const supabaseAuth = createClient(SUPABASE_URL, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await supabaseAuth.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
      if (roleData?.role !== "admin") {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = user.id;
    }


    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = !!body?.dry_run;

    // 1) Load existing tokens to enumerate available sites
    const { data: creds } = await supabase
      .from("clinic_gsc_credentials")
      .select("clinic_id, refresh_token_enc")
      .not("refresh_token_enc", "is", null);

    const uniqueTokens = new Set<string>();
    for (const c of creds || []) {
      try {
        const rt = await decryptToken(c.refresh_token_enc);
        if (rt) uniqueTokens.add(rt);
      } catch (e) {
        console.warn("decrypt failed for clinic", c.clinic_id, e);
      }
    }

    // 2) Enumerate all sites across all refresh tokens
    const allSites: SiteEntry[] = [];
    const tokenErrors: string[] = [];
    for (const rt of uniqueTokens) {
      const at = await fetchAccessToken(rt);
      if (!at) { tokenErrors.push("token_refresh_failed"); continue; }
      const r = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
        headers: { Authorization: `Bearer ${at}` },
      });
      if (!r.ok) { tokenErrors.push(`sites_list_${r.status}`); continue; }
      const j = await r.json();
      for (const s of j.siteEntry || []) {
        if (["siteOwner", "siteFullUser", "siteRestrictedUser"].includes(s.permissionLevel)) {
          allSites.push({ site_url: s.siteUrl, permission_level: s.permissionLevel, refresh_token: rt });
        }
      }
    }

    // 3) Load unconnected clinics with a website
    const { data: connected } = await supabase
      .from("clinic_gsc_credentials")
      .select("clinic_id")
      .not("site_url", "is", null);
    const connectedIds = new Set((connected || []).map((c: any) => c.clinic_id));

    const { data: clinics } = await supabase
      .from("clinics")
      .select("id, clinic_name, website")
      .not("website", "is", null);

    const targets = (clinics || []).filter((c: any) =>
      !connectedIds.has(c.id) && c.website && c.website.trim() !== ""
    );

    // 4) Match each clinic to a site
    const matched: any[] = [];
    const unmatched: any[] = [];

    for (const clinic of targets) {
      const cNorm = normalize(clinic.website);
      const cRoot = rootDomain(cNorm);

      // score sites: 3 = exact, 2 = contains, 1 = root-domain match, 0 = none
      let best: { site: SiteEntry; score: number } | null = null;
      for (const s of allSites) {
        const sNorm = normalize(s.site_url);
        const sRoot = rootDomain(sNorm);
        let score = 0;
        if (sNorm === cNorm) score = 4;
        else if (sNorm.startsWith(cNorm) || cNorm.startsWith(sNorm)) score = 3;
        else if (sRoot && sRoot === cRoot) score = 2;
        else if (sNorm.includes(cRoot) || cNorm.includes(sRoot)) score = 1;

        // Prefer sc-domain: (domain properties) over URL prefix when tied
        if (best && score === best.score && s.site_url.startsWith("sc-domain:") && !best.site.site_url.startsWith("sc-domain:")) {
          best = { site: s, score };
        } else if (!best || score > best.score) {
          if (score > 0) best = { site: s, score };
        }
      }

      if (best && best.score >= 2) {
        matched.push({
          clinic_id: clinic.id,
          clinic_name: clinic.clinic_name,
          website: clinic.website,
          site_url: best.site.site_url,
          permission_level: best.site.permission_level,
          score: best.score,
        });
      } else {
        unmatched.push({
          clinic_id: clinic.id,
          clinic_name: clinic.clinic_name,
          website: clinic.website,
        });
      }
    }

    // 5) Upsert credentials for matched clinics (unless dry_run)
    const written: string[] = [];
    const writeErrors: any[] = [];
    if (!dryRun) {
      for (const m of matched) {
        const site = allSites.find(s => s.site_url === m.site_url)!;
        try {
          const enc = await encryptToken(site.refresh_token);
          const { error } = await supabase.from("clinic_gsc_credentials").upsert({
            clinic_id: m.clinic_id,
            site_url: m.site_url,
            site_display_name: String(m.site_url).replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/$/, ""),
            permission_level: m.permission_level ? String(m.permission_level).slice(0, 60) : null,
            refresh_token_enc: enc,
            connected_by: userId,
          }, { onConflict: "clinic_id" });
          if (error) { writeErrors.push({ clinic_id: m.clinic_id, error: error.message }); continue; }
          written.push(m.clinic_id);

          // Best-effort initial sync
          fetch(`${SUPABASE_URL}/functions/v1/sync-gsc-data`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ clinic_id: m.clinic_id, initial: true }),
          }).catch(() => {});
        } catch (e: any) {
          writeErrors.push({ clinic_id: m.clinic_id, error: String(e?.message || e) });
        }
      }
    }

    return new Response(JSON.stringify({
      dry_run: dryRun,
      tokens_used: uniqueTokens.size,
      total_sites_available: allSites.length,
      token_errors: tokenErrors,
      total_targets: targets.length,
      matched_count: matched.length,
      unmatched_count: unmatched.length,
      written_count: written.length,
      matched,
      unmatched,
      write_errors: writeErrors,
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("gsc-bulk-connect error:", err);
    return new Response(JSON.stringify({ error: "Internal server error", detail: String(err?.message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
