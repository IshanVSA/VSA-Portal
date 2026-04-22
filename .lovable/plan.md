

## Goal
Upgrade the Quick Actions block in **Website**, **SEO**, and **Google Ads** departments to match the polished card-grid UI used in **Social Media** (icon tile + title + helper text), instead of the current flat badge chips.

## Current State
- `SocialOverview.tsx` → rich grid: each action is a card-button with a colored icon tile, bold title, and helper sentence (the target design).
- `DepartmentOverview.tsx` (used by Website / SEO / Google Ads) → renders `services` as plain `<Badge>` chips in a `flex-wrap` row. Functional but visually flat.

## Target Design (mirrors Social)
```text
┌───────────────────────────────────────────────────┐
│ Quick Actions          Click to create a ticket   │
├───────────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐│
│ │ [icon]   │ │ [icon]   │ │ [icon]   │ │ [icon] ││
│ │ Title    │ │ Title    │ │ Title    │ │ Title  ││
│ │ helper…  │ │ helper…  │ │ helper…  │ │ helper…││
│ └──────────┘ └──────────┘ └──────────┘ └────────┘│
└───────────────────────────────────────────────────┘
```
- Grid: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3`
- Each tile: rounded border card-button, `h-9 w-9` colored icon tile, title (semibold), helper (`text-[11px] text-muted-foreground line-clamp-2`), hover lifts border to primary and tints background.
- Click opens existing `NewTicketDialog` with `defaultType` prefilled (no behavior change).

## Implementation Plan

### 1. New shared registry — `src/lib/quick-actions.ts`
Map each department's ticket types to `{ type, title, helper, icon, color }` using lucide icons + Tailwind color tokens. Coverage:
- **Website** (9 types): Time Changes, Pop-up Offers, Third Party Integrations, Payment Options, Add/Remove Team Members, New Forms, Price List Updates, Emergency, Others.
- **Google Ads** (3 quick types): Call Volume Issues, Wrong Call Tracking, Others.
- **SEO** (staff only — clients still hidden): Backlinking, Ranking Reports, Keyword Research, Manual Work Reports, Search Atlas Integration, SEO Thread Updates, Others.
- **Social Media**: re-export the existing 5 from `SocialOverview`.

Export `getQuickActions(department)` returning the typed list. Color palette rotates blue/emerald/amber/violet/rose/sky/teal so each tile feels distinct (matches Social's tone).

### 2. Update `src/components/department/DepartmentOverview.tsx`
- Replace the badge-chips Quick Actions block with the same rich-card grid markup used in `SocialOverview` (icon tile + title + helper).
- Source the action metadata from `getQuickActions(department)`. If a service in `services` is missing from the registry, fall back to `{ title: getTicketTypeLabel(s), helper: "Create a ticket for this request", icon: Sparkles }` so nothing breaks.
- Keep the existing `NewTicketDialog` wiring (`defaultType=action.type`).
- Header copy aligned with Social: title "Quick Actions" + small right-aligned hint "Click to create a ticket".

### 3. Refactor `SocialOverview.tsx` (optional consistency)
Switch its inline `QUICK_ACTIONS` array to import from the new shared `quick-actions.ts` so all four departments stay in sync going forward. UI unchanged.

### 4. No changes required
- `WebsiteDepartment.tsx`, `SeoDepartment.tsx`, `GoogleAdsDepartment.tsx` — they keep passing `services` exactly as today.
- SEO client-hidden behavior preserved via existing `hideQuickActions={isClient}` flag.
- Ticket dialog, types, RLS, and routing — untouched.

## Files Edited / Created
- `src/lib/quick-actions.ts` *(new)*
- `src/components/department/DepartmentOverview.tsx` *(replace Quick Actions block)*
- `src/components/social/SocialOverview.tsx` *(swap inline list for shared registry — optional but recommended)*

