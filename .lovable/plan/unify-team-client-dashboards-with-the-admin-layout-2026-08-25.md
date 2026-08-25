# Unify Team & Client Dashboards with the Admin Layout

Not done yet. The admin dashboard was rebuilt as a single framed panel (hairline dividers, tapered vertical separators, StatusMetric strip, HUD typography). The team-member dashboard and the client portal dashboard are still the older multi-box card grids (`KPICard` tiles, separate bordered cards per section).

## What changes

### Team member dashboard (Concierge)
- Wrap the whole page in the same unified panel: one rounded sheet, `divide-y` hairline dividers between sections, consistent section padding.
- Replace the three `KPICard` boxes (Assigned Clinics, Total Posts, Pending Review) with the shared `StatusMetric` strip plus tapered vertical dividers between metrics, matching admin exactly.
- Sections become dividered bands instead of standalone cards:
  - My Tickets / My Tasks
  - Upcoming Posts / Recent Activity
  - Your Clinics (compact rows with avatar initial, status dot, arrow — no per-clinic card border)
- Same header treatment as admin: name, live status line, no redundant badge.

### Client dashboard
- Same unified panel shell and divider system.
- The adaptive KPI strip (Open tickets, To review, Visitors, Top-10 keywords, Ad clicks, Messages) becomes `StatusMetric` items in one row with tapered dividers, keeping their existing click-through behavior and department color coding.
- Department snapshots, calendar, recent updates, and messages become dividered bands inside the panel rather than separate bordered cards.
- Clinic switcher pills and quick actions stay as-is (already unboxed).

## Kept unchanged
- All data fetching, RLS-scoped queries, KPI logic, routing, and click targets.
- Department color tokens, role gating, and mobile stacking behavior (metrics collapse to a 2-column grid on small screens; dividers hide below `sm`).

## Technical notes
- Reuse `StatusMetric` from `src/components/dashboard/StatusMetric.tsx` and the tapered-divider markup already in `AdminDashboard.tsx`; extract the divider into a small shared component so all three dashboards stay in sync.
- Files touched: `src/components/dashboard/ConciergeDashboard.tsx`, `src/components/dashboard/ClientDashboard.tsx`, `src/components/dashboard/StatusMetric.tsx` (add exported `MetricDivider`), and a light pass on `MyTickets.tsx`, `MyTasks.tsx`, `UpcomingPosts.tsx`, `RecentActivity.tsx` to drop their outer card borders when rendered inside the panel.
- `KPICard.tsx` becomes unused once both dashboards migrate; remove it if nothing else imports it.
