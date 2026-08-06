# Performance Pass — 5 Bottlenecks

A scan of the app against the five items in the screenshot. Two are already handled well; three need real work.

## 1. Fetching data one row at a time (N+1)

Confirmed cases:
- `NotificationBell.tsx` — `getClinicName()` runs one `clinics` query per notification (memo-cached, but cold loads still fire N sequential requests). Fix: collect all clinic IDs from the fetched notifications and resolve them in a single `.in("id", ids)` call.
- `Employees.tsx` — team assignment save loops `toRemove` / `toAdd` with one insert/delete per clinic. Fix: one bulk `insert` and one `delete ... .in("clinic_id", toRemove)`.
- `AdminReview.tsx` — post materialization inserts posts one at a time inside a `for` loop. Fix: build the array and do a single bulk insert.

Other `.in()`-based fetches (Clinics, ClinicDetail, SubAccounts) are already batched and stay as-is.

## 2. Missing database indexes

Hot tables were checked. `clinic_gsc_daily` (977k rows), `website_pageviews` (305k), `clinic_ga4_traffic_daily`, `sm2_posts`, `content_posts`, `department_tickets` all already have the clinic+date composite indexes the app filters on. Gaps found:

- `ticket_audit_log` — no index on `ticket_id` / `actor_id`, both used by the timeline and audit queries.
- `department_ticket_assignments` — queried by `assigned_to` and `(ticket_id, department)`; verify and add what's missing.
- `analytics` — only `clinic_id`; add `(clinic_id, created_at DESC)` if the app filters by date.

Each candidate gets `EXPLAIN (ANALYZE, BUFFERS)` before and after so we only add indexes that actually change the plan.

## 3. Loading every row at once

`website_pageviews` already goes through the paginated `fetchAllPageviews` helper. Remaining unbounded reads to cap:

- `Clinics.tsx` — `select("*")` on the full clinics table; narrow to the columns the list renders.
- `ticket_audit_log` / notification feeds — add explicit `.limit()` where a feed is rendered without one.
- Audit the 31 `select("*")` call sites and replace with explicit column lists on the large tables.

No user-visible pagination UI is added; this is about not over-fetching.

## 4. Large uncompressed images

`src/assets` ships `vedant-photo.png` (90KB), `avi-photo.jpeg` (73KB), `vsa-logo.jpg` (24KB), `user-placeholder.png` (18KB). Add `vite-imagetools` and import WebP variants of the photos, keeping the originals as fallback. Also add `loading="lazy"` + explicit `width`/`height` to the `<img>` tags that don't have them (8 of 28 currently do).

## 5. Whole app loads as one bundle

Routes are already code-split with `React.lazy` in `App.tsx`. The remaining weight is in large always-imported components:

- `BrandDNATab` (1621 lines), `PostDayDialog` (1106), `DepartmentChat` (1016), `NotificationBell` (1002), `ContentGenerationTab` (981), `unified-report-html` + `html2pdf.js`.
- Lazy-load the heaviest dialogs/tabs behind `React.lazy` + `Suspense`, and dynamic-`import()` `html2pdf.js` only when the report button is clicked.
- Add `rollup-plugin-visualizer` output once to confirm the initial chunk lands under ~200KB gzipped.

## Technical notes

- Index changes go through a Supabase migration (plain `CREATE INDEX`, not `CONCURRENTLY`).
- No behavior or UI changes — same data, same screens, fewer/faster requests.
- Verification: typecheck, a build to compare chunk sizes, and `EXPLAIN` output for each new index.

## Out of scope

- No schema/RLS changes beyond indexes.
- No redesign of any screen.
