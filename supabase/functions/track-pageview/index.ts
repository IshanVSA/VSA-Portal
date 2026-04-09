import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Common bot User-Agent patterns
const BOT_PATTERNS = /bot|crawl|spider|slurp|mediapartners|facebookexternalhit|bingpreview|googlebot|yandex|baidu|duckduck|semrush|ahrefs|mj12bot|dotbot|rogerbot|screaming|lighthouse|pagespeed|gtmetrix|pingdom|uptimerobot|headlesschrome|phantomjs|prerender|wget|curl|python-requests|httpx|node-fetch|go-http-client|java\//i;

// In-memory dedup cache (per isolate lifetime, ~5-10 min)
const recentHits = new Map<string, number>();
const DEDUP_WINDOW_MS = 3000; // 3 seconds

function cleanDedup() {
  const now = Date.now();
  for (const [key, ts] of recentHits) {
    if (now - ts > DEDUP_WINDOW_MS * 2) recentHits.delete(key);
  }
}

// Simple in-memory geo cache to avoid repeated lookups for the same IP
const geoCache = new Map<string, { country_code: string | null; region: string | null; ts: number }>();
const GEO_CACHE_TTL_MS = 600_000; // 10 minutes

async function lookupGeo(ip: string): Promise<{ country_code: string | null; region: string | null }> {
  if (!ip || ip === "127.0.0.1" || ip === "::1") return { country_code: null, region: null };

  const cached = geoCache.get(ip);
  if (cached && Date.now() - cached.ts < GEO_CACHE_TTL_MS) {
    return { country_code: cached.country_code, region: cached.region };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,countryCode,regionName`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const json = await res.json();
      if (json.status === "success") {
        const result = { country_code: json.countryCode || null, region: json.regionName || null };
        geoCache.set(ip, { ...result, ts: Date.now() });
        // Prune cache if too large
        if (geoCache.size > 500) {
          const oldest = geoCache.keys().next().value;
          if (oldest) geoCache.delete(oldest);
        }
        return result;
      }
    }
    await res.text(); // consume body
  } catch {
    // Non-blocking: geo lookup failure is fine
  }
  return { country_code: null, region: null };
}

const PIXEL_JS = (clinicId: string, endpoint: string) => `
(function(){
  var sid = sessionStorage.getItem('_vsa_sid');
  if(!sid){sid=Math.random().toString(36).slice(2)+Date.now().toString(36);sessionStorage.setItem('_vsa_sid',sid);}
  var lastPath='';
  function track(){
    var p=location.pathname;
    if(p===lastPath)return;
    lastPath=p;
    var d={clinic_id:"${clinicId}",path:p,referrer_domain:document.referrer?new URL(document.referrer).hostname:"",session_id:sid};
    if(navigator.sendBeacon){navigator.sendBeacon("${endpoint}",JSON.stringify(d));}
    else{fetch("${endpoint}",{method:"POST",body:JSON.stringify(d),keepalive:true}).catch(function(){});}
  }
  if(document.visibilityState==='visible'){track();}else{document.addEventListener('visibilitychange',function f(){if(document.visibilityState==='visible'){track();document.removeEventListener('visibilitychange',f);}});}
  var pushState=history.pushState;
  history.pushState=function(){pushState.apply(history,arguments);track();};
  window.addEventListener("popstate",track);
})();
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // GET: serve the tracking pixel script
  if (req.method === "GET") {
    const clinicId = url.searchParams.get("clinic");
    if (!clinicId) {
      return new Response("// missing clinic param", {
        headers: { ...corsHeaders, "Content-Type": "application/javascript" },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const endpoint = `${supabaseUrl}/functions/v1/track-pageview`;
    return new Response(PIXEL_JS(clinicId, endpoint), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/javascript",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  // POST: record a page view
  if (req.method === "POST") {
    try {
      // Bot filtering via User-Agent
      const ua = req.headers.get("user-agent") || "";
      if (!ua || BOT_PATTERNS.test(ua)) {
        return new Response(JSON.stringify({ ok: true, filtered: "bot" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const body = await req.json();
      const { clinic_id, path, referrer_domain, session_id } = body;

      if (!clinic_id || !session_id) {
        return new Response(JSON.stringify({ error: "Missing clinic_id or session_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Validate clinic_id is a valid UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(clinic_id)) {
        return new Response(JSON.stringify({ error: "Invalid clinic_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Deduplication: same session + path within 3s window
      const cleanPath = (path || "/").split("?")[0].slice(0, 512);
      const dedupKey = `${session_id}:${cleanPath}`;
      const now = Date.now();
      cleanDedup();

      if (recentHits.has(dedupKey) && now - recentHits.get(dedupKey)! < DEDUP_WINDOW_MS) {
        return new Response(JSON.stringify({ ok: true, filtered: "dedup" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      recentHits.set(dedupKey, now);

      // Extract visitor IP for geolocation
      const visitorIp = (
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("cf-connecting-ip") ||
        req.headers.get("x-real-ip") ||
        ""
      );

      // Non-blocking geo lookup (with 2s timeout)
      const geo = await lookupGeo(visitorIp);

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      // Validate clinic exists
      const { data: clinic } = await supabase
        .from("clinics")
        .select("id")
        .eq("id", clinic_id)
        .maybeSingle();

      if (!clinic) {
        return new Response(JSON.stringify({ error: "Clinic not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Only store referrer domain, never full URL (may contain PII)
      const cleanReferrer = referrer_domain ? referrer_domain.slice(0, 255) : null;

      const { error } = await supabase.from("website_pageviews").insert({
        clinic_id,
        path: cleanPath,
        referrer: cleanReferrer,
        session_id: session_id.slice(0, 128),
        country_code: geo.country_code,
        region: geo.region,
      });

      if (error) {
        console.error("Insert error:", error);
        return new Response(JSON.stringify({ error: "Failed to record" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e) {
      console.error("Parse error:", e);
      return new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Method not allowed", { status: 405, headers: corsHeaders });
});
