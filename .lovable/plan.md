# GA4 Traffic Acquisition in SEO Department

Add a new "Traffic" tab under SEO showing the same data as GA4 → Acquisition → Traffic acquisition: KPI cards, sessions-over-time chart split by channel, and a channel breakdown table (Sessions, Engaged sessions, Engagement rate, Avg. engagement time, Events per session). Visible to clients and staff.

Pattern mirrors the existing Google Ads connection (`GoogleAdsConnectionCard` + `sync-google-ads` + `google-ads-cron`).

## Step 1 — Secrets & OAuth scope

Reuse existing `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_TOKEN_ENC_KEY` (already present for Ads/GBP). Add Analytics scope to a new OAuth edge function (kept separate from `google-oauth` which is Ads-only, to avoid breaking the verified Ads scope).

New scope requested: `https://www.googleapis.com/auth/analytics.readonly`.

In the Google Cloud Console (VSA Vet Media project) you'll need to:
- Enable **Google Analytics Data API (GA4)** and **Google Analytics Admin API**
- Add `analytics.readonly` to the OAuth consent screen scopes (sensitive; usually approved alongside existing Ads/GBP scopes since you're already verified)

## Step 2 — Database

New tables (created via migration):

- `clinic_ga4_credentials` — one row per clinic. Columns: `clinic_id` (FK, unique), `ga4_property_id`, `ga4_property_display_name`, `access_token_enc`, `refresh_token_enc`, `token_expires_at`, `connected_by`, timestamps.
- `clinic_ga4_traffic_daily` — `clinic_id`, `date`, `channel_group` (Organic Search / Paid Search / Direct / Cross-network / Organic Social / Referral / Unassigned / Other), `sessions`, `engaged_sessions`, `engagement_rate`, `avg_engagement_time_seconds`, `events_per_session`. Unique `(clinic_id, date, channel_group)`.

RLS:
- Credentials: admin/concierge full access, clients none.
- Traffic data: admin/concierge full access; clients SELECT on rows for their own clinic (via existing `clinic_users` mapping pattern).

## Step 3 — Edge functions

1. `ga4-oauth` — initiates OAuth (state = clinic_id), handles callback, lists GA4 properties via Admin API (`accountSummaries.list`), encrypts tokens, upserts `clinic_ga4_credentials`.
2. `ga4-list-properties` — re-list properties for the property-selection dialog.
3. `ga4-save-property` — store the chosen `ga4_property_id`.
4. `sync-ga4-analytics` — refresh access token if expired; call GA4 Data API `runReport` for the chosen property, dimensions `[date, sessionDefaultChannelGroup]`, metrics `[sessions, engagedSessions, engagementRate, userEngagementDuration, eventCount]`, range = last 30 days, then upsert into `clinic_ga4_traffic_daily`.
5. `ga4-analytics-cron` — daily 07:30 UTC; iterates connected clinics and invokes `sync-ga4-analytics` (mirrors `google-ads-cron`).

All use `CRON_SECRET` + admin auth fallback, AES-256-GCM token encryption (`enc:` prefix) per existing convention.

## Step 4 — Frontend

- `src/components/clinic-detail/GA4ConnectionCard.tsx` — Connect / Select Property / Disconnect, shown in Clinic Detail → Connections tab next to Meta / Google Ads / GBP cards.
- `src/components/clinic-detail/GA4PropertySelectionDialog.tsx` — same UX as `GoogleAccountSelectionDialog`.
- `src/hooks/useGa4Traffic.ts` — React Query hook (clinic_id, dateRange) returning aggregated KPIs, daily series by channel, and channel-table rows.
- `src/components/department/SeoTrafficTab.tsx` — KPI cards (Total Sessions, Engaged Sessions, Engagement Rate, Avg. Engagement Time, Events/session), Recharts multi-line chart of sessions by channel, channel breakdown table identical in columns to the screenshot. Uses shared `DateRangeFilter` (7/14/30/90d).
- `src/pages/SeoDepartment.tsx` — register new tab `{ value: "traffic", label: "Traffic", icon: TrendingUp }`, placed after Analytics. Visible to both staff and clients. Shows an empty "Connect Google Analytics" state (admin only sees connect CTA → deep-links to Clinic Detail Connections tab).

## Step 5 — Verification

- Connect a test clinic, run `sync-ga4-analytics` manually via `curl_edge_functions`, confirm rows in `clinic_ga4_traffic_daily`, and check the Traffic tab renders matching the screenshot.

## Technical notes

- GA4 channel grouping uses `sessionDefaultChannelGroup` (matches the screenshot exactly).
- Engagement rate = engagedSessions / sessions (do client-side to avoid GA4 API rounding).
- Avg. engagement time = userEngagementDuration / sessions formatted as `Xm Ys`.
- Use `runReport` (not `batchRunReports`) — single query is enough.
- 30-day default range; tab respects the date-range filter via additional `runReport` calls (cached by React Query).
- Reset state to zero on fetch start (project rule).

## Out of scope

- Per-page / landing-page tables (can be a follow-up).
- Realtime overview.
- The "VetMatrix Leads" screenshot (second image) is not part of this — confirm if you want that surfaced too.
