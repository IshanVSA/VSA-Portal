

## GBP Posts Feature — Phased Implementation Plan

This is a very large feature spanning 7 new database tables, 4 edge functions, ~15 new components, and deep compliance logic. To keep each step testable and avoid overwhelming the build, the work is split into 4 phases.

---

### Phase 1: Database + Types + Tab Shell

**Database Migration** — Create all 7 tables with RLS policies:

| Table | Purpose |
|-------|---------|
| `geo_clusters` | Geographic cluster groupings |
| `clinic_gbp_config` | Per-clinic GBP configuration |
| `gbp_post_history` | Generated post records |
| `gbp_batches` | Monthly batch queue |
| `gbp_topic_library` | 12-month x 4-variant topic matrix |
| `gbp_compliance_scans` | Compliance audit trail |
| `gbp_recent_content` | Cross-reference content from blog/P2 |

All tables follow existing RLS pattern: Admins full access, Concierges view/insert/update for assigned clinics, Clients read-only for own clinics. Foreign keys reference `clinics(id)`. `updated_at` triggers applied.

**TypeScript types** — `src/lib/gbp/types.ts` with interfaces for all table rows, compliance scan shape, and generation request/response.

**Hook rotation constant** — `src/lib/gbp/hookRotation.ts` with the quarterly rotation map.

**SEO Department tab addition** — Add "GBP Posts" tab (MapPin icon) to `SeoDepartment.tsx` after Reports/before Uploads. Visible to all roles. Renders a new `GBPPosts` page component with 5 sub-tabs (Batch Queue, Generate Posts, Post History, Cluster Manager, Topic Library) — initially showing empty states.

**Files created/modified:**
- Migration SQL (1 migration, all 7 tables)
- `src/lib/gbp/types.ts`
- `src/lib/gbp/hookRotation.ts`
- `src/components/seo/gbp/GBPPostsTab.tsx` (main container with 5 sub-tabs)
- `src/pages/SeoDepartment.tsx` (add tab)

---

### Phase 2: Cluster Manager + Topic Library + Clinic Config

**Cluster Manager sub-tab** (`ClusterManager.tsx`):
- Table of clusters with expandable rows showing clinics, positions, landmarks
- Add/Edit cluster dialog with clinic search dropdown
- "Auto-Calculate Clusters" button (admin only) — client-side calculation based on geo radius rules from the PDF (5km BC TYPE 3, 7km other TYPE 3, 10km TYPE 1/2), transitive overlap grouping
- Clinic GBP Config section below — search a clinic, edit hospital type, jurisdiction, phone, neighbourhood, landmarks, top services, website URL, geo radius
- Bulk setup form for initial onboarding

**Topic Library sub-tab** (`TopicLibrary.tsx`):
- 12 collapsible month cards with seasonal theme + variant completion count
- Expanded card shows 4-variant table (Week 1-4 topics)
- Edit dialog per topic set
- "Seed Topic Library" button (admin only) — calls AI edge function to generate all 48 topic sets based on veterinary seasonal patterns
- Annual review banner if last updated 11+ months ago

**React Query hooks:**
- `useGeoClusters.ts`
- `useTopicLibrary.ts`

**Geo-cluster calculation logic:** `src/lib/gbp/clusterCalculation.ts`

**Supporting components:**
- `ClinicGBPConfigForm.tsx`
- `TopicSetEditor.tsx`

---

### Phase 3: Compliance Engine + Post Generation

**Compliance scan logic** — `src/lib/gbp/compliance.ts`:
- Tier 1 (VSA Core): flagged terms list (20+ terms), em dash check, US English spelling, specialist claims, hospital type language rules table, guaranteed outcomes, emoji limits
- Tier 2 (Google Ads Healthcare): drug brand names list (Rimadyl, Metacam, Apoquel, Cerenia, etc.), prescription terms, direct health targeting, outcome guarantees, sensitive terms, TYPE 3 emergency language check
- Tier 3 (Performance): geo-keyword in first 100 chars, service keyword, hook strength, word count 80-120, phone in 2+ posts, keyword diversity, CTA URL check, neighbourhood reference
- Returns structured `ComplianceScan` JSON

