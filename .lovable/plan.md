# Make Website Analytics Faster

The previous round parallelized pagination and cached formatters. The remaining cost is dominated by **(a) shipping every raw pageview row over the wire**, and **(b) re-fetching from scratch every time you switch clinics or tabs**. This plan removes both.

## What to build

### 1. Aggregate on the database (biggest win)
Add a Postgres RPC `get_website_analytics(clinic_id, from, to)` that returns a single JSON payload containing everything the tab needs, computed in SQL:

- KPI totals: page views, unique sessions, engaged sessions (sessions with >1 view), avg session duration (capped at 15 min), pages/session — for both the current half and previous half of the range
- Daily traffic series (one row per day, in clinic timezone)
- Hourly distribution (24 buckets, in clinic timezone)
- Top 10 pages with views + unique visitors
- Session-depth mix (1 / 2–3 / 4+ pages)
- Country + top-3 regions breakdown

Clinics with 5–20k pageviews currently transfer 5–20k JSON rows (~1–5 MB). The aggregated payload is ~5–20 KB and computes in Postgres in tens of ms. Net effect: ~10× faster initial load, ~100× less bandwidth.

The RPC will be `SECURITY DEFINER` with the same access check the table RLS already enforces (admin, concierge member of clinic, or client of clinic).

### 2. Confirm/add the supporting index
Ensure `website_pageviews(clinic_id, created_at)` is indexed (create it if missing). This is what makes the aggregation cheap.

### 3. Move the tab to React Query with caching
Replace the raw `useEffect` + `useState` fetch in `WebsiteAnalyticsTab.tsx` and `useWebsiteKPIs.ts` with `useQuery`:

- `queryKey: ["website-analytics", clinicId, fromKey, toKey]`
- `staleTime: 5 minutes`, `gcTime: 30 minutes`
- `placeholderData: keepPreviousData` so changing the date range keeps the old chart visible while new data loads (no skeleton flash)

Effect: switching back to the tab, toggling between 7/14/30/90-day ranges that overlap, or revisiting a clinic is instant from cache.

### 4. Small client-side cleanups
- In `WebsiteAnalyticsTab.tsx`, the `geoData` memo still calls `getZonedDateKey` per row instead of reading `__dateKey`. Switch it to use the precomputed key (skip if we move to the RPC — geo will be server-aggregated).
- Keep `fetchAllPageviews` as a fallback only (no longer the hot path).

## Files touched

- `supabase/migrations/*` (new): create `get_website_analytics` RPC + index if missing
- `src/lib/website-analytics.ts`: add a thin `fetchWebsiteAnalytics(clinicId, from, to)` wrapper around the RPC, keep existing helpers
- `src/components/department/WebsiteAnalyticsTab.tsx`: switch to `useQuery`, consume RPC payload directly, remove client-side recomputation
- `src/hooks/useWebsiteKPIs.ts`: switch to `useQuery` against the same RPC (request a 14-day window)

## Expected result

- First load of a clinic with thousands of pageviews: ~300–500 ms instead of 3–8 s
- Tab/clinic re-visits within 5 min: instant (cache hit)
- Date-range changes: previous chart stays visible, new data fades in (no full skeleton)

Reply "go" to implement, or tell me to skip any step (e.g. keep client-side compute and only add caching).