

## Plan: Layer 2 — Review Mining

### Overview
Create a new edge function that fetches Google reviews for a clinic, uses AI to extract recurring themes, voice fingerprint seeds, and differentiator validation. Results are stored in `clinic_brand_dna.additional_fields` under a `review_mining` key. BC clinics (CVBC jurisdiction) are skipped per compliance rules.

### Database Changes

**Migration: Add `google_place_id` to clinics table**
```sql
ALTER TABLE public.clinics
ADD COLUMN IF NOT EXISTS google_place_id TEXT DEFAULT NULL;
```
This column stores the Google Place ID for each clinic, used to fetch reviews. The edge function will auto-discover the Place ID on first run using the clinic name + address via Google Places Text Search, then cache it.

### Edge Function: `mine-reviews`

New function at `supabase/functions/mine-reviews/index.ts`:

1. Accepts `{ clinic_id }`, validates auth (admin/concierge only)
2. Checks jurisdiction from `clinic_gbp_config` — if `jurisdiction = 'CVBC'`, returns early with a message that review mining is skipped for BC clinics
3. Looks up `google_place_id` on the clinics table:
   - If missing, uses Google Places Text Search API (`clinic_name + address`) to find it, then saves it to the clinics row
4. Fetches reviews using Google Places Details API (fields: `reviews`)
5. Sends review text to Claude Opus 4.6 with a structured tool call to extract:
   - `top_themes` — Top 3 recurring themes clients mention (with example quotes)
   - `voice_fingerprint_seeds` — Recurring phrases/language patterns from positive reviews
   - `differentiator_signals` — Review themes that recur across multiple reviews indicating genuine differentiators
   - `sentiment_summary` — Overall sentiment breakdown
   - `review_count` — Number of reviews analyzed
   - `avg_rating` — Average star rating
   - `confidence` — low/medium/high
6. Upserts result into `clinic_brand_dna.additional_fields.review_mining`
7. Uses `GOOGLE_PAGESPEED_API_KEY` (already configured) — need to verify this key has Places API enabled, otherwise will need a separate `GOOGLE_PLACES_API_KEY`

### Frontend Changes

**`src/hooks/useBrandDNA.ts`**: Add `mineReviews` mutation that invokes the `mine-reviews` function.

**`src/components/social/BrandDNATab.tsx`**:
- Add "Mine Google Reviews" button next to the "Extract from Website" button
- Add a "Layer 2 — Review Mining" card section (similar to the Layer 1 card) displaying:
  - Top themes with example quotes
  - Voice fingerprint seed phrases as badges
  - Differentiator signals
  - Review count, average rating, confidence badge
  - Timestamp of last mining run
- Show a note for CVBC clinics explaining why review mining is unavailable

### API Key Consideration
The existing `GOOGLE_PAGESPEED_API_KEY` secret may work if the Places API is enabled on the same Google Cloud project. If not, a new `GOOGLE_PLACES_API_KEY` secret will need to be added. The function will try the existing key first.

### Files to Create/Modify
1. **Migration** — Add `google_place_id` column to clinics
2. **`supabase/functions/mine-reviews/index.ts`** — New edge function
3. **`src/hooks/useBrandDNA.ts`** — Add `mineReviews` mutation
4. **`src/components/social/BrandDNATab.tsx`** — Add Layer 2 UI button + display card

