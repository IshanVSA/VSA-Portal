## Goal

Auto-create geographic clusters and batches for every existing clinic, and keep them auto-maintained for any new clinic added in the future — no manual setup required.

## How clusters will be derived

Today, `geo_clusters` is empty and clusters are admin-curated. We'll switch to **automatic city-based clustering**:

- A cluster = one city. `cluster_id` = uppercased city slug (e.g. `SURREY`, `VANCOUVER`, `BURNABY`).
- `region` = the same city name (display-friendly).
- City is parsed from `clinics.address` (no `city` column exists, so we extract it from the comma-separated address text — the second-to-last comma group before the postal code, with a small province/postal-code stripper).
- A clinic with no parseable city goes into a fallback cluster `UNASSIGNED` (still gets a batch as a solo entry).
- `is_solo` is computed from final cluster size (1 → solo, ≥2 → shared).

A quick scan of current data shows we'll get clusters like:
SURREY (8), VANCOUVER (10+), BURNABY (3), ABBOTSFORD (4), CALGARY (2), NANAIMO (2), MISSION (2), LANGLEY (2), MAPLE-RIDGE, SQUAMISH, KELOWNA, VICTORIA, COQUITLAM, NORTH-VANCOUVER, CENTENNIAL, SAN-FRANCISCO, LADNER, etc.

## Plan

### 1. DB migration: address parser + auto-cluster engine

Add three SECURITY DEFINER functions in a migration:

- `extract_city_from_address(_address text) → text` — splits on commas, strips postal codes (Canadian `A1A 1A1`, US 5-digit), strips province codes (BC/AB/ON/CA/CO/WA…), trims, returns the cleaned city or `NULL`.
- `slugify_city(_city text) → text` — uppercases, replaces spaces with `-`, strips punctuation. Used as `cluster_id`.
- `rebuild_geo_clusters() → void` — recomputes `geo_clusters` rows from current clinics:
  - Groups all `clinics.id` by extracted city.
  - Upserts `geo_clusters` (cluster_id, region, clinics, is_solo).
  - Deletes `geo_clusters` rows whose `cluster_id` no longer has any clinics.
  - Ensures every clinic has a `clinic_gbp_config` row (insert with defaults — `geo_radius_km=7`, `hospital_type=NULL`, `local_landmarks='{}'`, `cluster_position` assigned A/B/C/D round-robin within the cluster).
  - Calls the existing `regenerate_gbp_batches()` trigger function once at the end (re-creates `gbp_batches` from clusters + configs).

### 2. Trigger: keep it auto on clinic add/edit/delete

Add an AFTER INSERT/UPDATE/DELETE trigger on `public.clinics` that calls `rebuild_geo_clusters()` whenever:
- A new clinic is inserted, OR
- An existing clinic's `address` changes, OR
- A clinic is deleted.

This replaces the manual "Add Cluster" workflow for the common case while keeping the existing manual UI working as an override.

### 3. One-time backfill

Run `SELECT public.rebuild_geo_clusters();` immediately after the migration so all current clinics, configs, and batches exist on first load.

### 4. Light UI updates (Cluster Manager)

In `src/components/seo/gbp/ClusterManager.tsx`:

- Add a small **"Auto-Generated"** badge next to clusters whose `cluster_id` matches a city slug pattern, plus an admin **"Rebuild from clinic addresses"** button at the top that calls `supabase.rpc('rebuild_geo_clusters')`.
- Keep the existing "Add Cluster" / Edit / Delete controls unchanged so admins can still curate manually when an auto-generated grouping isn't right.

### 5. UI fix: Generate Batches button

While here, also add the missing admin **"Generate Batches"** button in `src/components/seo/gbp/BatchQueue.tsx` (the empty-state copy already references it but it's never rendered). It calls the existing `generate-batch-queue` edge function and the existing `useGBPBatches.generateQueue` mutation.

## Files / artifacts

- **Migration** (new): create `extract_city_from_address`, `slugify_city`, `rebuild_geo_clusters`, the `clinics` trigger, and a final `SELECT public.rebuild_geo_clusters();` backfill.
- **Edit:** `src/components/seo/gbp/ClusterManager.tsx` — Rebuild button + Auto-Generated badge.
- **Edit:** `src/components/seo/gbp/BatchQueue.tsx` — admin Generate Batches button.

No edge function changes; no new secrets.

## What this does NOT do

- Does not geocode addresses. Cities are parsed from the existing address string only — clinics with vague addresses like *"Abbotsford, BC, Canada"* will still cluster correctly (city = Abbotsford), but malformed addresses fall into `UNASSIGNED` and an admin can manually move them.
- Does not auto-fill landmarks or hospital type. Those remain admin-editable in the Clinic GBP Configuration form.
- Does not change the existing `regenerate_gbp_batches()` logic — we reuse it.

## End-state for Brentwood

After this change, on next page load Brentwood will appear in cluster `BURNABY` (with Deer Lake Animal Hospital) and a corresponding batch will exist in Batch Queue automatically.
