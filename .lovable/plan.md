
# Expand SEO → Analytics tab into a multi-source dashboard

Per your answers: **Google Search Console + Google Business Profile Performance + Form leads from existing tickets**. Rank tracking (DataForSEO) is skipped for now — easy to add later as a 4th block.

The Analytics tab becomes a stacked dashboard with four blocks, all clinic-scoped via `?clinic=`, all visible to clients.

```text
┌─ SEO → Analytics tab ───────────────────────────────────────┐
│ [Date range: 7d / 14d / 30d / 90d]                          │
│                                                             │
│ ① Search Console               (new — GSC API)              │
│   KPIs: Clicks · Impressions · CTR · Avg. position          │
│   Line chart (clicks + impressions over time)               │
│   Top queries table · Top pages table                       │
│                                                             │
│ ② Google Business Profile      (new — GBP Performance API)  │
│   KPIs: Calls · Direction requests · Website clicks ·       │
│         Business profile views (search + maps split)        │
│   Line chart by metric                                      │
│                                                             │
│ ③ Leads overview               (new — derived from tickets) │
│   KPIs: Total leads · Form leads · (Call leads placeholder) │
│   Source breakdown (ticket type) · Recent leads list        │
│                                                             │
│ ④ Existing SEO snapshot card   (kept — DA / backlinks /     │
│                                 keywords top-10 from         │
│                                 uploaded reports)            │
└─────────────────────────────────────────────────────────────┘
```

## Step 1 — Google Search Console

**OAuth.** New scope `https://www.googleapis.com/auth/webmasters.readonly`. Mirror the GA4 pattern — separate edge function so it doesn't break the verified Ads/GBP scopes.

Reuses existing `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_TOKEN_ENC_KEY`. New redirect URI to add in Google Cloud Console:
```
https://yuyossgquiyuoqbeenri.supabase.co/functions/v1/gsc-oauth/callback
```

**Tables**
- `clinic_gsc_credentials` — `clinic_id` (unique), `site_url`, `site_display_name`, `access_token_enc`, `refresh_token_enc`, `token_expires_at`, `connected_by`, timestamps.
- `clinic_gsc_daily` — `clinic_id`, `date`, `clicks`, `impressions`, `ctr`, `position`. Unique `(clinic_id, date)`.
- `clinic_gsc_queries` — `clinic_id`, `date_bucket_start`, `date_bucket_end`, `query`, `clicks`, `impressions`, `ctr`, `position`. Top 50 per sync.
- `clinic_gsc_pages` — same shape as queries, keyed by `page` URL.

RLS: admin/concierge full; clients SELECT for their own clinic.

**Edge functions**
- `gsc-oauth` — initiate + callback, list verified sites via `sites.list`, encrypt tokens.
- `gsc-save-site` — store chosen `site_url`.
- `sync-gsc` — refresh token; 3 `searchAnalytics.query` calls (by `date`, by `query`, by `page`) for last 90 days; upsert.
- `gsc-cron` — daily 07:45 UTC.

**UI**
- `GSCConnectionCard` in Clinic Detail → Connections.
- `GSCSiteSelectionDialog`.
- `SeoGscPanel` rendered inside Analytics tab.

## Step 2 — Google Business Profile Performance

GBP OAuth already exists (`gbp-oauth`) with `business.manage` scope, which covers Performance API reads. We only need to add **read + sync + render**, no new OAuth flow.

**Tables**
- `clinic_gbp_performance_daily` — `clinic_id`, `location_id`, `date`, `business_impressions_desktop_maps`, `business_impressions_desktop_search`, `business_impressions_mobile_maps`, `business_impressions_mobile_search`, `call_clicks`, `website_clicks`, `business_direction_requests`, `business_bookings`. Unique `(clinic_id, location_id, date)`.

**Edge functions**
- `sync-gbp-performance` — calls `businessprofileperformance.googleapis.com/v1/locations/{location}:fetchMultiDailyMetricsTimeSeries` for last 90 days using existing encrypted GBP token; upserts.
- `gbp-performance-cron` — daily 07:50 UTC.

**UI**
- `SeoGbpPerformancePanel` in Analytics tab. KPI cards + Recharts multi-line chart with metric toggles.

## Step 3 — Leads (from existing tickets)

No new integration. Treat tickets matching configured types as leads.

- `useClinicLeads(clinicId, dateRange)` hook → queries `tickets` filtered by `clinic_id`, `ticket_type IN ('website_form_submission', 'lead_inquiry', ...)` (configurable list in `src/lib/lead-ticket-types.ts`), and `created_at` in range.
- KPIs: total leads, form leads, (call leads = 0 with "Connect call tracking" CTA placeholder).
- Source breakdown by ticket type.
- "Recent leads" list — last 10, click-through deep-links to existing ticket detail.

UI: `SeoLeadsPanel` inside Analytics tab.

## Step 4 — Wire into Analytics tab

`src/components/department/SeoAnalyticsTab.tsx`:
- Keep existing snapshot card at the bottom.
- Add shared `<DateRangeFilter>` at the top.
- Stack: GSC panel → GBP Performance panel → Leads panel → existing snapshot.
- Each panel handles its own empty/connect/locked state independently.

Both new connect cards land in Clinic Detail → Connections, matching Meta / Ads / GBP / GA4 styling.

## Step 5 — Verification

- Connect a test clinic to GSC, run `sync-gsc` via `curl_edge_functions`, confirm rows.
- Trigger `sync-gbp-performance` for a clinic already connected to GBP, confirm rows.
- Open `/seo?clinic=...&tab=analytics` and confirm all 3 panels render + respect date filter + client role can view.

## Out of scope (for now, easy follow-ups)

- DataForSEO rank tracking (skipped per your answer; would slot in as panel ⑤).
- CallRail / Twilio call leads (would convert the call-leads placeholder into real data).
- Cross-clinic admin roll-up page (Analytics tab is per-clinic).
- Form-webhook endpoint (using existing tickets instead).

## Technical notes

- GSC API is free, quota generous. Daily sync of 90 days is well under limits.
- GBP Performance API uses the existing `gbp-` OAuth token; no Google Cloud Console change required.
- All token storage uses AES-256-GCM `enc:` prefix per existing convention.
- Reset state to zero on fetch start (project rule).
- Use shared `DateRangeFilter` (7/14/30/90d).

**This will land in ~5 edge functions, 4 new tables, 2 new connection cards, and 3 new panels in the Analytics tab.** Want me to start with the GSC slice (OAuth + connect card + panel) and then layer GBP Performance + Leads in the same loop?
