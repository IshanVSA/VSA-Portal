

## Plan: Align GBP Posts System With v2.0 Prompt Specification

### Gap Analysis — Current vs. v2.0 Spec

| Area | v2.0 Spec | Current Status | Action |
|------|-----------|----------------|--------|
| **Model** | `claude-sonnet-4-6` | `claude-opus-4-6` | Change model in edge function |
| **Output format** | Plain text, copy-paste ready (NOT JSON) | JSON output parsed into cards | Keep JSON for internal use but update system prompt language |
| **Spelling standard** | Jurisdiction-aware: Canadian English for CA clinics, US English for US | Hardcoded US English only | Update system prompt to be jurisdiction-aware |
| **Emojis** | Zero emojis, absolute ban | "Emojis may ONLY appear at start/end, max 2" | Update to zero emoji rule |
| **Keywords per post** | 1-2 max (down from 2-4) | Prompt says 1-2 but secondary_keywords array allows more | Already aligned in prompt, keep |
| **Google Policy Layer (Step 4)** | 12 specific rejection triggers + profile protection rules | Not present — only generic compliance terms | Add full Google policy layer to system prompt |
| **Governing Body (Step 5)** | Full province/state-specific rules (CVBC, CVO, ABVMA, CVMB, TVMA, etc.) | Only basic regulatory body name mentioned | Add full governing body compliance section |
| **Hospital Type (Step 6)** | Detailed rules per type with permitted/never language | Basic forbidden terms list only | Expand hospital type section |
| **Geo-Layer (Step 7)** | Detailed seasonal hazards by region (BC Coast, BC Interior, Alberta, Ontario, California, Texas, Florida, etc.) with Foxtail correction | Not present | Add full geo-layer and seasonal calendar |
| **Cluster Lock (Step 8)** | Read CLUSTER_NEIGHBORS, prevent same-topic same-week | Not present in prompt | Add cluster differentiation step |
| **SM2 Alignment (Step 9)** | Read SM2_CALENDAR_THIS_MONTH for thematic alignment | Not present | Add SM2 alignment step and pass SM2 calendar data |
| **Post structure** | Week 1: What's New, Week 2: Products/Services, Week 3: What's New, Week 4: What's New | Already matches | No change |
| **Self-Audit (Step 12)** | Structured audit with Google policy, governing body, content quality checks | Basic self-audit checklist exists | Expand to match v2.0 audit |
| **DNA Profile fields** | Voice fingerprint, narrative anchor, clinic differentiator, content exclusions, neighbourhood character, founding story, accreditations, after-hours referral, species treated, hours, booking URL | Only neighbourhood, phone, landmarks, top_services, website_url passed | Add missing DNA fields to config and user message |
| **Website fetch (Step 2)** | Fetch live website to verify clinic info | Not implemented | Add website fetch step to prompt (AI can't fetch, but note for concierge) |
| **Keyword extraction (Step 3)** | Extract 6-8 local SEO keywords, assign 1-2 per post | Not present as explicit step | Add keyword extraction step |
| **URL in post body** | Never — CTA button only | Not enforced in prompt | Add as explicit rule |
| **Flagged terms table** | Specific replacements (prescription→veterinary products, treatment→care, diagnosis→assessment, etc.) | Partial — terms flagged but no replacement guidance in prompt | Add full flagged terms table |
| **DB fields missing** | booking_url, hours, after_hours_referral, species_treated, governing_body, accreditations, content_exclusions, voice_fingerprint, narrative_anchor, clinic_differentiator, neighbourhood_character, founding_story, stat_holiday_protocol | Not in `clinic_gbp_config` table | Add columns via migration |

### Implementation Plan

**Step 1 — Database migration**: Add missing DNA profile columns to `clinic_gbp_config`:
- `booking_url text`
- `hours jsonb` (weekly schedule)
- `after_hours_referral text`
- `species_treated text[]`
- `governing_body text`
- `accreditations text[]`
- `content_exclusions text[]`
- `voice_fingerprint text`
- `narrative_anchor text`
- `clinic_differentiator text`
- `neighbourhood_character text`
- `founding_story text`
- `stat_holiday_protocol text` (default 'CONFIRM ANNUALLY')
- `country text`
- `state_or_province text`
- `city text`

**Step 2 — Rewrite the edge function system prompt**: Replace the current system prompt in `generate-gbp-posts/index.ts` with the full v2.0 13-step system prompt from the uploaded document. Key changes:
- Change model from `claude-opus-4-6` to `claude-sonnet-4-6`
- Add Steps 1-13 as structured system prompt sections
- Add full Google policy layer (12 rejection triggers)
- Add governing body compliance per jurisdiction
- Add hospital type language rules (expanded)
- Add geo-layer with foxtail correction
- Add cluster differentiation lock
- Add SM2 alignment step
- Zero emoji rule (replace current "max 2" rule)
- Jurisdiction-aware spelling (Canadian vs US English)
- Full flagged terms replacement table
- Expanded self-audit checklist

**Step 3 — Update user message template**: Restructure the user prompt to match Part B of the v2.0 spec, passing all DNA fields, SM2 calendar data, cluster GBP topics, and seasonal topics.

**Step 4 — Update GeneratePosts.tsx**: Pass the new DNA fields from config to the edge function call. Fetch SM2 calendar data for the selected clinic/month to pass as `SM2_CALENDAR_THIS_MONTH`.

**Step 5 — Update ClinicGBPConfigForm.tsx**: Add form fields for the new DNA profile columns (booking URL, hours, after-hours referral, species treated, governing body, accreditations, etc.).

**Step 6 — Update TypeScript types**: Update `ClinicGBPConfig` in `src/lib/gbp/types.ts` and regenerate Supabase types.

**Step 7 — Update compliance scanner**: Update `src/lib/gbp/compliance.ts` to enforce the zero-emoji rule and add the full flagged terms replacement checking from v2.0.

**Step 8 — Redeploy edge function**.

### Files Changed
1. New migration SQL — add DNA columns to `clinic_gbp_config`
2. `supabase/functions/generate-gbp-posts/index.ts` — full v2.0 prompt rewrite
3. `src/components/seo/gbp/GeneratePosts.tsx` — pass new fields + SM2 data
4. `src/components/seo/gbp/ClinicGBPConfigForm.tsx` — new form fields
5. `src/lib/gbp/types.ts` — expanded `ClinicGBPConfig` type
6. `src/lib/gbp/compliance.ts` — zero emoji + expanded flagged terms
7. `src/integrations/supabase/types.ts` — regenerated types

