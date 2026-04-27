# VSA DASHBOARD PRODUCTION READINESS REPORT
**Date:** 2026-04-27
**Auditor:** Lovable (read-only audit)
**Scope:** Code-level review only. No live OAuth flows, real email sends, or external service setup were exercised. Smoke tests skipped per your direction. **No code was changed in this pass** — every item below is a recommendation awaiting your approval.

---

## SUMMARY

- **Total issues found:** 47
- **Blockers (must fix or accept risk before launch):** 6
- **High (fix this week):** 14
- **Medium (fix within month-1):** 17
- **Low / nice-to-have:** 10
- **Verdict:** **NOT READY** without addressing the 6 blockers. **READY WITH CAVEATS** if blockers 1, 2, 3 are addressed and 4, 5, 6 are explicitly accepted.

---

## BLOCKERS (6)

### B1 — OAuth refresh tokens stored in plaintext
**Where:** `clinic_api_credentials` columns `meta_page_access_token`, `google_ads_refresh_token`, `gbp_refresh_token`.
**Risk:** Database leak = full takeover of every clinic's Meta/Google Ads/GBP accounts.
**Recommended fix:** Per your direction, leaving as-is in this pass. Schedule a dedicated, reversible migration session: enable `pgsodium` or Supabase Vault, dual-write tokens for one release, backfill encrypted column, swap reads, drop plaintext column. Do a single-clinic dry run first.
**Owner / ETA:** _to assign_

### B2 — 48 SECURITY DEFINER functions callable by `anon` / `authenticated`
**Where:** All 25 of your custom functions (e.g. `delete_clinic_by_id`, `regenerate_gbp_batches`, `pick_assignee_for_dept`, `get_concierge_clinic_ids`, `populate_monthly_holidays`, `claim_ticket_on_in_progress`, etc.) — surfaced as 48 linter warnings (codes 0028 + 0029).
**Risk:** A signed-in client could call `delete_clinic_by_id(<any-clinic-uuid>)` over PostgREST/RPC. Internal admin checks inside each function are the only thing stopping abuse — and trigger-only functions (e.g. `auto_assign_ticket`, `regenerate_gbp_batches`) have **no caller checks** because they were designed to run as triggers. If exposed via RPC they'll mutate data.
**Recommended fix:** `REVOKE EXECUTE ON FUNCTION public.<name>(...) FROM anon, authenticated;` for every trigger-only function (≈18 of 25). For the few that *are* meant to be called from the client (`delete_clinic_by_id`, `has_role`, `get_user_role`, `compute_ticket_rollup_status`, `get_ticket_user_directory`, `populate_monthly_holidays`), keep EXECUTE but verify each one has an explicit `auth.uid()` + role check at the top. **This is a 1-migration fix with low regression risk** but I want your sign-off because revoking the wrong one would break a workflow.
**Owner / ETA:** _ready to execute on approval_

### B3 — `oauth_temp_tokens` has RLS enabled but ZERO policies
**Where:** Table `public.oauth_temp_tokens`.
**Risk:** With RLS on and no policies, the table is invisible to all roles except `service_role`. If any frontend code or non-service edge function tries to read/write it, the OAuth flow silently fails. If your OAuth callbacks already work, this is functionally fine — but the data model is a foot-gun.
**Recommended fix:** Confirm only edge functions using `SUPABASE_SERVICE_ROLE_KEY` touch this table (audit confirms `gbp-oauth`, `google-oauth`, `meta-oauth`, `save-google-account`, `save-meta-page` are the touch points). If yes: add a comment documenting "service-role only by design" and leave policy-less. If no: add a narrow policy.

### B4 — All 41 edge functions have `verify_jwt = false`
**Where:** `supabase/config.toml`.
**Risk:** Every function is publicly callable. Many enforce JWT manually (`supabase.auth.getUser()`), but I have not audited each. Functions that legitimately must be public (cron callbacks signed with `CRON_SECRET`, OAuth callbacks, `track-pageview`, `verify-popup-offer`, `request-password-reset`, `verify-reset-link`) are correct. The other ~30 should set `verify_jwt = true`.
**Recommended fix:** Per-function audit. I can produce a categorized list (public / cron-secret / user-jwt) and a config.toml diff. Won't apply without your review because mis-flagging breaks the function.

### B5 — No automated backups / PITR confirmation
**Where:** Supabase project settings (cannot inspect from this tool).
**Risk:** Going live without PITR = unrecoverable data loss on a bad migration.
**Recommended fix:** You verify in Supabase dashboard → Database → Backups that PITR is enabled (requires Pro plan or higher). If not, upgrade before launch.

### B6 — No production error tracking
**Where:** Frontend and edge functions log to `console` / Supabase logs only.
**Risk:** Silent failures in production go unnoticed. Hard to triage when a client reports "something broke".
**Recommended fix:** Add Sentry (or equivalent). Asking per your direction — see "Awaiting decision" below.

---

## HIGH (14)

