# Dashboard De-Boxing / Operations HUD Plan

## Goal
Replace the generic card-heavy dashboard with an **Operations HUD** layout that feels like a professional marketing command center, while keeping scanability for both internal staff and clients. Department colors become the primary organizational signal instead of box borders.

## Why This Direction
- The current dashboard stacks `HeroStat` cards for every metric, which creates visual noise and reads as generic AI-generated UI.
- A digital marketing agency dashboard needs **quick status comprehension** over decoration.
- Removing hard boxes in favor of whitespace, color-coded chips, and inline typography creates a more confident, editorial-operational feel.

## Scope
This plan focuses on the **Admin Dashboard** first; the same visual language will be extended to the department-level KPI strips (Website, SEO, Google Ads, Social, AI SEO) where they currently use `MetricCard` / `StatsCard` boxes.

## Visual Changes

### 1. Admin Dashboard hero metrics
Replace the five `HeroStat` cards in a grid with a single **horizontal status strip**:
- Each metric = a compact number + label pair, not a card.
- Use department color only on the number and a subtle vertical divider between metrics.
- Add a tiny status dot (green/amber/red) per metric to carry urgency.
- Keep click-through behavior (drill-down to filtered lists).

### 2. Department health row
Convert the current department summary cards into **floating chips**:
- Small pill-shaped chips per department: Website, SEO, Google Ads, Social Media.
- Each chip shows the department icon, open ticket count, and a color-coded pulse dot.
- Chips sit on the same baseline as the hero strip, not inside separate cards.

### 3. Pipeline tracker
Flatten the pipeline card into a **horizontal segmented progress bar**:
- Five stages: Generated → Sent → Copy Approved → Final Approved → Posted.
- Each segment width is proportional to count; department color used for the active segment.
- No border container; the bar itself is the visual anchor.

### 4. Activity & upcoming posts
Merge "Recent Activity" and "Upcoming Posts" into a single **unified timeline column**:
- Timeline items with a vertical line and dot markers.
- Each item is a row of text + metadata; no card borders, just a subtle hover background.
- Keep sections separated by a small heading and whitespace.

### 5. Open tickets / open tasks
Replace the current list cards with **plain list rows**:
- Rows separated by a 1px hairline divider.
- Department color only on the left edge or status badge.
- Hover state gives a slight background lift instead of relying on a box.

## Department Color Coding
Use existing semantic tokens:
- Website: `--dept-website` (teal)
- SEO: `--dept-seo` (orange)
- Google Ads: `--dept-ads` (amber/slate)
- Social Media: `--dept-social` (indigo/purple)
- AI SEO: `--dept-ai-seo` (rose/coral)
- Admin/General: `--primary` / `--muted-foreground`

## Files to Touch
- `src/components/dashboard/AdminDashboard.tsx` — main dashboard layout
- `src/components/ui/metric-card.tsx` — convert to non-card inline/chip variant
- `src/components/StatsCard.tsx` — update wrapper to use the new metric style
- `src/components/DashboardSkeleton.tsx` — adjust skeletons for new layout
- Department KPI strips: `WebsiteDepartment.tsx`, `GoogleAdsDepartment.tsx`, `SocialAnalyticsTab.tsx`, `SearchAtlasLLMTab.tsx`, `SearchAtlasKeywordsTab.tsx`

## Implementation Steps
1. Update `metric-card.tsx` to support a new `variant="inline"` / `variant="chip"` without borders.
2. Rebuild the AdminDashboard header into a status strip + chips + tracker.
3. Convert `RecentActivity` and `UpcomingPosts` containers into a timeline list.
4. Flatten `OpenTicketsList` and `OpenTasksList` into plain rows.
5. Apply the same KPI flattening to department pages.
6. Update skeletons and ensure mobile responsiveness (the strip stacks vertically on small screens).

## Verification
- Screenshot desktop and mobile dashboard.
- Confirm all drill-downs still work.
- Confirm department colors are preserved and accessible.
- Check that no metric is visually lost without its box border.
