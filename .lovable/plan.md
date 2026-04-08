

## Plan: Complete Remaining Social Media Department Features

Based on the earlier gap analysis and current codebase review, here are the remaining items grouped into implementation batches.

### Batch 1 — Brand Identity Auto-Fetch (Phase 1c)

Currently the SM2 prompt references `primary_brand_color`, `secondary_brand_color`, `brand_font`, `logo_url`, and `visual_tone` but they're always "NOT FETCHED". The `extract-clinic-website` edge function already scrapes clinic websites — extend it to also extract brand colors (from CSS/meta tags), fonts, and logo URLs during Layer 1 extraction, storing them in `brand_dna.additional_fields`.

**Files:**
- `supabase/functions/extract-clinic-website/index.ts` — Add brand identity extraction (dominant colors from inline styles/CSS variables, logo from `<img>` tags with "logo" in src/alt, font families from computed styles)
- `supabase/functions/synthesize-dna/index.ts` — Read brand identity from `additional_fields` into the prompt (already partially wired)

### Batch 2 — Meta Ads Handoff Trigger (Phase 4b)

When a clinic's monthly engagement drops below a threshold or a promotion is active, surface an alert card in the Social Overview suggesting a Meta Ads boost. This is a UI-only feature reading existing analytics data.

**Files:**
- `src/components/social/SocialOverview.tsx` — Add a "Meta Ads Recommendation" card that checks if active promotions exist or engagement is low, linking to the Google Ads / Meta department

### Batch 3 — Performance Intelligence: Engagement Capture (Phase 5)

Add a `sm2_post_performance` table to track per-post engagement metrics (likes, shares, comments, reach) and display a simple performance card in the Generation tab so concierges can see which post types perform best.

**Files:**
- **Migration** — Create `sm2_post_performance` table (generation_id, post_number, platform, likes, shares, comments, reach, recorded_at)
- `src/components/social/ContentGenerationTab.tsx` — Add a "Top Performers" summary card below generation history

### Batch 4 — Notification System for Social Media (Phase 6)

Wire social-media-specific events into the existing `NotificationBell` system. Events: content generated, content sent to client, client approved, client submitted feedback, auto-approved.

**Files:**
- **Migration** — Insert notification triggers: after UPDATE on `sm2_generations` when `approval_status` changes, insert into existing notifications table
- `src/components/notifications/NotificationBell.tsx` — Ensure social media notification types render with appropriate icons/labels

### Batch 5 — Statutory Holiday Calendar (Phase 7)

Auto-populate `statutory_holidays` in `clinic_monthly_signals` based on the clinic's province. Create a reference table of Canadian statutory holidays and a DB function that fills them monthly.

**Files:**
- **Migration** — Create `statutory_holidays_reference` table (province, holiday_name, month, day_rule) with seed data for all Canadian provinces
- **Migration** — Create a DB function `populate_monthly_holidays` that auto-fills `clinic_monthly_signals.statutory_holidays` based on clinic province

### Batch 6 — Multi-Location Cluster Management (Phase 7b)

For clinic groups with multiple locations, add a "Cluster View" in the Social Overview that shows all locations' DNA scores, generation status, and posting schedules side by side. This leverages the existing `clinic_selector` and `geo_clusters` infrastructure.

**Files:**
- `src/components/social/SocialOverview.tsx` — Add a "Multi-Location Summary" card for admin users showing all clinics' social media status in a compact table

### Technical Notes

- Brand identity extraction will use regex on the scraped HTML (already fetched by `extract-clinic-website`) — no additional API calls needed.
- The statutory holiday reference table will be seeded with ~80 rows covering all 13 provinces/territories.
- Notification triggers will use Postgres trigger functions inserting into the existing `notifications` table.
- All new tables get RLS policies scoped to authenticated users with clinic access.

### Recommended Order

Start with **Batch 1** (brand identity auto-fetch) since it immediately improves DNA completeness scores, then **Batch 4** (notifications) for operational visibility, then **Batch 5** (holidays) for content accuracy.

