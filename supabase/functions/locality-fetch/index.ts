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

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const localityTool = {
  name: "extract_locality",
  description: "Extract neighbourhood and locality data for a veterinary clinic based on its address and nearby places.",
  input_schema: {
    type: "object" as const,
    properties: {
      neighbourhood: {
        type: "string",
        description: "Name of the neighbourhood / suburb the clinic is in",
      },
      local_trails_and_parks: {
        type: "array",
        items: { type: "string" },
        description: "Nearby trails, parks, dog parks, beaches, nature areas within ~10km",
      },
      wildlife_profile: {
        type: "array",
        items: { type: "string" },
        description: "Common local wildlife (coyotes, raccoons, deer, bears, etc.)",
      },
      cultural_communities: {
        type: "array",
        items: { type: "string" },
        description: "Notable cultural communities in the area (e.g. South Asian, Chinese, Filipino, Indigenous)",
      },
      community_anchors: {
        type: "array",
        items: { type: "string" },
        description: "Major community anchors: malls, schools, community centres, landmarks near the clinic",
      },
      housing_character: {
        type: "string",
        description: "Housing description: suburban single-family, urban condos, rural acreages, mixed, etc.",
      },
      commuter_profile: {
        type: "string",
        description: "How residents commute: car-dependent suburb, transit-accessible, walkable downtown, etc.",
      },
      local_landmarks: {
        type: "array",
        items: { type: "string" },
        description: "Well-known landmarks or points of interest that locals would recognize",
      },
      seasonal_notes: {
        type: "string",
        description: "Any seasonal considerations: heavy snow, wildfire smoke, extreme heat, etc.",
      },
      confidence: {
        type: "string",
        enum: ["low", "medium", "high"],
        description: "Confidence in the locality data accuracy",
      },
    },
    required: ["neighbourhood", "confidence"],
  },
};

async function fetchNearbyPlaces(
  lat: number,
  lng: number,
  apiKey: string,
  type: string,
  radius = 8000,
) {
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${type}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results || []).slice(0, 10).map((p: any) => ({
    name: p.name,
    types: p.types,
    vicinity: p.vicinity,
  }));
}

