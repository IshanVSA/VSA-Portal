import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MAX_PAGES = 5;
const MAX_PAGE_TEXT_LENGTH = 6000;
const MAX_COMBINED_TEXT_LENGTH = 18000;

const requestSchema = z.object({
  website: z.string().trim().min(1).max(500),
});

const extractionTool = {
  name: "extract_clinic_details",
  description: "Extract the primary clinic's public contact details and timezone from website content.",
  input_schema: {
    type: "object",
    properties: {
      clinic_name: { type: "string" },
      phone: { type: "string" },
      email: { type: "string" },
      // Structured address — required to be the FULL postal address.
      street: { type: "string", description: "Street number and name, e.g. '5020 48 Ave' or '123 Main Street, Suite 4'." },
      city: { type: "string", description: "City / municipality only, e.g. 'Delta'." },
      region: { type: "string", description: "Province or state, full name or abbreviation, e.g. 'BC' or 'British Columbia'." },
      postal_code: { type: "string", description: "Postal code (Canadian like 'V4K 3V3') or US ZIP ('98101' / '98101-1234')." },
      country: { type: "string", description: "Country name, e.g. 'Canada' or 'United States'." },
      address: { type: "string", description: "Full single-line postal address combining street, city, region, postal/ZIP, country, exactly as printed on the website (footer / Contact page / schema.org JSON-LD). Must include street number AND postal/ZIP code. Never return a city-only or region-only value — set to null instead." },
      website: { type: "string" },
      timezone: { type: "string", description: "IANA timezone inferred from the clinic address, like America/New_York" },
      notes: { type: "string" },
      confidence: { type: "string", enum: ["low", "medium", "high"] },
    },
    required: [],
  },
} as const;

type PageData = {
  url: string;
  title: string;
  description: string;
  html: string;
  text: string;
};

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isPrivateIp(hostname: string) {
  if (/^127\./.test(hostname) || /^10\./.test(hostname) || /^0\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^169\.254\./.test(hostname)) return true;

  const match172 = hostname.match(/^172\.(\d{1,3})\./);
  if (match172) {
    const secondOctet = Number(match172[1]);
    if (secondOctet >= 16 && secondOctet <= 31) return true;
  }

  return false;
}

function assertSafeHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  if (
    normalized === "localhost" ||
    normalized.endsWith(".local") ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    isPrivateIp(normalized)
  ) {
    throw new Error("Private or local website URLs are not allowed");
  }
}

function normalizeWebsiteUrl(input: string) {
  const trimmed = input.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Website URL must use http or https");
  }

  if (url.username || url.password) {
    throw new Error("Website URL cannot include credentials");
  }

  assertSafeHostname(url.hostname);
  url.hash = "";
  return url.toString();
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

/** Pull all <script type="application/ld+json"> blocks (raw JSON strings). */
function extractJsonLdBlocks(html: string): string[] {
  const out: string[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1]?.trim();
    if (raw) out.push(raw.slice(0, 4000));
  }
  return out.slice(0, 5);
}

/** Pull <footer>…</footer> sanitized text (footers usually contain the full address). */
function extractFooterText(html: string): string {
  const m = html.match(/<footer[\s\S]*?<\/footer>/i);
  if (!m) return "";
  return sanitizeText(m[0]).slice(0, 2000);
}

const POSTAL_RE = /([A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d|\d{5}(?:-\d{4})?)/;

function composeAddress(parts: {
  street?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country?: string | null;
}): string | null {
  const ordered = [parts.street, parts.city, parts.region, parts.postal_code, parts.country]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
  if (!ordered.length) return null;
  // street, city, "region postal", country
  const left = [parts.street, parts.city].map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean);
  const regionPostal = [parts.region, parts.postal_code]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean)
    .join(" ");
  const tail = parts.country ? String(parts.country).trim() : "";
  return [...left, regionPostal, tail].filter(Boolean).join(", ");
}

