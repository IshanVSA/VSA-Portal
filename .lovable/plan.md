
# Extended SEO Analytics Tab (Traffic)

Goal: on the SEO department → Traffic tab, add a positive-metrics dashboard sourced from Google Analytics 4 (already integrated) and Google Search Console (new per-clinic OAuth). Everything on the exclusion list is filtered out of queries and UI.

## 1. Google Search Console integration (new)

Mirror the existing GA4 flow.

- **Migration:** new tables
  - `clinic_gsc_credentials` (clinic_id PK, refresh_token_enc, site_url, permission_level, last_sync_at, connected_by, timestamps)
  - `clinic_gsc_daily` (clinic_id, date, device, country, query, page, impressions, clicks, ctr, avg_position) — one row per (clinic, date, dimension bucket). Sensible composite PK + indexes on clinic+date.
  - RLS: same pattern as `clinic_ga4_*` (admin/concierge full; client via clinic assignment; sub_client via `sub_account_has_clinic_access`). Explicit GRANTs for `authenticated` and `service_role`.
- **Edge functions:**
  - `gsc-oauth` — auth-code + refresh-token exchange, encrypts refresh token with existing AES key.
  - `gsc-save-property` — persists chosen `siteUrl` from `sites.list`.
  - `sync-gsc-data` — pulls last 16 months on first sync, then daily incremental. Uses Search Analytics API with dimensions [date], [date,query], [date,page], [date,country], [date,device]. Discards rows with 0 impressions.
  - Add `sync-gsc-data` invocation to the existing daily cron (same time as GA4).
- **Clinic Detail → Connections:** new `GSCConnectionCard` + `GSCPropertySelectionDialog`, matching the GA4 components.
- **Secrets:** reuse `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`; add scope `https://www.googleapis.com/auth/webmasters.readonly`.

## 2. New data hook — `useSearchConsole(clinicId, dateRange)`

Reads from `clinic_gsc_daily`. Returns:
- Totals: impressions, clicks, CTR, avg position (weighted by impressions).
- Daily trend series.
- Top queries (by clicks, positive-only — position ≤ 50).
- Top pages (by clicks).
- Geo breakdown, device breakdown.
- Brand vs non-brand split — brand pattern derived from clinic name tokens.
- Opportunity queries — position 11–20 with impressions > 0.

## 3. YoY comparison helpers

- Extend `useGa4Traffic` and add `useGa4TrafficCompare(clinicId, range, compareMode)` where compareMode ∈ `"yoy" | "prev_period"`. Fetches current window + prior window in one call, returns `{ current, previous, deltaPct }` for each KPI.
- Same pattern for GSC hook.
- Ensure `sync-ga4-traffic` and `sync-gsc-data` backfill 400 days on first connect so YoY is meaningful; current GA4 sync window is expanded accordingly.

## 4. Traffic tab UI extension

Keep the existing sections (channel chart, channel table, CTA cards, organic CTA card, sync controls). Add above them:

- **Range selector:** small segmented control alongside the existing DateRangeFilter — `30d / 60d / 90d / 365d` + Compare toggle (`YoY ▾` with `Previous period` option). Selection drives every panel on the tab.
- **Top-Level KPI strip (8 tiles):** Organic Sessions, Organic Users, CTR, Goal Conversions, Avg. Search Position, Pages Indexed, Conversion Rate (Organic), Impressions. Each tile shows value + green ▲ delta or grey → (negative hidden per exclusion rules).
- **Search Performance section (GSC):**
  - Clicks + Impressions dual-line trend.
  - Top queries table (query, clicks, impressions, CTR, avg position) — filtered to position ≤ 50.
  - Top pages table.
  - Opportunity queries (position 11–20) callout list.
  - Brand vs non-brand donut.
  - Device split (mobile/desktop/tablet) bars — no error rows.
- **Audience Insights section (GA4):** New vs returning donut, returning-visitor rate, user acquisition by channel bar chart.
- **Engagement section (GA4):** Avg session duration, pages per session, engagement rate, avg engagement time — trend sparklines. Bounce rate intentionally omitted (exclusion list #1/#4).
- **Conversions section (GA4):** Goal completions + conversion rate, top converting landing pages (only pages with completions > 0).
- **Geo section:** country table combining GSC clicks + GA4 sessions.

All panels degrade gracefully:
- If GA4 not connected → existing "connect GA4" card.
- If GSC not connected → in-panel prompt with Connect button (admin only).
- Empty periods show neutral "No data yet".

## 5. Exclusion filtering (enforced in queries + UI)

- Bounce rate, exit rate, session-duration-<30s pages, high-bounce lists — never queried or rendered.
- Crawl/index/security/mobile-usability/AMP/structured-data error surfaces — not requested from GSC.
- Negative deltas: value still shows, but arrow + colour hidden (renders as grey →) so clients never see red trends.
- Traffic-decline trend lines still draw (chart truth), but headline deltas suppress negatives.

## Technical notes

- Reuse `encryptToken`/`decryptToken` from `_shared` (as GA4 does).
- Reuse `extractEdgeFunctionError`, `DateRangeFilter`, `SeoChannelOverview` styles.
- New components: `SeoKpiStrip.tsx`, `SearchConsolePanel.tsx`, `AudiencePanel.tsx`, `EngagementPanel.tsx`, `ConversionsPanel.tsx`, `GeoPanel.tsx`, `GSCConnectionCard.tsx`, `GSCPropertySelectionDialog.tsx`.
- GSC API quota: batch requests, cache 24h, request only needed dimensions per pull.
- No new frontend routes; everything renders inside `SeoTrafficTab`.

## Out of scope (call out if user wants later)

- Backlink growth / referring domains (needs Ahrefs/Semrush, not in GSC free tier).
- Assisted conversions (needs GA4 attribution paths — heavier query).
- E-commerce revenue (no clinic has ecommerce).
