

## Plan: Auto-Fill GBP DNA Profile From Brand DNA + Backfill All Clinics

### Problem
- 46 clinics in `clinic_gbp_config` have empty v2.0 DNA fields (country, governing_body, city, voice_fingerprint, etc.)
- Only Alma Animal Hospital (b82b1dac) was manually populated
- When Brand DNA synthesis completes, the GBP config isn't automatically updated

### Two-Part Solution

**Part 1 — Backfill existing clinics using address parsing**

Write a database migration that updates all 46 clinics with `country IS NULL` by parsing their `address` and `jurisdiction` fields:

- **country**: `jurisdiction = 'BC'` or `'CA-OTHER'` → `'CA'`, `jurisdiction = 'US'` → `'US'`
- **governing_body**: `jurisdiction = 'BC'` → `'CVBC'`, Alberta clinics → `'ABVMA'`, US clinics → mapped per state
- **state_or_province**: Parse from address (BC, AB, CA, WA, CO, etc.)
- **city**: Parse from address (Vancouver, Surrey, Calgary, etc.)
- **stat_holiday_protocol**: Default `'CONFIRM ANNUALLY'`

For the 3 clinics with synthesized Brand DNA, also populate:
- `voice_fingerprint` from `synthesized_profile->>'voice_fingerprint'`
- `narrative_anchor` from `synthesized_profile->>'narrative_anchor'`
- `clinic_differentiator` from `synthesized_profile->>'clinic_differentiator'`
- `founding_story` from `synthesized_profile->>'founding_story'`
- `content_exclusions` from `synthesized_profile->'content_exclusions'`
- `species_treated` from website extraction or call notes
- `after_hours_referral` from `synthesized_profile->>'after_hours_referral'`

**Part 2 — Auto-sync GBP config when Brand DNA is synthesized**

Modify the `synthesize-dna` edge function to automatically push relevant synthesized profile fields into `clinic_gbp_config` after a successful synthesis. After saving the synthesized profile to `clinic_brand_dna`, add an upsert to `clinic_gbp_config` that maps:

| Brand DNA synthesized_profile field | → clinic_gbp_config column |
|---|---|
| voice_fingerprint (joined array) | voice_fingerprint |
| narrative_anchor | narrative_anchor |
| clinic_differentiator | clinic_differentiator |
| founding_story | founding_story |
| content_exclusions | content_exclusions |
| governing_body | governing_body |
| hospital_type | hospital_type (mapped to 1/2/3) |
| stat_holiday_protocol | stat_holiday_protocol |
| jurisdiction (parsed) | country, state_or_province, city |

This only sets fields that are currently NULL in GBP config (won't overwrite manual edits). Also parse the clinic's address to fill country/state_or_province/city if not already set.

### Files Changed
1. New migration SQL — backfill country, governing_body, state_or_province, city for all 46 clinics + DNA fields for 3 synthesized clinics
2. `supabase/functions/synthesize-dna/index.ts` — add auto-sync to `clinic_gbp_config` after successful synthesis

