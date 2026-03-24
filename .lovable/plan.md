

## Admin Dashboard Redesign

The current dashboard has good bones but can be improved for a true "command center" feel. Based on the platform's features (clinics, tickets, content workflow, departments, team), here's the redesign.

### Layout Overview

```text
┌─────────────────────────────────────────────────────────┐
│  Welcome back, [Name]        [Review Queue] [+ Ticket]  │
│  3 pending · 2 urgent · 5 active clinics                │
├─────────┬─────────┬─────────┬─────────┬─────────────────┤
│ Active  │  Open   │ Pending │  Team   │  Content        │
│ Clinics │ Tickets │ Review  │ Members │  Requests       │
│   5     │   12    │   3     │   8     │   4 pending     │
├─────────┴─────────┴─────────┴─────────┴─────────────────┤
│                                                         │
│  ┌─ Tickets by Dept ──┐  ┌─ Clinic Health ────────────┐ │
│  │ Website    4 open  │  │ Clinic 1  ✓Web ✓SEO ✗Ads  │ │
│  │ SEO        2 open  │  │ Clinic 2  ✓Web ✗SEO ✓Ads  │ │
│  │ Google Ads 3 open  │  │ Clinic 3  ✓All enabled     │ │
│  │ Social     1 open  │  │                            │ │
│  └────────────────────┘  └────────────────────────────┘ │
│                                                         │
│  ┌─ Content Pipeline ─┐  ┌─ Content Trend ───────────┐ │
│  │ Generated    12     │  │  [area chart, 6 months]   │ │
│  │ In Review     3     │  │                           │ │
│  │ Approved      8     │  │                           │ │
│  │ Scheduled    22     │  │                           │ │
│  └─────────────────────┘  └───────────────────────────┘ │
│                                                         │
│  ┌─ My Tickets ──┐  ┌─ Upcoming Posts ┐  ┌─ Activity ┐ │
│  │  (existing)   │  │   (existing)    │  │ (existing) │ │
│  └───────────────┘  └─────────────────┘  └───────────┘ │
└─────────────────────────────────────────────────────────┘
```

### What Changes

**1. Expand KPI row to 5 cards (from 4)**
- Active Clinics (existing)
- Open Tickets (existing, with urgent count)
- Pending Review — content posts awaiting admin review (links to /review)
- Team Members — total concierges + clients (links to /employees)
- Content Requests — pending content requests needing action (links to /content-requests)

**2. Replace "All Clinics" table with "Clinic Health" compact card**
- Shows top 8 clinics with their service-access badges (Web/SEO/Ads/Social) as colored dots
- Shows concierge assignment and status
- Much more information-dense than the current plain table
- "View All" links to /clinics

**3. Add "Content Pipeline" card (new)**
- Shows content request workflow stages as a vertical funnel/list:
  - Generated, Concierge Preferred, Admin Approved, Client Selected, Finalized
- Each with a count, giving the admin instant visibility into the content workflow bottleneck
- Replaces the less-useful "Concierges/Clients" KPI cards which are static numbers

**4. Keep existing widgets but reorder for priority**
- Department Tickets card stays (left column, row 2)
- Content Trend chart stays (right column, row 2)
- My Tickets, Upcoming Posts, Recent Activity stay as the 3-col bottom row

**5. Improve header with a "+ New Ticket" quick action**
- Keep Review Queue button with badge
- Add a quick "New Ticket" button alongside "Clinics"

### Files to Change

- `src/components/dashboard/AdminDashboard.tsx` — full rewrite of the component with the new layout, additional data fetches (content_requests pipeline counts, clinic service flags), and the new Clinic Health card

### Data Fetches to Add

- `content_requests` grouped by status for the pipeline card
- `clinics` with service-enabled flags (`website_enabled`, `seo_enabled`, etc.) for the health card
- `content_posts` with `status = 'pending'` for the KPI (already partially done)

### What Gets Removed

- The full "All Clinics" table (10 rows) — replaced by the compact health overview
- Separate "Concierges" and "Clients" KPI cards — merged into one "Team" card
- No new files needed; everything fits in the existing AdminDashboard component

