import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const requestSchema = z.object({ clinic_id: z.string().uuid() });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* ── Governing body mapping ── */
const GOVERNING_BODIES: Record<string, string> = {
  "british columbia": "CVBC (College of Veterinarians of British Columbia)",
  bc: "CVBC (College of Veterinarians of British Columbia)",
  alberta: "ABVMA (Alberta Veterinary Medical Association)",
  ab: "ABVMA (Alberta Veterinary Medical Association)",
  ontario: "CVO (College of Veterinarians of Ontario)",
  on: "CVO (College of Veterinarians of Ontario)",
  manitoba: "MVMA (Manitoba Veterinary Medical Association)",
  mb: "MVMA (Manitoba Veterinary Medical Association)",
  saskatchewan: "SVMA (Saskatchewan Veterinary Medical Association)",
  sk: "SVMA (Saskatchewan Veterinary Medical Association)",
  "nova scotia": "NSVMA (Nova Scotia Veterinary Medical Association)",
  ns: "NSVMA (Nova Scotia Veterinary Medical Association)",
  "new brunswick": "NBVMA (New Brunswick Veterinary Medical Association)",
  nb: "NBVMA (New Brunswick Veterinary Medical Association)",
  pei: "PEIVMA (PEI Veterinary Medical Association)",
  pe: "PEIVMA (PEI Veterinary Medical Association)",
  "prince edward island": "PEIVMA (PEI Veterinary Medical Association)",
  newfoundland: "NLVMA (Newfoundland and Labrador Veterinary Medical Association)",
  nl: "NLVMA (Newfoundland and Labrador Veterinary Medical Association)",
  quebec: "OMVQ (Ordre des médecins vétérinaires du Québec)",
  qc: "OMVQ (Ordre des médecins vétérinaires du Québec)",
  california: "CVMB", washington: "WSVMA", oregon: "OVMA", texas: "TVMA",
  florida: "FVMA", "new york": "NYSVMS", illinois: "ISVMA", colorado: "CVMA-CO",
  arizona: "AZVMA", nevada: "NVMA", georgia: "GVMA", massachusetts: "MVMA-state",
  "new jersey": "NJVMA",
};

function detectGoverningBody(address: string | null, jurisdiction: string | null): { body: string; isCVBC: boolean } {
  const text = (jurisdiction || address || "").toLowerCase();
  for (const [key, body] of Object.entries(GOVERNING_BODIES)) {
    if (text.includes(key)) {
      return { body, isCVBC: body.startsWith("CVBC") };
    }
  }
  return { body: "AVMA baseline — flag for confirmation", isCVBC: false };
}

/* ── Weighted scoring ── */
const FIELD_WEIGHTS: Record<string, number> = {
  hospital_name: 3, phone: 2, hours: 3, booking_url: 2, doctors: 4, services: 3,
  founding_year: 1, founding_story: 4, about_us: 2, brand_identity: 2,
  voice_fingerprint: 8, narrative_anchor: 7, clinic_differentiator: 7,
  target_client: 5, growth_priority: 4, content_exclusions: 3,
  community_connections: 3, owner_presence: 3, patient_consent: 2,
  stat_holiday: 2, governing_body: 3, hospital_type: 3,
  doctors_voice_topic: 4, google_review_themes: 4,
  neighbourhood: 2, cultural_communities: 1, local_trails: 1,
};

const TOTAL_WEIGHT = Object.values(FIELD_WEIGHTS).reduce((a, b) => a + b, 0);