### H1 — `dangerouslySetInnerHTML` on AI-generated blog HTML without sanitization
`src/components/seo/blog/BlogTab.tsx:234` renders model output directly. Anthropic/OpenAI output is not "user content" but a malicious clinic-input prompt or future input source could inject `<script>`. **Fix:** wrap with DOMPurify before render. New dependency.

### H2 — 11 foreign keys missing explicit `ON DELETE` rule
Defaults to `NO ACTION`. Affected: `blog_posts.prompt_version_id`, `calendar_submissions.submitted_by`, `clinic_gbp_config.cluster_id`, `clinics.assigned_concierge_id`, `gbp_batches.cluster_id`, `gbp_compliance_scans.batch_id`, `gbp_post_history.batch_id`, `profiles.user_id`, `seo_analytics.updated_by`, `terms_acceptance_log.terms_version`, `terms_decline_log.terms_version`. **Fix:** add `SET NULL` for soft links (concierge, cluster, updated_by), `CASCADE` for tightly-owned rows. One migration.

### H3 — No `audit_log` table
Section 11 requires before/after change tracking on `clinics`, `user_roles`, `clinic_team_members`, `clinic_api_credentials`, `tickets` (status), `content_posts` (approve/publish). You have `ticket_audit_log` only. **Fix:** add generic `audit_log` table + AFTER UPDATE triggers on the 5 tables.

### H4 — No Content-Security-Policy / security headers
`vercel.json` has only rewrites. Missing HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, CSP. **Fix:** add `headers` block. CSP is the only risky one (can break Meta/Google/Anthropic embeds) — start with `Content-Security-Policy-Report-Only` for one week.

### H5 — No CORS allowlist on edge functions
Most functions appear to use wildcard CORS. **Fix:** restrict `Access-Control-Allow-Origin` to `https://vet-dash-suite.lovable.app` + production custom domain + lovable preview domain. Per-function diff required.

### H6 — Missing indexes on hot foreign keys
Postgres does not auto-index FKs. Hot paths affected: `content_posts.clinic_id`, `content_requests.clinic_id`, `department_tickets(clinic_id, status, created_at)`, `notifications(user_id, created_at)`, `sm2_posts(generation_id)`, `gbp_post_history(clinic_id, year, month)`. **Fix:** one migration adding ~15 indexes. Negligible regression risk.

### H7 — No pagination on long lists
`PostHistory`, `TicketTableView`, `ListView` (calendar), `MyTickets`, `RecentActivity` fetch unbounded. Will hit Supabase's 1000-row default. **Fix:** add `range()` + cursor or page UI.

### H8 — Real-time subscriptions not consistently filtered by clinic_id
Quick scan shows several `supabase.channel(...).on('postgres_changes', ...)` without `filter: 'clinic_id=eq.<id>'`. Means User A's tab will receive Clinic B's events (filtered client-side). **Fix:** add server-side filters. Requires reviewing every channel subscription (~12 spots).

### H9 — No idempotency on publish/email mutations
`auto-approve-posts`, `gbp-publish-cron`, `notify-terms-decline` will double-publish / double-send if cron retries. **Fix:** add `idempotency_key` column + UNIQUE constraint per affected table.

### H10 — No `welcome_email` on Client creation
`create-team-member` creates the user but the Section 13.3 welcome email is not wired. **Fix:** add Zoho-based welcome template via existing `_shared/zoho-mail.ts`.

### H11 — No /403 or offline UI
`<NotFound>` route exists but no 403 page, no `navigator.onLine` banner. **Fix:** add components.

### H12 — Session cache not cleared on logout
`useAuth.signOut` clears the Supabase session but does not call `queryClient.clear()`. Next login briefly shows previous user's cached data. **Fix:** one-line addition.

### H13 — `handle_new_user` trigger auto-grants `client` role to every new auth user
Per memory `auth/user-access`, public sign-up is "disabled" — but this trigger means anyone Supabase Auth creates (e.g. via direct API) gets a `client` role automatically. **Fix:** verify Supabase Auth → Settings → "Allow new users to sign up" is OFF. If yes, this trigger is fine. If no, blocker.

### H14 — Connection pooling URL not verified
Frontend uses publishable key against the REST API (pooled by default), so this is moot for the SPA. Edge functions use the Supabase JS client (also pooled). **Fix:** confirm any direct `pg` connection (none found) uses port 6543. Likely already compliant.

---

## MEDIUM (17)

