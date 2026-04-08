

## Plan: Fix Locality Data Not Reaching Synthesis Engine

### Root Cause

The `locality-fetch` edge function stores its results at `additional_fields.locality` (a nested object with keys like `neighbourhood`, `local_trails_and_parks`, `cultural_communities`, `wildlife_profile`, etc.).

However, the `synthesize-dna` function (lines 393-400) looks for flat top-level keys in `additionalFields`:
- `neighbourhood_character`
- `local_trails_parks`
- `cultural_communities`

These keys don't exist at the top level — the data lives under `additionalFields.locality.neighbourhood`, `additionalFields.locality.local_trails_and_parks`, etc. So the synthesis engine never sees the locality data and the AI scores those fields as empty.

### Fix

**File: `supabase/functions/synthesize-dna/index.ts`** — Update `buildUserMessage` to read locality data from `additionalFields.locality` and include it as a dedicated section in the AI prompt. Specifically:

1. Add a `=== LOCALITY PROFILE ===` section to the user message that dumps the full locality object (neighbourhood, trails/parks, wildlife, cultural communities, housing character, seasonal notes, community anchors, commuter profile).

2. Update the "ADDITIONAL FIELDS" section (lines 393-400) to also pull from `additionalFields.locality` for the specific keys the scoring needs (`neighbourhood`, `cultural_communities`, `local_trails_and_parks`).

This way the AI will have the full locality context for synthesis, and the scoring fields will be populated correctly.

### Impact

After this fix, re-running "Synthesize DNA" for Alma will incorporate all the locality data (Pacific Spirit Park, coyote warnings, Dunbar Village, cultural communities, etc.) and the completeness score should increase by ~4 points (neighbourhood: 2, cultural_communities: 1, local_trails: 1).

### Files
- **`supabase/functions/synthesize-dna/index.ts`** — Update `buildUserMessage` to read from `additionalFields.locality`

