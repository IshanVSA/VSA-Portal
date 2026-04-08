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

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function searchPlacesByText(
  query: string,
  apiKey: string,
  fieldMask = "places.id,places.displayName,places.formattedAddress,places.location",
) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify({
      textQuery: query,
      pageSize: 5,
    }),
  });

  const data = await safeJson(res);
  return { ok: res.ok && !data?.error, status: res.status, data };
}

async function fetchPlaceDetails(placeId: string, apiKey: string) {
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "id,displayName,formattedAddress,location,addressComponents",
    },
  });

  const data = await safeJson(res);
  return { ok: res.ok && !data?.error, status: res.status, data };
}

async function fetchNearbyPlaces(
  lat: number,
  lng: number,
  apiKey: string,
  type: string,
  radius = 8000,
) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.types",
    },
    body: JSON.stringify({
      includedTypes: [type],
      maxResultCount: 10,
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius,
        },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.log(`Nearby search failed for ${type}: ${res.status} ${text}`);
    return [];
  }

  const data = await safeJson(res);
  return (data?.places || []).slice(0, 10).map((p: any) => ({
    name: p.displayName?.text || p.displayName || "",
    types: p.types || [],
    vicinity: p.formattedAddress || "",
  }));
}

function getAddressComponent(
  addressComponents: any[] | undefined,
  types: string[],
) {
  return addressComponents?.find((component: any) =>
    types.some((type) => component.types?.includes(type))
  );
}

function getAddressComponentText(component: any) {
  return component?.longText || component?.shortText || component?.long_name || component?.short_name || null;
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

    // Step 1: Resolve clinic location with Places API (New)
    let lat: number | undefined;
    let lng: number | undefined;
    let formattedAddress = clinic.address || "";
    let resolvedPlaceId = clinic.google_place_id || null;
    let resolvedPlaceDetails: any | null = null;
    const diagnostics = {
      attempts: [] as string[],
      clinic_address: clinic.address || null,
      google_place_id: clinic.google_place_id || null,
    };

    if (clinic.address) {
      diagnostics.attempts.push("address_search");
      const addressSearch = await searchPlacesByText(clinic.address, googleApiKey);
      const addressMatch = addressSearch.data?.places?.[0];

      if (addressMatch?.location) {
        lat = addressMatch.location.latitude;
        lng = addressMatch.location.longitude;
        formattedAddress = addressMatch.formattedAddress || formattedAddress;
        resolvedPlaceId = addressMatch.id || resolvedPlaceId;
        console.log(`Address search resolved clinic to: ${formattedAddress}`);
      } else {
        console.log(`Address search failed: ${JSON.stringify(addressSearch.data || { status: addressSearch.status })}`);
      }
    }

    if ((lat === undefined || lng === undefined) && clinic.google_place_id) {
      diagnostics.attempts.push("place_details");
      const placeDetails = await fetchPlaceDetails(clinic.google_place_id, googleApiKey);

      if (placeDetails.data?.location) {
        lat = placeDetails.data.location.latitude;
        lng = placeDetails.data.location.longitude;
        formattedAddress = placeDetails.data.formattedAddress || formattedAddress;
        resolvedPlaceId = placeDetails.data.id || resolvedPlaceId;
        resolvedPlaceDetails = placeDetails.data;
        console.log(`Place ID resolved clinic to: ${formattedAddress}`);
      } else {
        console.log(`Place details lookup failed: ${JSON.stringify(placeDetails.data || { status: placeDetails.status })}`);
      }
    }

    if ((lat === undefined || lng === undefined) && clinic.address) {
      diagnostics.attempts.push("name_and_address_search");
      const businessSearch = await searchPlacesByText(`${clinic.clinic_name} ${clinic.address}`, googleApiKey);
      const businessMatch = businessSearch.data?.places?.[0];

      if (businessMatch?.location) {
        lat = businessMatch.location.latitude;
        lng = businessMatch.location.longitude;
        formattedAddress = businessMatch.formattedAddress || formattedAddress;
        resolvedPlaceId = businessMatch.id || resolvedPlaceId;
        console.log(`Name + address search resolved clinic to: ${formattedAddress}`);
      } else {
        console.log(`Name + address search failed: ${JSON.stringify(businessSearch.data || { status: businessSearch.status })}`);
      }
    }

    if (lat === undefined || lng === undefined) {
      return createJsonResponse({
        ok: false,
        error: "Could not resolve clinic location from Google Places. Please verify the clinic address.",
        diagnostics,
      });
    }

    if (!resolvedPlaceDetails && resolvedPlaceId) {
      const detailsLookup = await fetchPlaceDetails(resolvedPlaceId, googleApiKey);
      if (detailsLookup.data?.location) {
        resolvedPlaceDetails = detailsLookup.data;
        lat = detailsLookup.data.location.latitude;
        lng = detailsLookup.data.location.longitude;
        formattedAddress = detailsLookup.data.formattedAddress || formattedAddress;
      }
    }

    const resolvedLat = lat;
    const resolvedLng = lng;

    console.log(`Geocoded to: ${resolvedLat}, ${resolvedLng}`);

    // Step 2: Fetch nearby places in parallel
    const [parks, schools, shoppingMalls] = await Promise.all([
      fetchNearbyPlaces(resolvedLat, resolvedLng, googleApiKey, "park", 10000),
      fetchNearbyPlaces(resolvedLat, resolvedLng, googleApiKey, "school", 5000),
      fetchNearbyPlaces(resolvedLat, resolvedLng, googleApiKey, "shopping_mall", 8000),
    ]);

    const addressComponents = resolvedPlaceDetails?.addressComponents || [];
    const neighbourhoodComponent = getAddressComponent(addressComponents, [
      "neighborhood",
      "sublocality",
      "sublocality_level_1",
    ]);
    const cityComponent = getAddressComponent(addressComponents, [
      "locality",
      "postal_town",
      "administrative_area_level_2",
    ]);
    const provinceComponent = getAddressComponent(addressComponents, ["administrative_area_level_1"]);

    // Step 3: Use AI to synthesize locality data
    const placesContext = [
      `Clinic: ${clinic.clinic_name}`,
      `Address: ${formattedAddress}`,
      `Neighbourhood: ${getAddressComponentText(neighbourhoodComponent) || "Unknown"}`,
      `City: ${getAddressComponentText(cityComponent) || "Unknown"}`,
      `Province/State: ${getAddressComponentText(provinceComponent) || "Unknown"}`,
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
