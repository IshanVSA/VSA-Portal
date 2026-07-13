import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_PAGES = 18;
const MAX_RAW_HTML_LENGTH = 2_000_000;
const MAX_PAGE_TEXT_LENGTH = 8000;
const MAX_COMBINED_TEXT_LENGTH = 160000;
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
    .replace(/<\/(h1|h2|h3|h4|h5|h6|li|ul|ol|section|article|div)>/gi, "\n")
    .replace(/<(h1|h2|h3|h4|h5|h6)[^>]*>/gi, "\n## ")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getTagContent(html: string, pattern: RegExp) {
  return html.match(pattern)?.[1]?.trim() ?? "";
}

function scoreUrlForExtraction(url: URL) {
  const pathname = url.pathname.toLowerCase();
  const pathAndQuery = `${pathname}${url.search.toLowerCase()}`;
  if (/\.(xml|pdf|jpg|jpeg|png|gif|webp|svg|zip|mp4|mp3|css|js|ico|woff2?)$/i.test(pathname)) return -100;
  if (/\/(wp-admin|wp-login|wp-json|feed|cart|checkout|my-account|login|signin|register|search|tag\/|category\/|author\/|\?add-to-cart|privacy|terms|cookie|sitemap)/i.test(pathAndQuery)) return -100;
  if (pathname === "/" || pathname === "") return -10;

  let score = 1;
  if (/(about|team|staff|doctors|our-team|our-doctors|our-practice|veterinarian|vet|meet)/.test(pathname)) score += 12;
  if (/(service|what-we-do|offering|specialt|treatment|care|procedure|surgery|dental|wellness|vaccin|nutrition|grooming|boarding|emergency|urgent|diagnostic|anesthesia|monitoring|end-of-life|euthanasia|exotic|dermatology|cardiology|oncology|orthoped|ultrasound|radiology|laser|behavior|pain|senior|puppy|kitten|dog|cat|pet)/.test(pathname)) score += 10;
  if (/(resource|form|appointment|booking|book|new-client|insurance|payment|faq|travel|poison|license|product-alert|food-alert|guide)/.test(pathname)) score += 7;
  if (/(contact|location|hours|visit|find-us|directions)/.test(pathname)) score += 6;
  if (/(history|story|mission|vision|values|philosophy|why|difference|community|awards|reviews|testimon)/.test(pathname)) score += 5;
  if (/(blog|news|article|education|tip|advice)/.test(pathname)) score += 1;
  if (/(lorem|ipsum|hello-world)/.test(pathname)) score -= 8;
  if ((pathname.match(/\//g)?.length ?? 0) > 5) score -= 2;
  return score;
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
      const score = scoreUrlForExtraction(resolved);

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
      return scoreUrlForExtraction(url) > 0;
    } catch { return false; }
  }).sort((a, b) => scoreUrlForExtraction(new URL(b)) - scoreUrlForExtraction(new URL(a)));
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
    const html = (await response.text()).slice(0, MAX_RAW_HTML_LENGTH);
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
      address: { type: "string", description: "Street address and locality if found" },
      email: { type: "string", description: "Primary email address if found" },
      emergency_info: { type: "string", description: "Emergency/urgent care instructions or after-hours information" },
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
        description: "Veterinarians and key staff. Include as many real people as the site provides.",
      },
      team_members: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            role: { type: "string" },
            bio_summary: { type: "string" },
          },
          required: ["name"],
        },
        description: "Non-doctor staff, leadership, technicians, reception, and support team members found on the site",
      },
      services_list: {
        type: "array",
        items: { type: "string" },
        description: "Exhaustive service names found across the crawled pages, not only the top services",
      },
      detailed_services: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            source_url: { type: "string" },
          },
          required: ["name"],
        },
        description: "Detailed service descriptions and source pages for every service page or service section found",
      },
      founding_year: { type: "string", description: "Year the clinic was founded" },
      about_us_content: { type: "string", description: "Detailed summary of the About Us / Our Story section" },
      mission_values: {
        type: "array",
        items: { type: "string" },
        description: "Mission, philosophy, values, promises, standards of care, and positioning statements found on the site",
      },
      patient_resources: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            source_url: { type: "string" },
          },
          required: ["title"],
        },
        description: "Forms, pharmacy, payment, new-client information, FAQs, education pages, or other client resources",
      },
      accreditations_awards: {
        type: "array",
        items: { type: "string" },
        description: "Accreditations, awards, associations, certifications, guarantees, or memberships",
      },
      social_links: {
        type: "array",
        items: { type: "string" },
        description: "Social profile URLs found on the website",
      },
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
      page_summaries: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            url: { type: "string" },
            summary: { type: "string" },
            key_findings: { type: "array", items: { type: "string" } },
          },
          required: ["url"],
        },
        description: "One entry for each source page analyzed, summarizing what useful data it contained",
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
      max_tokens: 8192,
      system: [
        "You are an expert at extracting veterinary clinic brand DNA from website content.",
        "Extract as much specific, useful information as possible from every crawled page, not just a short homepage summary.",
        "Extract all available information about the clinic: name, address, phone, email, hours, emergency details, booking URL, doctors and staff, services, founding year, about us content, mission/values, patient resources, awards/accreditations, social links, and brand identity.",
        "For doctors and team members, extract every real person listed with credentials, role, and short bio details when available.",
        "For services, be exhaustive. Include every service/treatment/care category found across service pages and include descriptions and source URLs in detailed_services.",
        "For page_summaries, include one concise but content-rich summary for each source page and list the key facts found on that page.",
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
    extracted.extraction_stats = {
      pages_scraped: pages.length,
      link_candidates: linkCandidates.length,
      sitemap_urls: sitemapUrls.length,
      total_text_characters: pages.reduce((sum, page) => sum + page.text.length, 0),
    };
    extracted.source_pages = pages.map((p) => ({
      url: p.url,
      title: p.title,
      description: p.description,
      text_preview: p.text.slice(0, 900),
    }));
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
