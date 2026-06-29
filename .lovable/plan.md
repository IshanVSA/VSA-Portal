
# Social Media Department — Tab Redesign Plan

## Problem
The Social Media page currently shows 11–13 top-level tabs (Overview, Tickets, Active Promotions, Analytics, Files, Generate, GBP Posts, Brand DNA, Preferences, Meta Ads, Client Chat, Tasks, Team Chat). Clients see 11, staff see 13. The row scrolls horizontally and users can't find things.

## Solution: 5 grouped tabs with sub-tabs inside

Collapse related surfaces under one parent tab. Sub-tabs render inside each parent (same `Tabs` pattern already used in `GBPPostsTab` / `ClientPostsTab`). Badges (unread chat, pending review, open tasks) bubble up to the parent tab so nothing gets buried.

### New top-level structure

| Tab | Icon | Sub-tabs (Admin / Staff) | Sub-tabs (Client) |
|---|---|---|---|
| **Overview** | LayoutGrid | — | — |
| **Content** | Sparkles | Generate · GBP Posts · Brand DNA · Preferences · Promotions | My Posts · GBP Posts · Brand DNA · Preferences · Promotions |
| **Performance** | ChartColumn | Analytics · Meta Ads · Files | Analytics · Meta Ads · Files |
| **Work** | Ticket | Tickets · Tasks | Tickets |
| **Messages** | MessageCircle | Team Chat · Client Chat | Client Chat |

Result: **5 tabs for everyone** instead of 11–13.

### URL & deep-link compatibility
- Keep existing `?tab=` values working (e.g. `?tab=generation`, `?tab=brand-dna`, `?tab=chat`) by mapping legacy values → `{parent, sub}` on read. So existing links from notifications, dashboard cards, and the new `DepartmentStatusStrip` continue to work.
- Writing new state uses `?tab=<parent>&sub=<child>`.

### Badge bubbling
- "Content" parent shows amber badge when `socialPending > 0` (currently on My Posts / Generate).
- "Work" parent shows primary badge when `myOpenTasks > 0`.
- "Messages" parent shows destructive badge for `unreadCount + clientUnreadCount`, and the badge persists on the inner sub-tab too.

### Files & components touched
- `src/pages/SocialMedia.tsx` — replace flat `visibleTabs` array with grouped config; render parent `TabsList` + a thin inner `TabsList` for the active group. Keep all existing `<TabsContent>` bodies; just move them under the right parent.
- No changes to `TicketsTab`, `TasksTab`, `DepartmentChat`, `BrandDNATab`, `ContentGenerationTab`, `GBPPostsTab`, `ClientPostsTab`, `PromotionModule`, `SocialAnalyticsTab`, `UploadsTab`, `MetaAdsTab`, `ContentThemeSliders`, `SocialOverview`.
- No DB / schema / dependency changes.
- Left sidebar untouched.

### Visual treatment
- Parent tabs: same `bg-muted/50 h-10` strip already in use, sticky under the page header.
- Sub-tabs: smaller `h-9` strip directly under the parent strip, only visible when that parent is active. Matches the look of `GBPPostsTab`'s inner tabs so it feels native.
- Mobile: parent strip stays 5 items (fits without scrolling); sub-strip scrolls horizontally if needed.

## Acceptance
- Admin, staff, and client each see exactly 5 top-level tabs.
- Every current feature is still reachable in ≤ 2 clicks.
- Old `?tab=` URLs still land on the right surface.
- Badges for unread chat / pending review / open tasks remain visible at the parent level.
- App builds with zero TypeScript errors; no new deps, no schema changes.

## Open question
Grouping above is my recommendation. If you'd prefer a different split (e.g. keep **Promotions** under **Performance** instead of **Content**, or break **Brand DNA + Preferences** into their own "Setup" tab), say the word before I build and I'll adjust.