/* ── AI synthesis tool schema ── */
const synthesisTool = {
  name: "output_dna_profile",
  description: "Output the complete synthesized DNA profile with all four parts.",
  input_schema: {
    type: "object",
    properties: {
      voice_fingerprint: {
        type: "array", items: { type: "string" },
        description: "5-8 specific, natural phrases from the owner's voice. Not generic marketing language.",
      },
      narrative_anchor: {
        type: "string",
        description: "1-2 sentence human story behind the clinic, in the owner's voice.",
      },
      clinic_differentiator: {
        type: "string",
        description: "The validated, specific differentiator. Note if review data confirms or contradicts owner's claim.",
      },
      differentiator_validated: {
        type: "boolean",
        description: "True if review data aligns with owner's stated differentiator.",
      },
      governing_body: { type: "string", description: "Full governing body name with acronym." },
      jurisdiction: { type: "string", description: "City, province/state, country." },
      hospital_type: {
        type: "string", enum: ["TYPE_1", "TYPE_2", "TYPE_3"],
        description: "TYPE_1=24/7 emergency, TYPE_2=dedicated emergency hours, TYPE_3=general practice.",
      },
      hospital_type_reasoning: { type: "string", description: "Brief reasoning for hospital type classification." },
      stat_holiday_protocol: {
        type: "string", enum: ["ALWAYS_OPEN", "ALWAYS_CLOSED", "CONFIRM_ANNUALLY"],
        description: "Holiday hours protocol.",
      },
      founding_story: { type: "string", description: "Synthesized founding story." },
      doctors_voice_topic: { type: "string", description: "The myth/misconception the doctor explains weekly." },
      target_client_profile: { type: "string", description: "Specific ideal client description." },
      growth_priority: { type: "string", description: "One specific service/client type to grow." },
      content_exclusions: { type: "array", items: { type: "string" }, description: "Hard no-go content topics." },
      owner_presence: {
        type: "string", enum: ["FEATURED", "NAMED_ONLY", "BACKGROUND"],
        description: "Owner's social media presence level.",
      },
      community_connections: {
        type: "array",
        items: { type: "object", properties: { name: { type: "string" }, relationship: { type: "string" } }, required: ["name"] },
        description: "Confirmed local community connections.",
      },
      patient_consent: {
        type: "string", enum: ["YES", "CONDITIONAL", "NO"],
        description: "Patient photo consent status.",
      },
      google_review_themes: {
        type: "array", items: { type: "string" },
        description: "Top review themes. Set to ['SUPPRESSED — CVBC jurisdiction'] for BC clinics.",
      },
      content_type_permissions: {
        type: "object",
        properties: {
          approved_by_default: { type: "array", items: { type: "string" } },
          requires_approval: { type: "array", items: { type: "string" } },
          explicitly_confirmed: { type: "boolean" },
        },
      },
      completeness_score: { type: "number", description: "Weighted 0-100 score." },
      field_scores: {
        type: "array",
        items: {
          type: "object",
          properties: {
            field: { type: "string" },
            status: { type: "string", enum: ["captured", "partially_captured", "not_captured"] },
            weight: { type: "number" },
            weighted_score: { type: "number" },
            source: { type: "string", description: "Which layer(s) provided this data." },
          },
          required: ["field", "status", "weight", "weighted_score"],
        },
      },
      confidence_flags: {
        type: "array",
        items: {
          type: "object",
          properties: {
            field: { type: "string" },
            issue: { type: "string" },
            resolution: { type: "string" },
            severity: { type: "string", enum: ["low", "medium", "high"] },
          },
          required: ["field", "issue", "resolution"],
        },
      },
      vedant_review_checklist: {
        type: "array",
        items: {
          type: "object",
          properties: {
            item: { type: "string" },
            priority: { type: "string", enum: ["critical", "high", "medium", "low"] },
          },
          required: ["item", "priority"],
        },
      },
    },
    required: [
      "voice_fingerprint", "narrative_anchor", "clinic_differentiator",
      "governing_body", "hospital_type", "completeness_score",
      "field_scores", "confidence_flags", "vedant_review_checklist",
    ],
  },
};

