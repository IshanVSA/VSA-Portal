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

// ── Places API helpers ─────────────────────────────────────────────
async function searchVetPlace(clinicName: string, address: string, apiKey: string) {
  // Build a query that emphasizes veterinary context
  const queries = [
    `${clinicName} veterinary ${address}`.trim(),
    `${clinicName} animal hospital ${address}`.trim(),
    `${clinicName} ${address}`.trim(),
  ];

  for (const query of queries) {
    console.log(`Searching Places: "${query}"`);
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName",
      },
      body: JSON.stringify({ textQuery: query }),
    });
    const data = await res.json();
    if (data.places?.length > 0) {
      const place = data.places[0];
      const displayName = place.displayName?.text || place.displayName || "";
      console.log(`Found: "${displayName}" (id: ${place.id})`);
      // Check if the result is plausibly a vet clinic
      const vetKeywords = ["animal", "vet", "veterinary", "pet", "clinic"];
      const nameTokens = tokenize(displayName);
      const isVet = vetKeywords.some(k => nameTokens.has(k)) || namesMatch(clinicName, displayName);
      if (isVet) {
        return { placeId: place.id, displayName };
      }
      console.log(`Skipping "${displayName}" — doesn't match "${clinicName}"`);
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) return jsonRes({ error: "Invalid request" }, 400);
    const { clinic_id } = parsed.data;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const googleKey = Deno.env.get("GOOGLE_PAGESPEED_API_KEY") || Deno.env.get("GOOGLE_PLACES_API_KEY");
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    if (!googleKey) return jsonRes({ error: "Google API key not configured" }, 500);

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
    return jsonRes({ error: (err as Error).message || "Internal error" }, 500);
  }
});
