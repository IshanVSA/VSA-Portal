# VSA CTA Tracking — Implementation Plan

Adds a self-hosted CTA + session tracking pipeline (independent of GA4) so the SEO/Traffic department can show **organic-only** CTA performance with a real conversion-rate denominator. Matches existing portal styling (glass cards, Inter, dept-seo tint).

## 1. Database (Supabase migration)

Create `public.tracking_events` and `public.cta_daily` view per the spec, plus required GRANTs:

- Table `tracking_events`: `id, clinic_id (text), event_type ('session_start'|'cta_click'), cta_type (5 enums), channel (6 enums, default 'direct'), source, landing_page, page_path, session_id, created_at`.
- Indexes: `(clinic_id, created_at desc)`, `(channel, event_type)`.
- `GRANT SELECT ON public.tracking_events TO authenticated;` `GRANT ALL ... TO service_role;` (no anon — edge function writes with service role; portal users read).
- RLS enabled, policy "portal users can read" for `authenticated`.
- View `cta_daily` aggregating per `clinic_id, day, channel` with one column per CTA + `sessions` + `total_ctas`. Grant `SELECT` on view to `authenticated`.

## 2. Edge function `track-event`

New public function (no JWT) at `supabase/functions/track-event/index.ts`:
- CORS open (clinic sites are third-party origins).
- Validates `event_type`, `cta_type`, `channel` against whitelists.
- Rejects missing/`UNSET` `clinic_id`.
- Inserts via service-role client; truncates string fields to spec lengths.
- Add to `supabase/config.toml` with `verify_jwt = false`.

## 3. SEO/Traffic department — new "CTA Performance (Organic)" section

Add to `src/components/department/SeoTrafficTab.tsx` **below** the existing GA4 CTA card, clearly labeled as organic-only (separate data source). Keep existing GA4 card untouched.

- New hook `src/hooks/useCtaTracking.ts` querying `cta_daily` filtered to selected clinic + `channel='organic'` + reusing the existing `DateRangeFilter` range (7/30/90 already supported via shared filter).
- Three stat cards (reuse `StatsCard` styling already in the tab): **Organic Sessions**, **Total CTA Actions**, **Overall Conversion Rate**.
- Table: 5 rows in fixed order — Book Appointment, Find Us (Maps), Call Us, New Client Form, Email/Contact — columns Actions | Conversion Rate. `—` when sessions = 0.
- Daily trend line chart (Recharts, same as rest of tab) of `total_ctas` per day.
- Empty-state when no rows: "No organic tracking data yet — install the snippet from Tracking Setup."

## 4. Tracking Setup snippet generator

Replace the existing minimal `TrackingSetupCard` snippet output (or add a new "CTA Tracking" section below it on `ClinicDetail`) that renders the full IIFE snippet from the spec with:
- `clinicId` injected from the selected clinic.
- `endpoint` = `${VITE_SUPABASE_URL}/functions/v1/track-event`.
- Copy button (existing pattern).
- Install instructions block: paste before `</body>` or as GTM Custom HTML on All Pages; add `data-cta="..."` on each CTA element; `tel:`/`mailto:` auto-detected.

Keep the existing `track-pageview` card as-is — the two pipelines coexist (pageview = generic, track-event = CTA conversions).

## Technical notes

- `clinic_id` is `text` in the new table to match the snippet payload; existing app `clinic_id` UUIDs cast cleanly to text in queries.
- View columns are queried via `(supabase as any).from("cta_daily")` until `types.ts` is regenerated post-migration.
- No changes to the existing GA4 `useGa4Cta` hook or the GA4 CTA card.
- Service-role key stays only in the edge function env.

## Acceptance

- Pick clinic in SEO → Traffic → see Organic Sessions, per-CTA counts, conversion rates over 7/30/90 days.
- Clinic Detail → Tracking Setup shows copy-pasteable snippet with injected `clinicId` + endpoint.
- Snippet posting to `track-event` lands rows in `tracking_events`; SEO view reflects them within seconds.
