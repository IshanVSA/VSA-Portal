import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_PAGES = 20;
const MAX_PAGE_TEXT_LENGTH = 12000;
const MAX_COMBINED_TEXT_LENGTH = 120000;
const FETCH_CONCURRENCY = 6;

const requestSchema = z.object({
  clinic_id: z.string().uuid(),
});

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitizeText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function getTagContent(html: string, pattern: RegExp) {
  return html.match(pattern)?.[1]?.trim() ?? "";
}

function extractCandidateLinks(html: string, baseUrl: string) {
  const base = new URL(baseUrl);
  const hrefMatches = [...html.matchAll(/href=["']([^"'#]+)["']/gi)];
  const scored = new Map<string, number>();

  hrefMatches.forEach((match) => {
    const rawHref = match[1]?.trim();
    if (!rawHref) return;
    try {
      const resolved = new URL(rawHref, base);
      if (resolved.origin !== base.origin) return;
      if (!["http:", "https:"].includes(resolved.protocol)) return;
      if (/\.(pdf|jpg|jpeg|png|gif|webp|svg|zip|mp4|mp3|css|js|ico|woff2?)$/i.test(resolved.pathname)) return;
      if (/\/(wp-admin|wp-login|wp-json|feed|cart|checkout|my-account|login|signin|register|search|tag\/|category\/|author\/|\?add-to-cart|privacy|terms|cookie|sitemap)/i.test(resolved.pathname + resolved.search)) return;

      const pathname = resolved.pathname.toLowerCase();
      let score = 1; // baseline: any same-origin internal page is worth a look
      if (/(about|team|staff|doctors|our-team|our-doctors|our-practice|veterinarian|vet|meet)/.test(pathname)) score += 8;
      if (/(service|what-we-do|offering|specialt|treatment|care|procedure|surgery|dental|wellness|vaccin|nutrition|grooming|boarding|emergency|urgent|exotic|dermatology|cardiology|oncology|orthoped|ultrasound|radiology|laser|behavior|pain|senior|puppy|kitten|dog|cat|pet)/.test(pathname)) score += 6;
      if (/(contact|location|hours|visit|find-us|directions|appointment|booking|book)/.test(pathname)) score += 5;
      if (/(history|story|mission|vision|values|philosophy|why|difference|community|awards|reviews|testimon)/.test(pathname)) score += 4;
      if (/(faq|resource|blog|news|article|education|guide|tip|advice|price|cost|financing|insurance|payment)/.test(pathname)) score += 2;
      if (pathname === "/" || pathname === "") score = -10;
      if ((pathname.match(/\//g)?.length ?? 0) > 5) score -= 2; // deep archive pages

      if (score > 0) {
        resolved.hash = "";
        resolved.search = "";
        const key = resolved.toString();
        scored.set(key, Math.max(scored.get(key) ?? 0, score));
      }
    } catch {
      // skip
    }
  });

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([url]) => url);
}

async function fetchSitemapUrls(origin: string): Promise<string[]> {
  const candidates = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/wp-sitemap.xml`];
  const out = new Set<string>();
  for (const sm of candidates) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(sm, { signal: controller.signal, redirect: "follow" });
      clearTimeout(t);
      if (!res.ok) continue;
      const xml = (await res.text()).slice(0, 500000);
      // Recurse into nested sitemaps
      const nested = [...xml.matchAll(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/gi)].map((m) => m[1]);
      for (const n of nested.slice(0, 5)) {
        try {
          const r2 = await fetch(n, { redirect: "follow" });
          if (!r2.ok) continue;
          const x2 = (await r2.text()).slice(0, 500000);
          for (const m of x2.matchAll(/<loc>([^<]+)<\/loc>/gi)) out.add(m[1].trim());
        } catch { /* ignore */ }
      }
      for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/gi)) out.add(m[1].trim());
      if (out.size > 0) break;
    } catch { /* ignore */ }
  }
  return [...out].filter((u) => {
    try {
      const url = new URL(u);
      if (url.origin !== origin) return false;
      if (/\.(xml|pdf|jpg|jpeg|png|gif|webp|svg|zip|mp4|mp3|css|js|ico|woff2?)$/i.test(url.pathname)) return false;
      return true;
    } catch { return false; }
  });
}

type PageData = { url: string; title: string; description: string; html: string; text: string };

async function fetchPage(url: string): Promise<PageData | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; VSABrandDNAExtractor/1.0)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) return null;
    const html = (await response.text()).slice(0, 200000);
    const title = getTagContent(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const description = getTagContent(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i);
    const text = sanitizeText(html).slice(0, MAX_PAGE_TEXT_LENGTH);
    if (!text) return null;
    return { url: response.url, title, description, html, text };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const extractionTool = {
  name: "extract_brand_dna",
  description: "Extract brand DNA fields from veterinary clinic website content.",
  input_schema: {
    type: "object",
    properties: {
      hospital_name: { type: "string", description: "Official clinic/hospital name" },
      phone: { type: "string", description: "Primary phone number" },
      booking_url: { type: "string", description: "Online booking URL if found" },
      hours: { type: "string", description: "Operating hours summary" },
      doctors: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            credentials: { type: "string", description: "DVM, DACVS, etc." },
            role: { type: "string", description: "Owner, Associate, etc." },
          },
          required: ["name"],
        },
        description: "Veterinarians and key staff",
      },
      services_list: {
        type: "array",
        items: { type: "string" },
        description: "Top services offered (e.g. dentistry, surgery, wellness exams)",
      },
      founding_year: { type: "string", description: "Year the clinic was founded" },
      about_us_content: { type: "string", description: "Summary of the About Us / Our Story section" },
      brand_identity: {
        type: "object",
        properties: {
          tagline: { type: "string", description: "Clinic tagline or slogan" },
          tone: { type: "string", description: "Brand tone: warm, clinical, playful, professional, etc." },
          values: { type: "array", items: { type: "string" }, description: "Core values mentioned" },
          primary_brand_color: { type: "string", description: "Primary brand color as hex code (e.g. #2B6CB0) extracted from the website's dominant color scheme, logo, or header" },
          secondary_brand_color: { type: "string", description: "Secondary brand color as hex code" },
          brand_font: { type: "string", description: "Primary font family used on the website (e.g. Montserrat, Open Sans)" },
          logo_url: { type: "string", description: "URL of the clinic logo image found on the website" },
          visual_tone: { type: "string", description: "Visual style: modern, rustic, clinical, whimsical, minimalist, etc." },
        },
      },
      confidence: { type: "string", enum: ["low", "medium", "high"], description: "Overall confidence in extraction" },
    },
    required: ["hospital_name"],
  },
};

async function extractWithAi(pages: PageData[]) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const combinedPages = pages
    .map((page, i) =>
      [`Page ${i + 1}`, `URL: ${page.url}`, page.title ? `Title: ${page.title}` : "", page.description ? `Description: ${page.description}` : "", `Content: ${page.text}`]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n---\n\n")
    .slice(0, MAX_COMBINED_TEXT_LENGTH);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      system: [
        "You are an expert at extracting veterinary clinic brand DNA from website content.",
        "Extract all available information about the clinic: name, phone, hours, booking URL, doctors (with credentials), services, founding year, about us content, and brand identity.",
        "For doctors, extract their full name, credentials (DVM, DACVS, etc.), and role (Owner, Associate, etc.).",
        "For services, list the top/highlighted services offered.",
        "For brand identity, identify: tagline/slogan, overall tone, stated values/mission, PRIMARY brand color (the dominant color used in the header/logo/buttons as a hex code), secondary brand color, the primary font family, the logo image URL (look for <img> tags with 'logo' in src or alt), and visual tone (modern, rustic, clinical, whimsical, minimalist).",
        "For colors, look at inline styles, CSS classes, header/nav background colors, button colors, and the overall color scheme. Return hex codes like #2B6CB0.",
        "For fonts, look at font-family declarations in inline styles or common web font references.",
        "For logo, find <img> tags where the src or alt contains 'logo'. Return the full absolute URL.",
        "Only include fields you can confidently extract from the content provided.",
      ].join(" "),
      messages: [
        {
          role: "user",
          content: `Extract brand DNA from this veterinary clinic website:\n\n${combinedPages}`,
        },
      ],
      tools: [extractionTool],
      tool_choice: { type: "tool", name: "extract_brand_dna" },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 400 && text.includes("credit balance is too low")) {
      throw new Error("Anthropic API credit balance is too low. Please top up your Anthropic account at https://console.anthropic.com to continue using AI features.");
    }
    throw new Error(`AI extraction failed [${response.status}]: ${text}`);
  }

  const data = await response.json();
  const toolBlock = data.content?.find((b: any) => b.type === "tool_use" && b.name === "extract_brand_dna");
  if (!toolBlock?.input) throw new Error("AI extraction returned no structured result");

  return toolBlock.input;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return createJsonResponse({ error: "Unauthorized" }, 401);
    }

    const token = authorization.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return createJsonResponse({ error: "Unauthorized" }, 401);

    // Only admin/concierge can run extraction
    const { data: roleRow } = await serviceClient.from("user_roles").select("role").eq("user_id", authData.user.id).maybeSingle();
    if (!roleRow || roleRow.role === "client") {
      return createJsonResponse({ error: "Only staff can run website extraction" }, 403);
    }

    // Parse request
    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) return createJsonResponse({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);

    const { clinic_id } = parsed.data;

    // Get clinic website
    const { data: clinic, error: clinicError } = await serviceClient
      .from("clinics")
      .select("website, clinic_name")
      .eq("id", clinic_id)
      .maybeSingle();

    if (clinicError || !clinic) return createJsonResponse({ error: "Clinic not found" }, 404);
    if (!clinic.website) return createJsonResponse({ error: "Clinic has no website URL configured" }, 422);

    console.log(`Extracting brand DNA for clinic: ${clinic.clinic_name} (${clinic.website})`);

    // Scrape website
    let websiteUrl = clinic.website.trim();
    if (!/^https?:\/\//i.test(websiteUrl)) websiteUrl = `https://${websiteUrl}`;

    const homepage = await fetchPage(websiteUrl);
    if (!homepage) return createJsonResponse({ error: "Unable to read the clinic website. Please verify the URL." }, 422);

    const homepageOrigin = new URL(homepage.url).origin;
    const linkCandidates = extractCandidateLinks(homepage.html, homepage.url);
    const sitemapUrls = await fetchSitemapUrls(homepageOrigin);

    // Merge: prioritize link-scored pages, then top up from sitemap (skip dupes / homepage)
    const seen = new Set<string>([homepage.url]);
    const merged: string[] = [];
    for (const u of linkCandidates) {
      if (seen.has(u)) continue;
      seen.add(u);
      merged.push(u);
    }
    for (const u of sitemapUrls) {
      if (seen.has(u)) continue;
      seen.add(u);
      merged.push(u);
    }
    const toFetch = merged.slice(0, MAX_PAGES - 1);

    // Fetch with limited concurrency
    const extraPages: PageData[] = [];
    for (let i = 0; i < toFetch.length; i += FETCH_CONCURRENCY) {
      const chunk = toFetch.slice(i, i + FETCH_CONCURRENCY);
      const results = await Promise.all(chunk.map((url) => fetchPage(url)));
      for (const p of results) if (p) extraPages.push(p);
    }

    const pages = [homepage, ...extraPages]
      .filter((page, i, all) => all.findIndex((p) => p.url === page.url) === i)
      .slice(0, MAX_PAGES);

    console.log(`Scraped ${pages.length} pages (link candidates: ${linkCandidates.length}, sitemap urls: ${sitemapUrls.length})`);

    // AI extraction
    const extracted = await extractWithAi(pages);
    extracted.source_urls = pages.map((p) => p.url);
    extracted.extracted_at = new Date().toISOString();

    console.log(`Extraction complete. Confidence: ${extracted.confidence}`);

    // Upsert into clinic_brand_dna
    const { data: existing } = await serviceClient
      .from("clinic_brand_dna")
      .select("id, additional_fields")
      .eq("clinic_id", clinic_id)
      .maybeSingle();

    const additionalFields = (existing?.additional_fields as Record<string, unknown>) || {};
    additionalFields.website_extraction = extracted;
    
    // Store brand identity fields at top level for easy access by synthesize-dna
    const brandIdentity = extracted.brand_identity || {};
    if (brandIdentity.primary_brand_color) additionalFields.primary_brand_color = brandIdentity.primary_brand_color;
    if (brandIdentity.secondary_brand_color) additionalFields.secondary_brand_color = brandIdentity.secondary_brand_color;
    if (brandIdentity.brand_font) additionalFields.brand_font = brandIdentity.brand_font;
    if (brandIdentity.logo_url) additionalFields.logo_url = brandIdentity.logo_url;
    if (brandIdentity.visual_tone) additionalFields.visual_style = brandIdentity.visual_tone;

    if (existing) {
      const { error: updateError } = await serviceClient
        .from("clinic_brand_dna")
        .update({
          additional_fields: additionalFields,
          website_extracted_at: new Date().toISOString(),
        })
        .eq("clinic_id", clinic_id);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await serviceClient
        .from("clinic_brand_dna")
        .insert({
          clinic_id,
          additional_fields: additionalFields,
          website_extracted_at: new Date().toISOString(),
          status: "draft",
          submitted_by: authData.user.id,
        });
      if (insertError) throw insertError;
    }

    return createJsonResponse({ success: true, extracted });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("extract-brand-dna error:", error);
    return createJsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