async function reverseGeocode(lat: number, lng: number, apiKey: string) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.results || [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return createJsonResponse({ error: "Unauthorized" }, 401);
    }

    const token = authorization.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const googleApiKey = Deno.env.get("GOOGLE_PAGESPEED_API_KEY") || Deno.env.get("GOOGLE_PLACES_API_KEY");

    if (!googleApiKey) {
      return createJsonResponse({ error: "Google API key not configured" }, 500);
    }

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return createJsonResponse({ error: "ANTHROPIC_API_KEY not configured" }, 500);
    }

    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return createJsonResponse({ error: "Unauthorized" }, 401);

    const { data: roleRow } = await serviceClient.from("user_roles").select("role").eq("user_id", authData.user.id).maybeSingle();
    if (!roleRow || roleRow.role === "client") {
      return createJsonResponse({ error: "Only staff can run locality fetch" }, 403);
    }

    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) return createJsonResponse({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);

    const { clinic_id } = parsed.data;

    const { data: clinic, error: clinicError } = await serviceClient
      .from("clinics")
      .select("address, clinic_name, google_place_id")
      .eq("id", clinic_id)
      .maybeSingle();

    if (clinicError || !clinic) return createJsonResponse({ error: "Clinic not found" }, 404);
    if (!clinic.address && !clinic.google_place_id) {
      return createJsonResponse({ error: "Clinic has no address or Google Place ID. Please add one first." }, 422);
    }

    console.log(`Fetching locality for: ${clinic.clinic_name} (${clinic.address})`);

    // Step 1: Get lat/lng from address or place ID
    let lat: number, lng: number;
    let formattedAddress = clinic.address || "";

    let geocoded = false;

    if (clinic.google_place_id) {
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${clinic.google_place_id}&fields=geometry,formatted_address&key=${googleApiKey}`;
      const detailsRes = await fetch(detailsUrl);
      const detailsData = await detailsRes.json();
      if (detailsData.result?.geometry?.location) {
        lat = detailsData.result.geometry.location.lat;
        lng = detailsData.result.geometry.location.lng;
        formattedAddress = detailsData.result.formatted_address || formattedAddress;
        geocoded = true;
      } else {
        console.log("Place ID geocoding failed, falling back to address");
      }
    }

    if (!geocoded && clinic.address) {
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(clinic.address)}&key=${googleApiKey}`;
      const geocodeRes = await fetch(geocodeUrl);
      const geocodeData = await geocodeRes.json();
      if (geocodeData.results?.[0]?.geometry?.location) {
        lat = geocodeData.results[0].geometry.location.lat;
        lng = geocodeData.results[0].geometry.location.lng;
        formattedAddress = geocodeData.results[0].formatted_address || formattedAddress;
        geocoded = true;
      }
    }

    if (!geocoded) {
      return createJsonResponse({ error: "Could not geocode clinic from Place ID or address" }, 422);
    }

    console.log(`Geocoded to: ${lat}, ${lng}`);

    // Step 2: Fetch nearby places in parallel
    const [parks, schools, shoppingMalls, reverseGeo] = await Promise.all([
      fetchNearbyPlaces(lat!, lng!, googleApiKey, "park", 10000),
      fetchNearbyPlaces(lat!, lng!, googleApiKey, "school", 5000),
      fetchNearbyPlaces(lat!, lng!, googleApiKey, "shopping_mall", 8000),
      reverseGeocode(lat!, lng!, googleApiKey),
    ]);

    // Extract neighbourhood from reverse geocode
    const neighbourhoodComponent = reverseGeo
      ?.flatMap((r: any) => r.address_components || [])
      ?.find((c: any) => c.types?.includes("neighborhood") || c.types?.includes("sublocality"));
    const cityComponent = reverseGeo
      ?.flatMap((r: any) => r.address_components || [])
      ?.find((c: any) => c.types?.includes("locality"));
    const provinceComponent = reverseGeo
      ?.flatMap((r: any) => r.address_components || [])
      ?.find((c: any) => c.types?.includes("administrative_area_level_1"));

    // Step 3: Use AI to synthesize locality data
    const placesContext = [
      `Clinic: ${clinic.clinic_name}`,
      `Address: ${formattedAddress}`,
      `Neighbourhood: ${neighbourhoodComponent?.long_name || "Unknown"}`,
      `City: ${cityComponent?.long_name || "Unknown"}`,
      `Province/State: ${provinceComponent?.long_name || "Unknown"}`,
      `Coordinates: ${lat}, ${lng}`,
      "",
      `Nearby Parks (${parks.length}): ${parks.map((p: any) => p.name).join(", ") || "None found"}`,
      `Nearby Schools (${schools.length}): ${schools.map((s: any) => s.name).join(", ") || "None found"}`,
      `Nearby Shopping (${shoppingMalls.length}): ${shoppingMalls.map((m: any) => m.name).join(", ") || "None found"}`,
    ].join("\n");

    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 2048,
        system: [
          "You are a locality expert for Canadian and US cities.",
          "Given a veterinary clinic's address and nearby places data, extract detailed neighbourhood character information.",
          "Use your knowledge of the area combined with the Places data to provide accurate locality details.",
          "Include local wildlife common to the region, cultural communities, housing character, and commuter profile.",
          "For parks/trails, include well-known ones in the area even if not in the nearby places data.",
          "Be specific and accurate — this data will be used for hyper-local social media content.",
        ].join(" "),
        messages: [
          {
            role: "user",
            content: `Extract locality data for this veterinary clinic:\n\n${placesContext}`,
          },
        ],
        tools: [localityTool],
        tool_choice: { type: "tool", name: "extract_locality" },
      }),
    });

    if (!aiResponse.ok) {
      const text = await aiResponse.text();
      throw new Error(`AI locality extraction failed [${aiResponse.status}]: ${text}`);
    }

    const aiData = await aiResponse.json();
    const toolBlock = aiData.content?.find((b: any) => b.type === "tool_use" && b.name === "extract_locality");
    if (!toolBlock?.input) throw new Error("AI returned no locality data");

    const locality = toolBlock.input;
    locality.fetched_at = new Date().toISOString();
    locality.source_coordinates = { lat, lng };
    locality.formatted_address = formattedAddress;

    console.log(`Locality extracted: ${locality.neighbourhood}, confidence: ${locality.confidence}`);

    // Step 4: Store in clinic_brand_dna.additional_fields.locality
    const { data: existing } = await serviceClient
      .from("clinic_brand_dna")
      .select("id, additional_fields")
      .eq("clinic_id", clinic_id)
      .maybeSingle();

    const additionalFields = (existing?.additional_fields as Record<string, unknown>) || {};
    additionalFields.locality = locality;

    if (existing) {
      const { error: updateError } = await serviceClient
        .from("clinic_brand_dna")
        .update({ additional_fields: additionalFields })
        .eq("clinic_id", clinic_id);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await serviceClient
        .from("clinic_brand_dna")
        .insert({
          clinic_id,
          additional_fields: additionalFields,
          status: "draft",
          submitted_by: authData.user.id,
        });
      if (insertError) throw insertError;
    }

    // Also update clinic_gbp_config with local landmarks if it exists
    if (locality.local_landmarks?.length) {
      await serviceClient
        .from("clinic_gbp_config")
        .update({
          local_landmarks: locality.local_landmarks,
          neighbourhood: locality.neighbourhood,
        })
        .eq("clinic_id", clinic_id);
    }

    return createJsonResponse({ success: true, locality });
  } catch (error) {
    console.error("locality-fetch error:", error);
    return createJsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
