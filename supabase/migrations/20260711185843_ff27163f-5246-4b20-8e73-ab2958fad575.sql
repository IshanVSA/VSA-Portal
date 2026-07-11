
UPDATE public.blog_prompt_versions SET is_current = false WHERE is_current = true;

INSERT INTO public.blog_prompt_versions (version_label, prompt_text, is_current, change_notes)
SELECT
  'OneURL Blog Prompt v2.4',
  prompt_text || E'\n\n=== HARD RULES ADDED IN v2.4 (checker-enforced) ===\n' ||
  E'\n1. PRICING LANGUAGE — ABSOLUTELY FORBIDDEN anywhere in the post (body, CTA, meta, FAQ, byline). Do NOT use: "fair price", "affordable", "affordability", "low cost", "low-cost", "budget", "budget-friendly", "cheap", "inexpensive", "reasonable price", "reasonable rates", "value pricing", "competitive pricing", "great value", "worth every penny", or any dollar amounts. Refer to services by name only. CVBC and most Canadian provincial colleges treat pricing signalling as an advertising violation.' ||
  E'\n\n2. HIGH_ALERT_HAZARDS — EVERY hazard listed in `HIGH_ALERT_HAZARDS` MUST appear in the post in its own dedicated sentence that names the hazard explicitly (e.g. "heatstroke", "blue-green algae toxicity", "pavement burns"). A passing mention inside a sentence about a different topic does NOT count. If a hazard genuinely does not fit the spoke topic, add a short "Seasonal safety note" subsection at the end that covers all remaining hazards with one full sentence each.' ||
  E'\n\n3. SPECIES_TREATED — The post must be consistent with the `SPECIES_TREATED` array. Do NOT reference species not in that array. Metadata (categories, tags, schema `about`) must declare the species you actually wrote about, drawn from `SPECIES_TREATED`.' ||
  E'\n\n4. CTA BLOCK — the <mark> CTA must contain only: hospital name, service name, city/neighbourhood, phone, and a call to book. No qualitative pricing, no urgency-manipulation ("act now", "limited spots"), no guarantees ("best care in [city]", "we cure").' ||
  E'\n\n5. SELF-CHECK BEFORE RETURNING — silently verify: (a) zero forbidden pricing terms, (b) every HIGH_ALERT_HAZARDS entry appears in a dedicated sentence naming it, (c) species content matches SPECIES_TREATED. If any fails, revise before returning.',
  true,
  'v2.4: hard rules for pricing language, hazard coverage, species match, CTA discipline. Additive over v2.3.'
FROM public.blog_prompt_versions WHERE version_label = 'OneURL Blog Prompt v2.3';
