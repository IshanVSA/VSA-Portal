## Goal

Make the client dashboard useful even when Social Media is locked, by turning it into a cross-department at-a-glance view of everything the client cares about — pulling in whichever departments (Website, SEO, Google Ads, AI SEO, Social) are enabled for the selected clinic, plus general clinic info.

## New layout (top to bottom)

1. **Header** (unchanged)
   - `Dr.'s Portal`, clinic name, date, clinic switcher pills.

2. **Cross-department status strip** (replaces the current social-only 4-card strip)
   Adaptive tiles — only rendered for enabled departments:
   - **Open tickets** (all depts, all-time open + in_progress) → clicking scrolls to Recent updates.
   - **In review** (content awaiting your approval; only if Social enabled).
   - **Website health** (latest mobile PageSpeed score; only if Website enabled).
   - **SEO traffic** (last 30d organic sessions delta; only if SEO enabled).
   - **Ad spend / clicks** (last 30d; only if Google Ads enabled).
   - **AI SEO score** (only if AI SEO enabled).
   - **Unread VSA messages** across all department chats (not just social).
   Tiles collapse gracefully — a clinic with only Website + Ads shows 3–4 tiles instead of a huge empty strip.

3. **Two-column body**
   - **Left (3/5): Department snapshots**
     A vertical stack of small cards, one per enabled department, each with 2–3 KPIs + a `Open →` link. Examples:
     - Website: visitors (30d), avg engagement, PageSpeed score.
     - SEO: keywords ranking top-10, latest blog post title, monthly report link.
     - Google Ads: spend, clicks, CTR.
     - AI SEO: overall score, backlinks delta.
     - Social: upcoming post count, in-review count, published this month.
     Only enabled departments render; each card uses that department's semantic color.
   - **Right (2/5):**
     - **Content calendar mini** — shows only when Social enabled (existing calendar reused).
     - **Upcoming posts** — only when Social enabled.
     - **VSA team** latest message — sourced from whichever department chat has the newest message the client can see (Website chat when only Website is on, etc.), not hard-coded to `social_media`.
     - **Book a meeting** shortcut card — always visible (general link everyone should see).

4. **Recent updates** (kept, moved up when Social is off)
   Existing cross-department ticket activity list. This is already dept-agnostic and is the main content when only non-social depts are enabled.

5. **Quick actions row** (adaptive)
   - `New Ticket` (always, opens NewTicketDialog with dept auto-picked from first enabled dept).
   - `Request content` (only Social enabled).
   - `Book a meeting` (always).
   - `Analytics` deep-link per enabled department.

## Behavioral rules

- All sections read `selectedClinic` service flags (`website_enabled`, `seo_enabled`, `google_ads_enabled`, `ai_seo_enabled`, `social_media_enabled`) and render conditionally — never show a locked-dept KPI to the client.
- If a KPI query fails or returns no data, the tile shows an em-dash, not an error.
- Empty state fallback: if a clinic somehow has zero enabled departments, show a single card with "Contact your account manager" (matches existing pattern).

## Technical notes

- File: `src/components/dashboard/ClientDashboard.tsx`.
- Extend the `Clinic` interface + select to include `website_enabled, seo_enabled, google_ads_enabled, ai_seo_enabled, social_media_enabled` (matches `AdminDashboard` pattern).
- Reuse existing hooks/utilities where possible:
  - `useWebsiteKPIs`, `useSeoAnalytics`, `useGoogleAdsKPIs`, `useSearchAtlas` for per-department KPIs.
  - `department_client_chats` query generalized to `.in("department", enabledDepts)` for latest-message + unread counts.
  - `department_tickets` for open-ticket count (already fetched — extend to a count).
- Extract department snapshot cards into small sub-components inside the same file (or a new `src/components/dashboard/client/` folder) to keep the main file readable.
- Preserve existing motion patterns (`container` / `item` variants, `framer-motion`).
- No schema changes, no new migrations, no new tables.

## Out of scope

- No redesign of the sidebar (locked chips already work).
- No changes to individual department pages.
- No new backend endpoints.
