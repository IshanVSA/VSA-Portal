import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const requestSchema = z.object({
  clinic_id: z.string().uuid(),
});

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Name-match validation ──────────────────────────────────────────
const STOP_WORDS = new Set([
  "the", "and", "of", "a", "an", "in", "at", "on", "for", "to", "is",
  "ltd", "llc", "inc", "corp", "co", "&",
]);

function tokenize(name: string): Set<string> {
  return new Set(
    name.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter(w => w.length > 1 && !STOP_WORDS.has(w))
  );
}

function namesMatch(clinicName: string, googleName: string): boolean {
  const clinicTokens = tokenize(clinicName);
  const googleTokens = tokenize(googleName);
  let overlap = 0;
  for (const t of clinicTokens) {
    if (googleTokens.has(t)) overlap++;
  }
  return overlap >= 1;
}

class PlacesApiError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "PlacesApiError";
    this.status = status;
  }
}

type PlacesCredentials =
  | { mode: "gateway"; connectionApiKey: string; lovableApiKey: string }
  | { mode: "direct"; apiKey: string };

function getPlacesCredentials(): PlacesCredentials | null {
  const connectionApiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  if (connectionApiKey && lovableApiKey) {
    return { mode: "gateway", connectionApiKey, lovableApiKey };
  }

  const directApiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
  if (directApiKey) {
    return { mode: "direct", apiKey: directApiKey };
  }

  return null;
}

async function fetchPlacesApi(
  path: string,
  credentials: PlacesCredentials,
  options: { method?: string; fieldMask: string; body?: unknown },
) {
  const url = credentials.mode === "gateway"
    ? `https://connector-gateway.lovable.dev/google_maps/places${path}`
    : `https://places.googleapis.com${path}`;

  const headers: Record<string, string> = {
    "X-Goog-FieldMask": options.fieldMask,
  };

  if (credentials.mode === "gateway") {
    headers.Authorization = `Bearer ${credentials.lovableApiKey}`;
    headers["X-Connection-Api-Key"] = credentials.connectionApiKey;
  } else {
    headers["X-Goog-Api-Key"] = credentials.apiKey;
  }

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    method: options.method || (options.body === undefined ? "GET" : "POST"),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const googleStatus = data?.error?.status || data?.type || "UNKNOWN";
    const googleMessage = data?.error?.message || data?.message || res.statusText || "Unknown Places API error";
    console.log(`Places API error (${res.status}/${googleStatus}):`, JSON.stringify(data).slice(0, 500));

    if (res.status === 401 && credentials.mode === "gateway") {
      throw new PlacesApiError(
        "Google Maps connector authentication failed. Please reconnect the Google Maps Platform connector or rotate LOVABLE_API_KEY.",
        502,
      );
    }

    if (res.status === 403 || googleStatus === "PERMISSION_DENIED") {
      const source = credentials.mode === "gateway"
        ? "Google Maps connector"
        : "GOOGLE_PLACES_API_KEY";
      throw new PlacesApiError(
        `${source} cannot access Places API (New). Please make sure Places API (New) is enabled and the key is not restricted in a way that blocks Supabase Edge Functions.`,
        502,
      );
    }

    if (res.status >= 500 || res.status === 429) {
      throw new PlacesApiError(`Google Places API temporarily unavailable: ${googleMessage}`, 502);
    }

    throw new PlacesApiError(`Google Places API error: ${googleMessage}`, 502);
  }

  return data;
}

// ── Places API helpers ─────────────────────────────────────────────
// Extract "City, ST" from a full address like "2308 Lombard St, San Francisco, CA 94123"
function extractCityRegion(address: string): string {
  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 3) {
    // e.g. ["2308 Lombard St", "San Francisco", "CA 94123"] -> "San Francisco, CA"
    const city = parts[parts.length - 2];
    const stateZip = parts[parts.length - 1].split(/\s+/)[0];
    return `${city}, ${stateZip}`;
  }
  return parts.slice(-2).join(", ");
}