/* ── System prompt ── */
const SYSTEM_PROMPT = `SYSTEM PROMPT — VSA VET MEDIA DNA SYNTHESIS ENGINE v1.0

You are the VSA Vet Media DNA Synthesis Engine. Your task is to take three raw inputs — website extraction data, review mining data (where available), and concierge collection call notes — and produce a complete, formatted Clinic DNA Profile.

You are not generating content. You are synthesizing raw data into a structured profile. Every field you output must be traceable to something in the three inputs. Do not invent information. If a field cannot be filled from the available data, mark it as not_captured and flag it.

SYNTHESIS RULES:

RULE 1 — VOICE FINGERPRINT EXTRACTION:
Read the call notes carefully. Identify phrases the owner used that are specific, natural, and reflect their actual communication style — not generic marketing language. Extract 5 to 8 phrases that could only have come from this specific owner. If review mining data is available, cross-reference: phrases that appear in both the owner's language and in how clients describe the clinic are the strongest fingerprint anchors.
Strong: "we call the next day, every time, no exceptions" / "Dr. Singh grew up in this neighborhood"
Weak (do NOT include): "we care about pets" / "our team is passionate"

RULE 2 — NARRATIVE ANCHOR EXTRACTION:
From the founding story, identify the single most compelling thread — the human reason this clinic exists. Write it as 1-2 sentences in the clinic owner's voice. This is not a tagline.

RULE 3 — DIFFERENTIATOR VALIDATION:
Compare what the owner said in Q1 with what the review mining data shows clients actually say. If they align: high confidence. If they conflict: flag it. Review data is usually more accurate than the owner's self-assessment.

RULE 4 — GOVERNING BODY: Use the governing body provided in the input. For BC clinics, set google_review_themes to ["SUPPRESSED — CVBC jurisdiction"].

RULE 5 — HOSPITAL TYPE DETECTION:
TYPE 1: 24/7 including stat holidays, confirmed emergency language.
TYPE 2: Dedicated emergency hours outside normal hours but not 24/7.
TYPE 3: Daytime or extended-hours general practice.
If ambiguous: default to TYPE 3 and flag.

RULE 6 — STAT HOLIDAY PROTOCOL:
TYPE 1/2 hospitals: ALWAYS_OPEN regardless. Clear website statement: use it. Call confirmed: use it. Otherwise: CONFIRM_ANNUALLY and flag.

RULE 7 — CONTENT TYPE PERMISSIONS DEFAULT:
If not explicitly confirmed in the call, apply defaults:
Approved: Hours, Differentiator, Seasonal Alert, Educational, Myth Buster, Interesting Fact, Conversation Starter, Community Recognition, Local Humor, Locally Owned, Pet Owner Lifestyle, Vaccine Education, Breed Spotlight, Awareness Month.
Requires approval: Behind the Scenes, Staff Spotlight, Patient Milestone, Bilingual Content, Promotion.

RULE 8 — DO NOT INVENT: If a field cannot be filled, mark as not_captured with reason.

RULE 9 — COMPLETENESS SCORING: Use field weights to calculate a weighted score 0-100. Show every field.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const token = authorization.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Unauthorized" }, 401);

    const { data: roleRow } = await serviceClient.from("user_roles").select("role").eq("user_id", authData.user.id).maybeSingle();
    if (!roleRow || roleRow.role === "client") return json({ error: "Only staff can run synthesis" }, 403);

    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, 400);
    const { clinic_id } = parsed.data;

    // Fetch clinic + brand DNA
    const [{ data: clinic }, { data: dna }] = await Promise.all([
      serviceClient.from("clinics").select("clinic_name, website, address, phone, timezone").eq("id", clinic_id).maybeSingle(),
      serviceClient.from("clinic_brand_dna").select("*").eq("clinic_id", clinic_id).maybeSingle(),
    ]);

    if (!clinic) return json({ error: "Clinic not found" }, 404);
    if (!dna) return json({ error: "No Brand DNA record exists. Run website extraction or complete the questionnaire first." }, 422);

    const callNotes = (dna.call_notes || {}) as Record<string, string>;
    const additionalFields = (dna.additional_fields || {}) as Record<string, any>;
    const websiteExtraction = additionalFields.website_extraction || null;
    const reviewMining = additionalFields.review_mining || null;

    // Detect governing body
    const { body: governingBody, isCVBC } = detectGoverningBody(
      clinic.address,
      websiteExtraction?.jurisdiction || additionalFields.jurisdiction || null
    );

    // Build the user message
    const userMessage = buildUserMessage(clinic, callNotes, additionalFields, websiteExtraction, reviewMining, governingBody, isCVBC);

    console.log(`Synthesizing DNA for ${clinic.clinic_name}. Has website: ${!!websiteExtraction}, Has reviews: ${!!reviewMining}, Call answers: ${Object.values(callNotes).filter(v => v?.trim()).length}/10`);

    // Call Claude
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

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
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
        tools: [synthesisTool],
        tool_choice: { type: "tool", name: "output_dna_profile" },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`AI synthesis failed [${response.status}]: ${text}`);
    }

    const data = await response.json();
    const toolBlock = data.content?.find((b: any) => b.type === "tool_use" && b.name === "output_dna_profile");
    if (!toolBlock?.input) throw new Error("AI synthesis returned no structured result");

    const profile = toolBlock.input;
    profile.synthesized_at = new Date().toISOString();
    profile.synthesized_by = authData.user.id;

    // Save to DB
    const { error: updateError } = await serviceClient
      .from("clinic_brand_dna")
      .update({
        synthesized_profile: profile,
        completeness_score: Math.round(profile.completeness_score || 0),
        confidence_flags: profile.confidence_flags || [],
        status: "synthesized",
      })
      .eq("clinic_id", clinic_id);

    if (updateError) throw updateError;

    console.log(`Synthesis complete. Score: ${profile.completeness_score}`);

    return json({ success: true, profile });
  } catch (error) {
    console.error("synthesize-dna error:", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

/* ── Build user message from all 3 layers ── */
function buildUserMessage(
  clinic: any,
  callNotes: Record<string, string>,
  additionalFields: Record<string, any>,
  websiteExtraction: any,
  reviewMining: any,
  governingBody: string,
  isCVBC: boolean
): string {
  const sections: string[] = [];

  sections.push(`CLINIC DNA SYNTHESIS REQUEST