**Edge Function: `generate-gbp-posts`**:
- Receives clinic config + topics + recent content context
- Builds the full GBP v2.0 prompt with all variables injected
- Calls Lovable AI (gemini-3-flash-preview) to generate 4 posts
- Runs compliance scan on output
- Returns posts + scan results as structured JSON

**Generate Posts sub-tab** (`GeneratePosts.tsx`):
- Clinic selector (filtered to clinics with GBP config)
- Info card showing clinic config summary
- Recent Content Context panel (collapsible) showing last month's GBP, recent blogs, recent P2 pages
- Topic assignment cards (4 weeks) with admin override
- "Generate 4 Posts" button with skeleton loading
- Post cards in 2x2 grid: content, hook style pill, keyword tags, CTA, word count indicator, edit/regenerate/approve actions
- Compliance scan display below posts (3-tier expandable card with pass/fail icons)
- Bulk actions bar: Approve All, Save as Draft, Regenerate All

**Components:**
- `PostCard.tsx`
- `ComplianceScanDisplay.tsx`
- `RecentContentPanel.tsx`

**Hooks:**
- `useGBPPosts.ts`
- `useComplianceScan.ts`

---

### Phase 4: Batch Queue + Collision Check + Automation

**Edge Function: `generate-batch-queue`**:
- Fetches all active clinics with GBP config
- Groups by cluster, assigns variants based on position, assigns hook styles from quarterly rotation
- Auto-populates recent content context
- Creates batch records
- Callable via cron (1st of month) or manually

**Edge Function: `run-collision-check`**:
- Fetches all posts for clinics in a batch
- Runs 4-layer check: topic overlap, hook style match, shared keywords, landmark collision
- Stores results in batch's collision_check JSONB

**Edge Function: `archive-monthly-cycle`**:
- Archives all posts to history
- Stores compliance scans
- Updates batch statuses
- Cleans up old data per retention rules (12mo GBP, 3mo blogs, 1Q P2)

**Batch Queue sub-tab** (`BatchQueue.tsx`):
- Month/Year selector + "Generate Monthly Queue" button (admin only)
- Status pill (Not Started / In Progress / Complete)
- Collapsible batch cards grouped by batch number with cluster name, clinic count, status badge
- Expanded: clinic table with variant pill, hook style pill, status, generate button
- Solo clusters section
- "Run Collision Check" button per batch after generation
- Collision check results inline (pass/fail checklist)
- Monthly progress bar at bottom

**Post History sub-tab** (`PostHistory.tsx`):
- Filters: clinic multi-select, month/year range, status, variant, hook style, cluster
- Table view (default) + Card view toggle
- Post detail modal with full content, compliance scan, audit trail, related posts
- CSV export

**Components:**
- `BatchCard.tsx`
- `CollisionCheckResults.tsx`

**Hooks:**
- `useGBPBatches.ts`

**Automation:**
- Cron job for monthly queue generation (1st of month)
- Post-approval auto-archive logic
- Notification integration for GBP events

---

### Role-Based Access Summary

| Feature | Admin | Concierge | Client |
|---------|-------|-----------|--------|
| View GBP tab | Yes | Yes (assigned) | Yes (own, read-only) |
| Generate queue | Yes | No | No |
| Generate posts | Yes | Yes (assigned) | No |
| Approve posts | Yes | No | No |
| Manage clusters | Yes | No | No |
| Edit topic library | Yes | No | No |
| View history | Yes | Yes (assigned) | Yes (own) |
| Run collision check | Yes | No | No |

---

### Technical Notes

- AI generation uses Lovable AI gateway (`gemini-3-flash-preview`) via edge function — not direct client calls
- All edge functions use `LOVABLE_API_KEY` (already provisioned) for AI calls
- Compliance scan runs both client-side (instant preview) and server-side (official record)
- All new components use shadcn/ui, Tailwind, Framer Motion, skeleton states, dark mode CSS variables
- Toast notifications via Sonner for all actions
- Confirmation dialogs for destructive operations (regenerate, delete, recalculate clusters)

This plan will be implemented phase by phase. Shall I start with Phase 1?

