

## Plan: Fix Review Mining — Wrong Business Match

### Root Cause

The clinic "alma" (id: `2bdf419c`) has a stale `google_place_id` (`ChIJPSygrRpzhlQRjA1GunLrVBY`) that points to "ALMA Building and Renovation Ltd." instead of "Alma Animal Hospital". Since the `mine-reviews` function skips the search when a `google_place_id` already exists (line 60-61), it fetches reviews for the wrong business.

Additionally, the duplicate clinic "Alma Animal Hospital" (id: `b82b1dac`) has no `google_place_id` at all but has the correct name.

### Changes

**1. Data fix — Clear stale Place ID (migration)**
- Set `google_place_id = NULL` for clinic `2bdf419c` so the function re-resolves it.

**2. Harden `mine-reviews` Place ID resolution (edge function)**
- After fetching reviews using a stored `google_place_id`, **validate** that the returned `displayName` reasonably matches the `clinic_name`. If the name doesn't match (e.g., "Building and Renovation" vs "Animal Hospital"), discard the stored ID and re-search.
- Improve the text search query to append "veterinary" or "animal hospital" context when the clinic name alone is too generic (e.g., just "alma").
- When re-searching, update the stored `google_place_id` with the corrected value.

**3. Harden `locality-fetch` with same validation**
- Apply the same displayName validation logic so locality data also targets the correct business.

### Technical Detail

The name-match validation will use a simple word-overlap check: tokenize both the clinic name and the returned `displayName`, and require at least one significant word overlap (ignoring common words like "the", "and", "ltd"). If no overlap, the function falls back to a fresh text search with `"{clinic_name} veterinary {address}"`.

### Files
- **Migration** — `UPDATE clinics SET google_place_id = NULL WHERE id = '2bdf419c-...'`
- **`supabase/functions/mine-reviews/index.ts`** — Add displayName validation + smarter search query
- **`supabase/functions/locality-fetch/index.ts`** — Same displayName validation