CLINIC NAME: ${clinic.clinic_name}
WEBSITE URL: ${clinic.website || "NOT AVAILABLE"}
ADDRESS: ${clinic.address || "NOT AVAILABLE"}
PHONE: ${clinic.phone || "NOT AVAILABLE"}
GOVERNING BODY (auto-detected): ${governingBody}
IS CVBC JURISDICTION: ${isCVBC ? "YES — suppress review themes" : "NO"}`);

  // Layer 1
  sections.push("=== LAYER 1: WEBSITE EXTRACTION DATA ===");
  if (websiteExtraction) {
    sections.push(JSON.stringify(websiteExtraction, null, 2));
  } else {
    sections.push("EXTRACTION NOT AVAILABLE — website extraction has not been run for this clinic.");
  }

  // Layer 2
  sections.push("=== LAYER 2: REVIEW MINING DATA ===");
  if (isCVBC) {
    sections.push("SUPPRESSED — CVBC JURISDICTION — DO NOT POPULATE");
  } else if (reviewMining) {
    sections.push(JSON.stringify(reviewMining, null, 2));
  } else {
    sections.push("REVIEW MINING NOT AVAILABLE — has not been run for this clinic.");
  }

  // Layer 3
  sections.push("=== LAYER 3: COLLECTION CALL NOTES ===");
  const qMap: Record<string, string> = {
    q1_differentiator: "Q1 — Real Differentiator",
    q2_myth: "Q2 — Myth or Misconception",
    q3_target_client: "Q3 — Target Client Profile",
    q4_founding_story: "Q4 — Founding Story",
    q5_owner_presence: "Q5 — Owner Presence Level",
    q6_growth_priority: "Q6 — Growth Priority",
    q7_content_exclusions: "Q7 — Content Exclusions",
    q8_community_connections: "Q8 — Community Connections",
    q9_patient_consent: "Q9 — Patient Consent",
    q10_stat_holidays: "Q10 — Statutory Holidays",
  };

  const hasCallNotes = Object.values(callNotes).some(v => v?.trim());
  if (hasCallNotes) {
    for (const [key, label] of Object.entries(qMap)) {
      sections.push(`${label}:\n${callNotes[key]?.trim() || "NOT AVAILABLE"}`);
    }
  } else {
    sections.push("COLLECTION CALL NOT COMPLETED — no call notes available.");
  }

  // Locality profile (stored at additionalFields.locality by locality-fetch)
  const locality = additionalFields.locality || {};
  sections.push("\n=== LOCALITY PROFILE ===");
  if (Object.keys(locality).length > 0) {
    sections.push(JSON.stringify(locality, null, 2));
  } else {
    sections.push("LOCALITY DATA NOT AVAILABLE — locality fetch has not been run for this clinic.");
  }

  // Additional fields (check both top-level and locality nested keys)
  sections.push("\n=== ADDITIONAL FIELDS ===");
  const flatFields: Record<string, string | undefined> = {
    neighbourhood_character: additionalFields.neighbourhood_character || locality.neighbourhood || locality.housing_character,
    voice_phrases: additionalFields.voice_phrases,
    local_trails_parks: additionalFields.local_trails_parks || (locality.local_trails_and_parks ? JSON.stringify(locality.local_trails_and_parks) : undefined),
    cultural_communities: additionalFields.cultural_communities || (locality.cultural_communities ? JSON.stringify(locality.cultural_communities) : undefined),
    visual_style: additionalFields.visual_style,
  };
  for (const [key, val] of Object.entries(flatFields)) {
    if (val && val.trim()) {
      sections.push(`${key.toUpperCase()}: ${val}`);
    }
  }

  sections.push(`\n=== FIELD WEIGHTS FOR SCORING ===\n${JSON.stringify(FIELD_WEIGHTS, null, 2)}\nTOTAL POSSIBLE WEIGHT: ${TOTAL_WEIGHT}`);

  return sections.join("\n\n");
}
