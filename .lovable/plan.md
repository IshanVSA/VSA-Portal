
Website Analytics updates will need both UI changes and one small database change because the app currently has no clinic timezone field.

1. Add clinic timezone support
- Add a timezone column on `clinics` (IANA timezone like `America/New_York`).
- Add a timezone selector on the clinic detail/settings page so each clinic can have its own fixed timezone.
- Use the clinic timezone as the source of truth for all website analytics date/hour grouping.

2. Fix website analytics calculations to use clinic timezone
- Update `WebsiteAnalyticsTab` to fetch the clinic timezone along with pageviews.
- Replace all current browser/local-time grouping logic (`new Date(...).getHours()`, ISO date slicing) with clinic-timezone-aware helpers.
- Apply that timezone to:
  - Traffic by hour
  - Daily traffic chart
  - Current vs previous period split
  - Any “today” / date-boundary logic that website analytics uses
- Show the timezone in the chart title, e.g. `Traffic by Hour (America/New_York)`.

3. Replace engagement percentage with numeric engagement
Current behavior:
- “Engagement Rate” is calculated as `100 - bounce rate` and shown as a percent.

Planned change:
- Replace that KPI with a numeric metric such as `Engaged Sessions`.
- Define engaged sessions as sessions with more than 1 pageview.
- Update the card value and comparison text to show counts, not percentages.
- Keep the calculation consistent anywhere website analytics/report preview reuses this metric.

4. Replace “Top Referrers” with “Pages / Session Mix”
Based on your selection, replace that section with session-depth buckets, for example:
- 1 page
- 2–3 pages
- 4+ pages
Each row/card will show:
- session count
- share of total sessions
This gives a more useful quality signal than referrers for the current data model.

5. Show readable page names instead of raw slugs
- Auto-format paths into human-friendly labels:
  - `/` → `Home`
  - `/about-us` → `About Us`
  - `/services/dental-care` → `Services / Dental Care`
- Keep the raw path available as secondary muted text or tooltip if needed.
- Apply the same formatting in Website Analytics and Website Reports so the UI and PDFs stay consistent.

6. Keep reports aligned with analytics
Because `WebsiteReportsTab` reuses the same website metrics patterns, I’ll update it too so it matches the analytics tab:
- numeric engaged sessions instead of engagement %
- formatted page names
- replace top referrers with pages/session mix
- clinic-timezone-aware day grouping where relevant

Technical notes
- No existing timezone field was found in the current schema, so this requires a migration.
- The current analytics tab groups hours using the viewer/browser timezone, which is why the hour chart is not clinic-specific today.
- I’ll centralize the page-name formatter and timezone bucketing logic so the analytics tab, overview hooks, and reports don’t drift apart.