/** A "complete" address has a street number AND a postal/ZIP code. */
function isCompleteAddress(addr: string | null | undefined): boolean {
  if (!addr) return false;
  const s = String(addr);
  if (!/\d/.test(s)) return false; // need a street number
  if (!POSTAL_RE.test(s)) return false; // need postal/ZIP
  return true;
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
      if (/\.(pdf|jpg|jpeg|png|gif|webp|svg|zip)$/i.test(resolved.pathname)) return;

      const pathname = resolved.pathname.toLowerCase();
      let score = 0;
      if (/(contact|about|location|locations|clinic|hospital|team|staff|our-practice|hours)/.test(pathname)) score += 5;
      if (pathname === "/" || pathname === "") score -= 10;

      if (score > 0) {
        resolved.hash = "";
        scored.set(resolved.toString(), Math.max(scored.get(resolved.toString()) ?? 0, score));
      }
    } catch {
      // Ignore malformed links
    }
  });

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([url]) => url)
    .slice(0, MAX_PAGES - 1);
}

async function fetchPage(url: string): Promise<PageData | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LovableClinicExtractor/1.0; +https://lovable.dev)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) return null;

    const html = (await response.text()).slice(0, 150000);
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

function isValidTimeZone(timeZone?: string | null) {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

async function requireAdmin(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authorization.replace("Bearer ", "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl) throw new Error("SUPABASE_URL is not configured");
  if (!anonKey) throw new Error("SUPABASE_ANON_KEY is not configured");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: roleRow, error: roleError } = await serviceClient
    .from("user_roles")
    .select("role")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (roleError) {
    throw new Error(`Failed to verify user role: ${roleError.message}`);
  }

  const DEBRAJ_USER_ID = "ac32880b-4a29-4617-9ab9-d4b28ed7b998";
  const isDebraj =
    authData.user.id === DEBRAJ_USER_ID ||
    authData.user.email?.toLowerCase() === "debraj@vsavetmedia.ca";

  if (roleRow?.role !== "admin" && !isDebraj) {
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

async function callAnthropic(
  anthropicKey: string,
  systemPrompt: string,
  userContent: string,
) {
  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
      tools: [extractionTool],
      tool_choice: { type: "tool", name: "extract_clinic_details" },
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Response(JSON.stringify({ error: "Rate limited. Please try again shortly." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const text = await response.text();
    if (response.status === 400 && text.includes("credit balance is too low")) {
      throw new Error("Anthropic API credit balance is too low. Please top up your Anthropic account at https://console.anthropic.com to continue using AI features.");
    }
    throw new Error(`AI extraction failed [${response.status}]: ${text}`);
  }

  const data = await response.json();
  const toolBlock = data.content?.find((b: any) => b.type === "tool_use" && b.name === "extract_clinic_details");
  if (!toolBlock?.input) throw new Error("AI extraction returned no structured result");
  return toolBlock.input as Record<string, any>;
}

async function extractWithAi(website: string, pages: PageData[]) {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const combinedPages = pages
    .map((page, index) => {
      const section = [
        `Page ${index + 1}`,
        `URL: ${page.url}`,
        page.title ? `Title: ${page.title}` : "",
        page.description ? `Description: ${page.description}` : "",
        `Content: ${page.text}`,
      ].filter(Boolean).join("\n");
      return section;
    })
    .join("\n\n---\n\n")
    .slice(0, MAX_COMBINED_TEXT_LENGTH);

  // Boost the address signal with footer text + JSON-LD blocks from every fetched page.
  const footerSections: string[] = [];
  const jsonLdSections: string[] = [];
  for (const page of pages) {
    const footer = extractFooterText(page.html);
    if (footer) footerSections.push(`Footer (${page.url}):\n${footer}`);
    for (const block of extractJsonLdBlocks(page.html)) {
      jsonLdSections.push(`JSON-LD (${page.url}):\n${block}`);
    }
  }
  const footerBlob = footerSections.join("\n\n").slice(0, 4000);
  const jsonLdBlob = jsonLdSections.join("\n\n").slice(0, 6000);

  const baseSystem = [
    "You extract public clinic details from website content.",
    "Return only fields you can support from the provided pages.",
    "Infer timezone from the address using a valid IANA timezone like America/New_York.",
    "If multiple locations exist, choose the primary/main clinic or the best-supported single location.",
    "Use the provided website as the canonical website field unless a clearer canonical URL is shown.",
    "ADDRESS RULES: Always return the FULL postal address. Fill street, city, region, postal_code, country as separate fields, and also compose a single-line `address` exactly as printed on the site (typically in the footer, Contact page, or schema.org JSON-LD / PostalAddress block).",
    "The address MUST contain the street number AND the postal/ZIP code. Never return a city-only or region-only address. If you cannot confidently locate the full street address with postal/ZIP, set address (and the missing sub-fields) to null and lower confidence to 'low'.",
  ].join(" ");

  const buildUserContent = (extraNote = "") =>
    `Website: ${website}\n\n` +
    (footerBlob ? `=== Page footers (often contain the full address) ===\n${footerBlob}\n\n` : "") +
    (jsonLdBlob ? `=== Schema.org JSON-LD blocks (PostalAddress / LocalBusiness) ===\n${jsonLdBlob}\n\n` : "") +
    `=== Website pages ===\n${combinedPages}` +
    (extraNote ? `\n\n=== IMPORTANT ===\n${extraNote}` : "");

  let parsed = await callAnthropic(anthropicKey, baseSystem, buildUserContent());

  let composed = composeAddress({
    street: parsed.street,
    city: parsed.city,
    region: parsed.region,
    postal_code: parsed.postal_code,
    country: parsed.country,
  });
  let addressOut = composed && isCompleteAddress(composed)
    ? composed
    : (typeof parsed.address === "string" && isCompleteAddress(parsed.address) ? parsed.address.trim() : null);

  // Retry once if the model returned an incomplete address but raw signals look usable.
  if (!addressOut && (footerBlob || jsonLdBlob)) {
    parsed = await callAnthropic(
      anthropicKey,
      baseSystem,
      buildUserContent(
        "Your previous answer was missing the full street address. Re-read the footer and JSON-LD PostalAddress blocks above and return the COMPLETE address with street number, street name, city, province/state, postal/ZIP code, and country. If still impossible, set address to null.",
      ),
    );
    composed = composeAddress({
      street: parsed.street,
      city: parsed.city,
      region: parsed.region,
      postal_code: parsed.postal_code,
      country: parsed.country,
    });
    addressOut = composed && isCompleteAddress(composed)
      ? composed
      : (typeof parsed.address === "string" && isCompleteAddress(parsed.address) ? parsed.address.trim() : null);
  }

  const timezone = isValidTimeZone(parsed.timezone) ? parsed.timezone : null;

  return {
    clinic_name: typeof parsed.clinic_name === "string" ? parsed.clinic_name.trim() : null,
    phone: typeof parsed.phone === "string" ? parsed.phone.trim() : null,
    email: typeof parsed.email === "string" ? parsed.email.trim() : null,
    address: addressOut,
    website: typeof parsed.website === "string" ? parsed.website.trim() : website,
    timezone,
    notes: typeof parsed.notes === "string" ? parsed.notes.trim() : null,
    confidence: typeof parsed.confidence === "string" ? parsed.confidence : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    await requireAdmin(req);

    const parsedBody = requestSchema.safeParse(await req.json());
    if (!parsedBody.success) {
      return createJsonResponse({ error: parsedBody.error.issues[0]?.message ?? "Invalid request" }, 400);
    }

    const normalizedWebsite = normalizeWebsiteUrl(parsedBody.data.website);
    const homepage = await fetchPage(normalizedWebsite);
    if (!homepage) {
      return createJsonResponse({ error: "Unable to read that website. Please verify the URL and try again." }, 422);
    }

    const candidateUrls = extractCandidateLinks(homepage.html, homepage.url);
    const extraPages = (await Promise.all(candidateUrls.map((url) => fetchPage(url))))
      .filter((page): page is PageData => Boolean(page));

    const pages = [homepage, ...extraPages]
      .filter((page, index, allPages) => allPages.findIndex((candidate) => candidate.url === page.url) === index)
      .slice(0, MAX_PAGES);

    const fields = await extractWithAi(normalizedWebsite, pages);

    return createJsonResponse({
      fields: {
        ...fields,
        source_urls: pages.map((page) => page.url),
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;

    console.error("extract-clinic-website error:", error);
    return createJsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});