### M1 — `delete_clinic_by_id` deletes 30+ child tables manually instead of relying on `ON DELETE CASCADE`
Brittle; new tables forgotten = orphans. Consolidate by adding CASCADE to FKs.
### M2 — No `sync_logs` table for daily Google Ads / Meta cron success/failure tracking
Add `cron_run_log` (function, started_at, finished_at, status, clinic_id, error).
### M3 — No rate limiting on AI generation per clinic
A bug in retry logic could bankrupt your Anthropic budget. Add per-clinic monthly token cap.
### M4 — No CHECK constraints on enum-like text columns
`status`, `priority`, `department`, `role` columns rely on app-level validation only.
### M5 — `notifications` table has no retention policy
Will grow unbounded. Add cron to hard-delete > 30 days old.
### M6 — Bundle size not measured
Likely > 1 MB initial. Recommend `React.lazy` per route — flagged risky because Suspense fallbacks need testing per route.
### M7 — `<img>` tags missing explicit width/height
Causes CLS. Audit clinic logo + chart components.
### M8 — Charts (Recharts) not lazy-loaded
Loaded on every dashboard.
### M9 — Form validation inconsistency
Some forms use react-hook-form + zod, others raw `useState`. Mixed double-submit prevention.
### M10 — `prose` CSS not dark-mode mapped in some components
Spot-checked: `BlogTab` uses `dark:prose-invert`, but content-request and ticket descriptions don't.
### M11 — No staging Supabase project
You currently push directly to production. High blast radius for a bad migration.
### M12 — No optimistic locking / version columns
Two concierges editing the same ticket / post will silently overwrite. Add `version int` + WHERE version=$ check.
### M13 — `track-pageview` accepts unsigned input
Anyone can spam it; no IP rate limit. Cap rows per IP per minute.
### M14 — `extract-clinic-website` / `extract-brand-dna` / `extract-seo-report` accept arbitrary URLs without SSRF guard
Could be tricked into hitting internal AWS metadata endpoints. Add domain allowlist or block private IP ranges.
### M15 — Logs may include PII
Edge functions `console.log(req)` patterns observed in some. Audit for accidental email/token logging.
### M16 — No `clinic_features` table for feature flags
Section 16.2 requirement. Currently uses `clinic_service_access` columns — works but inflexible.
### M17 — No status page / `/status` route
Section 16.5. Recommend simple `/status` rendering cron-run-log + edge function p95.

---

## LOW (10)

L1. No MFA for admin accounts (Section 4.4).
L2. Help icon / "Report a bug" button missing from top nav (Section 12.4).
L3. Welcome onboarding overlay missing for first-time client login (Section 13.1).
L4. No documented data-export / data-deletion request flow per PIPEDA (Section 14.2).
L5. Outbound emails missing unsubscribe link / sender identification (CASL — Section 14.3).
L6. `npm audit` not run in this session.
L7. Search inputs not debounced in `ClinicSelector`, `ClientsPage`.
L8. Auto-save not present on long-form ticket descriptions.
L9. No types-to-confirm modal on "delete clinic" (only standard confirm dialog).
L10. No "Last synced X ago" badge on integration cards.

---

## AWAITING YOUR DECISION (before any code change)

Per your scope: I won't touch anything until you choose. For each of these, please reply with which to do:

1. **B2 (revoke EXECUTE on trigger-only SECURITY DEFINER fns)** — proceed? Lowest-risk security win in the report.
2. **H2 (add ON DELETE rules to 11 FKs)** — proceed?
3. **H6 (add ~15 missing indexes)** — proceed?
4. **H4 (security headers in vercel.json, CSP in report-only mode)** — proceed?
5. **H1 (DOMPurify on blog HTML render)** — adds 1 dependency. Proceed?
6. **H12 (clear React Query cache on logout)** — one-line fix. Proceed?
7. **B6 / Sentry** — add the SDK behind `VITE_SENTRY_DSN` env var (no-op when unset)?
8. **H3 (audit_log table + triggers)** — proceed, or skip?
9. **H5 (CORS allowlist per edge function)** — I'll produce per-function diff for review first.
10. **B4 (verify_jwt config sweep)** — I'll produce a categorized list for review first.

Items I will **not** touch without an explicit "yes, accept regression risk":
- B1 OAuth token encryption (separate dedicated session)
- M1 cascade-based delete refactor
- M6 React.lazy route splitting
- Soft-delete refactor (Section 11.2)

---

## DEPLOYMENT CHECKLIST

- [ ] PITR confirmed enabled (B5) — owner: you
- [ ] OAuth token encryption plan scheduled (B1) — owner: you
- [ ] SECURITY DEFINER EXECUTE revoked (B2) — owner: me on approval
- [ ] verify_jwt audited per function (B4) — owner: me on approval
- [ ] Security headers + CSP-RO live (H4) — owner: me on approval
- [ ] Missing FK indexes added (H6) — owner: me on approval
- [ ] FK ON DELETE rules added (H2) — owner: me on approval
- [ ] DOMPurify on blog render (H1) — owner: me on approval
- [ ] Cache cleared on logout (H12) — owner: me on approval
- [ ] Sentry decision made (B6) — owner: you
- [ ] Welcome email wired (H10) — owner: me on approval
- [ ] Pagination on long lists (H7) — owner: me on approval
- [ ] Realtime channels filtered by clinic (H8) — owner: me on approval
- [ ] First 3 friendly clinics onboarded — owner: you

**On your "approve N, N, N" reply I will switch to default mode and execute, in priority order, only the items you green-light.**