async function searchVetPlace(clinicName: string, address: string, credentials: PlacesCredentials) {
  const cityRegion = extractCityRegion(address);
  // Progressively broaden the query. Full street address is often too specific
  // and returns zero results from Places API (New) textSearch.
  const queries = [
    `${clinicName} ${cityRegion}`.trim(),
    `${clinicName} veterinary ${cityRegion}`.trim(),
    `${clinicName} animal hospital ${cityRegion}`.trim(),
    `${clinicName} ${address}`.trim(),
    clinicName.trim(),
  ].filter((q, i, arr) => q && arr.indexOf(q) === i);

  for (const query of queries) {
    console.log(`Searching Places: "${query}"`);
    const data = await fetchPlacesApi("/v1/places:searchText", credentials, {
      method: "POST",
      fieldMask: "places.id,places.displayName,places.formattedAddress,places.types",
      body: {
        textQuery: query,
        includedType: "veterinary_care",
      },
    });
    const places = data.places || [];
    console.log(`  → ${places.length} results`);
    for (const place of places.slice(0, 5)) {
      const displayName = place.displayName?.text || place.displayName || "";
      if (namesMatch(clinicName, displayName)) {
        console.log(`Matched: "${displayName}" (id: ${place.id})`);
        return { placeId: place.id, displayName };
      }
      console.log(`  skip "${displayName}" — no name overlap with "${clinicName}"`);
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Auth gate — staff only (admin or concierge)
    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return jsonRes({ error: "Unauthorized" }, 401);
    const token = authorization.replace(/^Bearer\s+/i, "");
    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData?.user) return jsonRes({ error: "Unauthorized" }, 401);
    const sb = createClient(supabaseUrl, serviceKey);
    const { data: roleRow } = await sb.from("user_roles").select("role").eq("user_id", authData.user.id).maybeSingle();
    if (!roleRow || (roleRow.role !== "admin" && roleRow.role !== "concierge")) {
      return jsonRes({ error: "Forbidden" }, 403);
    }

    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) return jsonRes({ error: "Invalid request" }, 400);
    const { clinic_id } = parsed.data;

    const googleKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;

    if (!googleKey) {
      return jsonRes({
        error: "Google Places API key not configured. Add GOOGLE_PLACES_API_KEY with Places API (New) enabled to mine reviews.",
      }, 500);
    }

    // Fetch clinic
    const { data: clinic, error: clinicErr } = await sb
      .from("clinics")
      .select("id, clinic_name, address, website, google_place_id")
      .eq("id", clinic_id)
      .single();
    if (clinicErr || !clinic) return jsonRes({ error: "Clinic not found" }, 404);

    // Check CVBC jurisdiction
    const { data: gbpConfig } = await sb
      .from("clinic_gbp_config")
      .select("jurisdiction")
      .eq("clinic_id", clinic_id)
      .maybeSingle();

    if (gbpConfig?.jurisdiction === "CVBC") {
      return jsonRes({
        skipped: true,
        reason: "Review mining is unavailable for BC clinics (CVBC jurisdiction). Veterinary advertising regulations in British Columbia prohibit the use of testimonials and reviews in marketing materials.",
      });
    }

    // ── Resolve Place ID with validation ───────────────────────────
    let placeId = clinic.google_place_id;
    let needsSearch = !placeId;

    // If we have a stored Place ID, validate it matches the clinic
    if (placeId) {
      const detailsRes = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
        headers: {
          "X-Goog-Api-Key": googleKey,
          "X-Goog-FieldMask": "displayName",
        },
      });
      const detailsData = await detailsRes.json();
      const storedName = detailsData.displayName?.text || detailsData.displayName || "";
      console.log(`Stored Place ID "${placeId}" resolves to: "${storedName}"`);

      if (!namesMatch(clinic.clinic_name, storedName)) {
        console.log(`Name mismatch! Clinic: "${clinic.clinic_name}" vs Google: "${storedName}". Will re-search.`);
        placeId = null;
        needsSearch = true;
      }
    }

    // Search for the correct Place ID
    if (needsSearch) {
      const result = await searchVetPlace(clinic.clinic_name, clinic.address || "", googleKey);
      if (result) {
        placeId = result.placeId;
        // Persist corrected Place ID
        await sb.from("clinics").update({ google_place_id: placeId }).eq("id", clinic_id);
        console.log(`Updated google_place_id to "${placeId}" (${result.displayName})`);
      } else {
        return jsonRes({
          error: "Could not find this clinic on Google Maps. Please verify the clinic name and address are correct.",
        }, 404);
      }
    }

    // Fetch reviews using Places API (New)
    const detailsRes = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: {
        "X-Goog-Api-Key": googleKey,
        "X-Goog-FieldMask": "displayName,rating,userRatingCount,reviews",
      },
    });
    const detailsData = await detailsRes.json();
    console.log("Place details keys:", Object.keys(detailsData));

    if (detailsData.error) {
      return jsonRes({ error: `Google Places API error: ${detailsData.error.message}` }, 502);
    }

    const rawReviews = detailsData.reviews || [];
    const reviews = rawReviews.map((r: any) => ({
      text: r.text?.text || r.originalText?.text || "",
      rating: r.rating || 0,
      author: r.authorAttribution?.displayName || "Anonymous",
    })).filter((r: any) => r.text);
    const avgRating = detailsData.rating || 0;
    const totalReviews = detailsData.userRatingCount || 0;

    if (reviews.length === 0) {
      return jsonRes({ error: "No reviews found for this clinic on Google" }, 404);
    }

    // Prepare review text for AI
    const reviewText = reviews.map((r: any, i: number) =>
      `Review ${i + 1} (${r.rating}★): ${r.text}`
    ).join("\n\n");

    // AI extraction via Claude
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 2000,
        system: `You are a veterinary clinic brand analyst. Analyze Google reviews to extract brand insights. Focus on recurring themes, language patterns from happy clients, and genuine differentiators that appear across multiple reviews. Be concise and data-driven.`,
        messages: [
          {
            role: "user",
            content: `Analyze these ${reviews.length} Google reviews for "${clinic.clinic_name}" (avg rating: ${avgRating}★, total reviews: ${totalReviews}):\n\n${reviewText}`,
          },
        ],
        tools: [
          {
            name: "extract_review_insights",
            description: "Extract structured brand insights from Google reviews",
            input_schema: {
              type: "object",
              required: ["top_themes", "voice_fingerprint_seeds", "differentiator_signals", "sentiment_summary", "confidence"],
              properties: {
                top_themes: {
                  type: "array",
                  description: "Top 3 recurring themes clients mention",
                  items: {
                    type: "object",
                    required: ["theme", "frequency", "example_quotes"],
                    properties: {
                      theme: { type: "string", description: "Theme name (e.g., 'Gentle with anxious pets')" },
                      frequency: { type: "string", description: "How often this theme appears (e.g., '7 of 10 reviews')" },
                      example_quotes: {
                        type: "array",
                        items: { type: "string" },
                        description: "2-3 short direct quotes illustrating this theme",
                      },
                    },
                  },
                },
                voice_fingerprint_seeds: {
                  type: "array",
                  items: { type: "string" },
                  description: "5-8 recurring phrases or language patterns from positive reviews that capture how clients naturally describe this clinic",
                },
                differentiator_signals: {
                  type: "array",
                  description: "Themes that recur across multiple reviews indicating genuine clinic differentiators",
                  items: {
                    type: "object",
                    required: ["signal", "evidence_count", "description"],
                    properties: {
                      signal: { type: "string", description: "The differentiator (e.g., 'Fear-free handling')" },
                      evidence_count: { type: "number", description: "Number of reviews mentioning this" },
                      description: { type: "string", description: "Brief summary of how this differentiator manifests" },
                    },
                  },
                },
                sentiment_summary: {
                  type: "object",
                  required: ["positive_pct", "neutral_pct", "negative_pct", "key_positives", "key_negatives"],
                  properties: {
                    positive_pct: { type: "number" },
                    neutral_pct: { type: "number" },
                    negative_pct: { type: "number" },
                    key_positives: { type: "array", items: { type: "string" }, description: "Top 3 positive aspects" },
                    key_negatives: { type: "array", items: { type: "string" }, description: "Top concerns if any" },
                  },
                },
                confidence: {
                  type: "string",
                  enum: ["low", "medium", "high"],
                  description: "Confidence based on review count and consistency",
                },
              },
            },
          },
        ],
        tool_choice: { type: "tool", name: "extract_review_insights" },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI error:", errText);
      if (aiRes.status === 400 && errText.includes("credit balance is too low")) {
        return jsonRes({ error: "Anthropic API credit balance is too low. Please top up your Anthropic account at https://console.anthropic.com to continue using AI features." }, 402);
      }
      return jsonRes({ error: `AI extraction failed [${aiRes.status}]: ${errText}` }, 500);
    }

    const aiData = await aiRes.json();
    const toolBlock = aiData.content?.find((b: any) => b.type === "tool_use");
    if (!toolBlock?.input) {
      return jsonRes({ error: "AI did not return structured data" }, 500);
    }

    const extracted = toolBlock.input;
    const placeName = detailsData.displayName?.text || detailsData.displayName || "";
    const miningResult = {
      ...extracted,
      review_count: reviews.length,
      total_reviews_on_google: totalReviews,
      avg_rating: avgRating,
      place_name: placeName,
      mined_at: new Date().toISOString(),
    };

    // Upsert into clinic_brand_dna
    const { data: existingDna } = await sb
      .from("clinic_brand_dna")
      .select("id, additional_fields")
      .eq("clinic_id", clinic_id)
      .maybeSingle();

    if (existingDna) {
      const fields = (existingDna.additional_fields || {}) as Record<string, any>;
      fields.review_mining = miningResult;
      await sb
        .from("clinic_brand_dna")
        .update({ additional_fields: fields })
        .eq("clinic_id", clinic_id);
    } else {
      await sb.from("clinic_brand_dna").insert({
        clinic_id,
        status: "draft",
        additional_fields: { review_mining: miningResult },
      });
    }

    return jsonRes({ success: true, extracted: miningResult });
  } catch (err) {
    console.error("mine-reviews error:", err);
    if (err instanceof PlacesApiError) {
      return jsonRes({ error: err.message }, err.status);
    }
    return jsonRes({ error: (err as Error).message || "Internal error" }, 500);
  }
});
