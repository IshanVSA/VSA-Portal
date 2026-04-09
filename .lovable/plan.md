

## Plan: Add Geographic Demographics to Website Analytics

### Problem
The current tracking pixel collects only `path`, `referrer`, `session_id`, and `clinic_id`. No geographic data is captured, so there's no way to show where visitors come from.

### Approach
Use **server-side IP geolocation** in the `track-pageview` edge function. When a pageview POST arrives, extract the visitor's IP from request headers and resolve it to country/region using a free geolocation API. Store the result in new columns on `website_pageviews`. Display a geographic breakdown in the Website Analytics tab.

### Technical Details

**Step 1 — Database migration**: Add two columns to `website_pageviews`:
```sql
ALTER TABLE public.website_pageviews
  ADD COLUMN IF NOT EXISTS country_code text,
  ADD COLUMN IF NOT EXISTS region text;
```

**Step 2 — Update `track-pageview` edge function**:
- Extract visitor IP from `x-forwarded-for` or `cf-connecting-ip` header (Supabase edge functions run behind a proxy that sets these).
- Call a free geo-IP service (e.g., `https://ipapi.co/{ip}/json/` — no API key needed for moderate volume, or `ip-api.com`). Use a simple fetch with a short timeout so it doesn't slow down tracking.
- If geo lookup fails, still insert the pageview with `null` country/region (non-blocking).
- Store `country_code` (e.g., "US") and `region` (e.g., "California") on the insert.

**Step 3 — Update `WebsiteAnalyticsTab.tsx`**:
- Fetch the new columns in the existing pageview query.
- Add a "Visitor Geography" card showing:
  - A table with country, region, visitor count, and percentage.
  - Sorted by visitor count descending.
- Use a horizontal bar chart (recharts `BarChart`) for top 10 countries.
- Filter by the same date range already in use.

**Step 4 — Update `useWebsiteKPIs.ts`** (optional): Add a top-countries summary to the dashboard KPI cards if desired.

### Privacy Note
Only country and region are stored — no precise coordinates or raw IP addresses. This keeps it GDPR-friendly and consistent with the existing anonymous tracking approach.

### Limitations
- Free geo-IP APIs have rate limits (~1000/day for ip-api.com free tier, ~30k/month for ipapi.co). For higher volume clinics, a paid plan or a bulk lookup service would be needed.
- Existing historical pageviews won't have geographic data — only new visits going forward.

### Files Changed
1. New migration SQL — add `country_code`, `region` columns
2. `supabase/functions/track-pageview/index.ts` — geo lookup on POST
3. `src/components/department/WebsiteAnalyticsTab.tsx` — geography card + chart

