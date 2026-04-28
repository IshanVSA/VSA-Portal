## Goal

Show the actual search queries that triggered Google Ads to appear and get clicked, alongside existing campaigns/spend metrics in the Google Ads Analytics tab.

## What gets added

A new **"Search Terms"** card under Campaign Performance showing:
- Search query text
- Matched keyword
- Clicks, Impressions, Cost, CTR, Avg CPC, Conversions
- Sortable, top 50 by cost (descending)
- Scoped to the selected date range (same `DateRangeFilter` used for the rest of the tab)

## Backend changes (`supabase/functions/sync-google-ads/index.ts`)

1. After the existing campaign GAQL query, run a second GAQL query against the `search_term_view` resource:

   ```sql
   SELECT
     search_term_view.search_term,
     segments.keyword.info.text,
     metrics.clicks,
     metrics.impressions,
     metrics.cost_micros,
     metrics.conversions,
     segments.date
   FROM search_term_view
   WHERE segments.date DURING LAST_30_DAYS
   ```

2. Aggregate per `search_term` (sum across days), keep `daily` breakdown so the date filter works client-side.
3. Add `search_terms: [{ term, keyword, clicks, impressions, cost, conversions, daily: [{date, clicks, impressions, cost, conversions}] }]` to the `metrics_json` payload inserted into the `analytics` table.
4. No DB migration needed — `metrics_json` is already JSONB.

## Frontend changes (`src/components/department/GoogleAdsAnalyticsTab.tsx`)

1. Extend the `MetricsJson` interface with `search_terms?: SearchTerm[]`.
2. In the `useMemo` `computed` block, filter each search term's `daily` array by `dateRange`, recompute totals, sort by cost desc, take top 50.
3. Render a new Card "Top Search Terms" with a table (Term, Keyword, Clicks, Impr., Cost, CTR, CPC, Conv.). Hidden if empty.
4. Backwards compatible — old analytics rows without `search_terms` simply hide the card until the next sync runs.

## Cron behavior

The existing `google-ads-cron` calls `sync-google-ads` daily at 07:00 UTC, so search terms will refresh automatically. Staff can also click "Sync Data" to backfill immediately.

## Notes / caveats

- Google Ads only returns search terms with at least 1 impression in the period; very-low-volume queries may be omitted by Google.
- Payload size: search terms can be large. Capping storage at top 200 by cost (server-side) before inserting keeps `metrics_json` lean while still giving the UI plenty to display.
