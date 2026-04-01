

## Client Journey / Lifecycle Tracker

### Overview
Build a new "Client Journey" section accessible from the Clinic Detail page that tracks the full onboarding and ongoing lifecycle of each clinic across 8 phases and 31 steps, matching the VSA workflow document exactly. Each step is assigned to specific department(s), and team members from those departments can mark steps as complete.

### Workflow Phases & Steps (from document)

```text
Phase 01: Client Onboarding (3 steps)
  01. Discovery call                    → All Depts
  02. Client negotiations               → All Depts
  03. Brand assessment form             → All Depts

Phase 02: Website Build (5 steps)
  04. Designing                         → Design
  05. Development                       → Design
  06. Review                            → Design
  07. Finalizing                        → Design
  08. Content - website & services      → Design, SEO

Phase 03: SEO Foundation (3 steps)
  09. On-page SEO                       → SEO
  10. Meta titles                       → SEO
  11. Privacy policy setup              → SEO, Design

Phase 04: Technical Integration (3 steps)
  12. GBP linking                       → SEO
  13. Google Tag Manager                → SEO, Design
  14. Google Analytics                  → SEO

Phase 05: Social Media Setup (5 steps)
  15. Meta access - Facebook page       → Social
  16. Instagram login                   → Social
  17. Meta account setup                → Social
  18. Meta Pixel code generation        → Social
  19. Location targeting                → Social, Ads

Phase 06: Ads Setup (1 step)
  20. Ads group setup                   → Ads

Phase 07: Brand & Content Launch (5 steps)
  21. Brand evaluation                  → Design, Social
  22. Color scheme                      → Design
  23. Content generation                → Social
  24. Graphics                          → Design
  25. Posting & scheduling              → Social

--- monthly recurring line ---

Phase 08: Monthly Ongoing (6 steps)
  26. Google Ads campaign mgmt          → Ads
  27. Compliance work                   → All Depts
  28. Monthly SEO posting               → SEO
  29. GBP posting                       → SEO
  30. GBP optimization                  → SEO
  31. Backlinking                       → SEO
```

### Database Changes

**New table: `client_journey_steps`**
- `id` (uuid, PK)
- `clinic_id` (uuid, FK → clinics)
- `step_number` (int) — 1-31
- `status` (text) — `pending`, `in_progress`, `completed`
- `completed_by` (uuid, FK → auth.users, nullable)
- `completed_at` (timestamptz, nullable)
- `notes` (text, nullable)
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

RLS: Admin/concierge can read/write all. Clients can read their own clinic's journey.

**Seed logic**: When a clinic is created (or when the journey tab is first opened), auto-insert 31 rows for that clinic with `status = 'pending'`.

### Frontend Changes

1. **New tab on Clinic Detail page** — "Client Journey" tab (admin/concierge only)
2. **New component: `src/components/clinic-detail/ClientJourney.tsx`**
   - Displays all 8 phases as a vertical timeline/accordion
   - Each phase shows a progress bar (X/Y steps complete)
   - Each step shows: step number, name, department badge(s), status indicator
   - Staff can toggle step status (pending → in_progress → completed)
   - Completed steps show who completed them and when
   - Phase 08 marked as "Monthly Recurring" with a visual separator
3. **Journey config file: `src/lib/client-journey-config.ts`**
   - Static definition of all 31 steps with phase groupings and department assignments
   - Department color mapping for badges

### UI Design
- Vertical stepper/timeline layout with phase headers as collapsible sections
- Color-coded department badges (Design=blue, SEO=green, Social=purple, Ads=amber, All=gray)
- Progress ring or bar per phase
- Step cards with inline status toggle button
- Clean dark/light mode support using existing Tailwind theme tokens

### Technical Details
- Migration creates table + RLS policies + updated_at trigger
- Steps are initialized on first load via an upsert pattern (if no rows exist for clinic, insert all 31)
- Query uses react-query with `queryKey: ["client-journey", clinicId]`
- Status updates via optimistic mutation
- Department badges use the same color scheme as the workflow document

