

# Social Media Department Dashboard Redesign

Replace the single `SocialOverview` with three purpose-built dashboards — one per role — that surface the data each user actually needs based on the SM2 v2.1 engine, Brand DNA system, Hard Gates, Promotions, GBP Posts, and content workflow.

## Architecture

```text
SocialOverview.tsx (router shell)
 ├─ if role === "admin"     → AdminSocialOverview
 ├─ if role === "concierge" → ConciergeSocialOverview
 └─ if role === "client"    → ClientSocialOverview
```

Shared building blocks stay reusable: `StatsCard`, `BulkUploadsDialog`, `NewTicketDialog`, `Card` family, `recharts`. Quick Actions row stays available for client + concierge (admin gets a different command bar).

---

## 1. Admin Dashboard — "Network Command Center"

For oversight across the clinic + cluster.

**Row 1 — Network KPIs (5 cards)**
- DNA Profile Score (with `<50 = blocked` warning chip)
- Posts Generated (this month) / 12 stock cap progress bar
- Pipeline Health (Generated → Final Approved funnel mini-stat)
- Active Promotions (live count, jurisdiction badge if CVBC)
- Open Tickets + Emergency badge

**Row 2 — Content Pipeline Funnel** (full-width)
Horizontal funnel: Generated → Under Review → Approved → Client Selected → Final Approved with counts + drop-off %. Click stage → routes to Generation/Review tab.

**Row 3 — Two columns**
- **SM2 Engine Health**: Last generation timestamp, last `failure_reason` (from error reporting layer), Hard Gates pass-rate (5 gates as colored pills), 8-agent pipeline status if a job is running.
- **Multi-Location Cluster** (existing): each clinic's DNA score, last-generated date, collision-prevention status.

**Row 4 — Two columns**
- **Weekly Content Trend** (existing bar chart, kept)
- **GBP Posts Snapshot**: scheduled / published / failed last 7 days + collision risk indicator

**Row 5 — Team & Recent Activity**
- Team members (existing)
- Recent activity feed: last 5 events (post generated, DNA updated, ticket opened, promotion created)

---

## 2. Concierge Dashboard — "Operator Workspace"

Focused on day-to-day execution.

**Row 1 — Action KPIs (4 cards)**
- Pending Review (posts needing concierge action — clickable → Generation tab)
- Awaiting Client Approval (with auto-approval countdown badge)
- Open Tickets assigned to me
- Posts Scheduled This Week

**Row 2 — Quick Actions** (existing 5-tile grid, kept)

**Row 3 — Two columns**
- **My Review Queue**: top 5 content requests in `generated` / `concierge_preferred` with DNA score, platform mix, "Review" CTA → ContentGenerationTab
- **Hard Gates Alerts**: any posts flagged by the 5 gates (Promotion / Pricing / Patient Consent / Team Spotlight / Compliance) requiring manual override

**Row 4 — Two columns**
- **Weekly Content Trend** (kept)
- **Ticket Summary** (kept, existing 4-status block) + "New Ticket" CTA

**Row 5 — Brand DNA Snapshot**
DNA completeness ring + Vedant Checklist progress + "Activate Profile" CTA if score ≥50 but not activated. Compact card.

---

## 3. Client Dashboard — "My Social Media"

Friendly, outcomes-focused, no internal jargon.

**Row 1 — Welcome KPIs (3 cards)**
- DNA Profile Score (animated ring; if `<50` → big "Complete your Brand DNA" CTA card replaces the row)
- Posts Awaiting My Review (count + "Review now" button → My Content tab)
- Posts Live This Month

**Row 2 — Two columns**
- **This Month at a Glance**: monthly signal theme distribution (mini horizontal bars from `MonthlySignalsForm` data), holiday highlights, active promotion card if any
- **My Content Status**: simple progress bar — "X of 12 posts ready", review countdown if auto-approval is pending

**Row 3 — Quick Actions** (existing 5-tile grid: Bulk Uploads, Content Request, etc., kept)

**Row 4 — Two columns**
- **Recent Posts Preview**: 4 most recent `final_approved` post thumbnails (from versioned HTML deliverables) — click → opens in `FilePreviewDialog`
- **Need Help?**: concierge contact card (avatar + name + "Open Ticket" button) using `useDepartmentTeam`

Hide from client: Hard Gates, SM2 engine health, cluster, ticket summary breakdown, generation pipeline internals, failure reasons.

---

## Data Sources (already available, no schema changes)

- `content_posts`, `content_requests` — pipeline + counts
- `clinic_brand_dna` — score + activation status
- `clinic_promotions` — active promos
- `sm2_generations` + `failure_reason` — engine health
- `sm2_post_performance` — engagement (admin)
- `gbp_posts` — GBP snapshot
- `monthly_signals` — theme distribution
- `department_tickets` — tickets, realtime
- `geo_clusters` + `clinics` — multi-location
- `department_team` (via hook) — team

No migrations required.

---

## Files

**Created**
- `src/components/social/overview/AdminSocialOverview.tsx`
- `src/components/social/overview/ConciergeSocialOverview.tsx`
- `src/components/social/overview/ClientSocialOverview.tsx`
- `src/components/social/overview/shared/PipelineFunnel.tsx`
- `src/components/social/overview/shared/HardGatesStatus.tsx`
- `src/components/social/overview/shared/DNAScoreRing.tsx`
- `src/components/social/overview/shared/RecentPostsPreview.tsx` (client)

**Edited**
- `src/components/social/SocialOverview.tsx` — becomes a thin router that picks the right role component (keeps existing `clinicId` prop API so `SocialMedia.tsx` doesn't change)

**Unchanged**
- `src/pages/SocialMedia.tsx` (consumer API stays the same)
- Existing dialogs (`NewTicketDialog`, `BulkUploadsDialog`)
- Quick actions registry in `@/lib/quick-actions`

## Visual language

Follows existing standards: glass cards, `dept-tint-social` background, `hsl(var(--dept-social))` accent, 2px glow on KPI hover, fade-in stagger (`animationDelay` 0/160/200/300/400ms), tabular-nums for counts, no emojis, Inter font. Loading state uses skeleton blocks identical to current implementation.

