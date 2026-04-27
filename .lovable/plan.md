# Pre-Launch QA + High-Traffic Hardening Plan

Goal: Before opening client access, exercise every major flow end-to-end, fix anything broken, and harden the parts that fall over under concurrent load. No new features — only testing, fixes, and resilience.

## Phase 1 — Automated/static sweep (read-only, no risk)

1. **TypeScript build check** — `tsc --noEmit` across the project; fail the launch on any error.
2. **Frontend test run** — execute existing Vitest suite (`src/test/example.test.ts` + any others) and report results.
3. **Edge function deno check** — type-check all 41 functions in `supabase/functions/*` (no deploy changes).
4. **Supabase linter** — run `supabase--linter`, list every error/warn with severity.
5. **Security scan** — run `security--run_security_scan`, capture all findings.
6. **Console + network snapshot** — pull current preview console errors and failed network requests, triage each.

Deliverable: a single "launch blockers" list categorized as Blocker / High / Medium.

## Phase 2 — Manual E2E flow tests in preview (browser tools)

Tested on the live preview as **admin**, **concierge**, and **client** roles. Each flow must complete without console errors or 4xx/5xx (excluding expected 401s on logout).

1. **Auth**: login, refresh-on-401, password reset email → reset → login, logout (verify React Query cache cleared, no stale data leaks across users).
2. **Client dashboard**: load with 0 clinics, 1 clinic, multiple clinics; verify KPI counts match DB.
3. **Clinic detail**: open every tab — Overview, Client Journey (the recently-fixed loading bug), Team, Integrations (Meta / Google Ads / GBP / Tracking), Brand DNA.
4. **Social Media dept**: Brand DNA form, monthly signals, SM2 generation trigger, client review tab, calendar, promotions, post limit tracker.
5. **SEO dept**: Blog tab, GBP posts (generate, batch queue, scheduled, history), topic library, clusters.
6. **Google Ads dept**: OAuth connect (skip if blocker), analytics tab, reports tab.
7. **Website dept**: Health tab (admin/concierge), analytics, reports, uploads, tickets.
8. **AI SEO dept**: access gate behavior for non-entitled clinics.
9. **Tickets**: create one of every intake form type; verify fan-out to correct departments, auto-assignment, audit log entries, status rollup.
10. **Department chat**: send message, mention, reaction, unread badge across two browser sessions.
11. **Notifications**: bell counts update in real time.
12. **Terms acceptance gate**: fresh user is blocked until accepted; staff acknowledgment modal appears for staff.
13. **File uploads**: department-files bucket — upload, preview, delete; verify access control.
14. **PDF reports**: generate Website / SEO / Social / Google Ads / Unified PDFs, open each, confirm no clipped content.

Each failure → logged with repro steps, fixed, re-tested.

## Phase 3 — High-traffic / concurrency resilience

These are the realistic failure modes when many clients hit the app simultaneously. Fixes are minimal-risk:

1. **Unbounded list fetches** — audit all `.from(...).select(...)` calls without `.limit()` or pagination on tables that grow per-clinic (content_posts, analytics, website_pageviews, sm2_posts, blog_posts, department_tickets, ticket_audit_log, gbp_post_history). Add explicit `.limit()` + `.order()` and pagination where the UI shows lists. Hard cap at 1000 (Supabase default) is a silent data-loss risk.
2. **React Query cache hygiene** — add `queryClient.clear()` on logout so the next user on the same browser doesn't see cached data; add `staleTime` to hot queries to reduce refetch storms.
3. **Realtime subscription leaks** — verify every `supabase.channel(...)` has a matching `removeChannel` in cleanup. Leaks compound under traffic.
4. **Edge function concurrency** — for cron-fanout functions (`meta-analytics-cron`, `google-ads-cron`, `pagespeed-cron`, `gbp-publish-cron`, `sm2-worker`, `blog-worker`): confirm they iterate sequentially or with a bounded concurrency, not unbounded `Promise.all`, to avoid hitting Meta/Google API rate limits and timing out the function.
5. **Missing FK indexes on hot paths** — add indexes on `clinic_id` for the high-read tables listed above (negligible risk; speeds up every dashboard query).
6. **Auth refresh storm protection** — current `customFetch` in `client.ts` already has `isRefreshing` guard and 3-failure threshold; verify it works under simultaneous tab usage.
7. **Error boundary coverage** — confirm `ErrorBoundary` wraps every top-level route so one component crash doesn't white-screen the whole app for a user.
8. **Service worker (`public/sw.js`)** — verify it's not caching authenticated API responses (would leak data across users).
9. **Rate limiting**: per project policy, NOT adding backend rate limiting. Only client-side debounce on expensive triggers (Generate SM2, Generate GBP batch, Sync analytics) to prevent accidental double-clicks creating duplicate jobs.
10. **Idempotency** — verify "Generate" buttons disable while a job is in flight, and that re-clicking doesn't enqueue duplicate batches (`generate-batch-queue`, `generate-blog-batch`).

## Phase 4 — Production sanity checks

1. **Vercel SPA routing** — confirm deep links work after publish (already configured in `vercel.json`).
2. **Env vars** — confirm `.env` has `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` populated.
3. **OAuth redirect URIs** — verify Google/Meta/GBP redirect URIs in their consoles match the published domain (flag-only; user action needed).
4. **Cron schedules alive** — query `cron.job` to confirm `google-ads-daily-sync`, `pagespeed`, `meta-analytics`, `gbp-publish`, `auto-approve-posts`, `sm2-worker`, `blog-worker` are scheduled and last run was successful.
5. **Storage bucket policy** — confirm `department-files` (public) is intentional and no sensitive PII is uploaded there.

## Out of scope (per prior decisions)

- Backend rate limiting (project policy)
- OAuth token encryption (B1) — flagged as blocker, untouched without explicit approval
- `verify_jwt` flip on edge functions (B4) — high regression risk, untouched
- `SECURITY DEFINER` EXECUTE revokes (B2) — touched only after categorization

## Technical execution order

1. Run Phase 1 sweep → produce blocker list.
2. Fix any TS / test / lint blockers (Phase 1 always-safe fixes).
3. Walk Phase 2 flows in the browser tool, fix bugs as found.
4. Apply Phase 3 hardening (indexes, `.limit()`, cache.clear on logout, realtime cleanup, debounce on heavy triggers).
5. Run Phase 4 sanity checks, hand back a go/no-go report with everything tested and every fix applied.

## What you'll get back

A single launch report listing: tests run, results, bugs found, fixes applied (with file paths), remaining flagged items requiring your decision (OAuth encryption, OAuth console redirect URIs, etc.), and a green/yellow/red go-live recommendation.
