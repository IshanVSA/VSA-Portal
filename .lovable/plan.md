## Why the rest of the app still feels different

The previous passes only updated radii, borders, and component primitives. The **New Task** modal in your screenshot is iOS-feeling for three structural reasons that the rest of the app doesn't share yet:

1. **Grouped inset list layout** — content lives in `rounded-2xl` white groups stacked on a gray canvas, with hairline dividers between rows.
2. **Colored icon tiles** — each row leads with a 28×28 rounded-square tile in a saturated color (orange Flag, red Calendar, blue Person, purple Mic, green Paperclip) and a white glyph.
3. **iOS modal header** — Cancel (left, blue regular) / Title (center, semibold) / Action (right, blue bold), no border.

None of those patterns exist outside `TasksTab.tsx`. Tokens are already correct (`--background` is iOS gray light / true black dark, `--card` is the grouped cell). The fix is structural, not chromatic.

## Plan

### 1. Build two reusable primitives

`src/components/ui/ios-list.tsx`

- `<IOSGroup>` — `rounded-2xl bg-card border border-border/40 overflow-hidden divide-y divide-border/40 shadow-sm`. Optional `footer` / `header` slots for the small all-caps captions iOS uses above and below groups.
- `<IOSRow>` — flex row with: `icon` (renders inside a `rounded-xl` 28×28 colored tile), `label`, optional right-aligned `value`, optional `chevron`, optional `to` / `onClick` to make the whole row tappable with `hover:bg-accent/30`.
- `<IOSIconTile tone="orange|red|blue|purple|green|indigo|pink|teal|yellow|gray">` — encapsulates the colored tile so colors stay consistent everywhere.

These take ~80 lines and replace ad-hoc markup across the project.

### 2. Add semantic icon-tile color tokens

In `src/index.css` add `--ios-orange`, `--ios-red`, `--ios-blue`, `--ios-green`, `--ios-purple`, `--ios-indigo`, `--ios-pink`, `--ios-teal`, `--ios-yellow`, `--ios-gray` (HSL, both light and dark) so tiles aren't hard-coded Tailwind colors.

### 3. Standardize the modal header pattern

Create `<IOSDialogHeader cancelLabel actionLabel onCancel onAction title disabled />` matching the New Task header. Apply to: `NewTicketDialog`, `TicketEditDialog`, `UpdateSeoAnalyticsDialog`, `BulkUploadsDialog`, `PartnershipsDialog`, `PageSelectionDialog`, `GBPLocationSelectionDialog`, `GoogleAccountSelectionDialog`, `FilePreviewDialog`, `OpenTicketsList`, `OpenTasksList`.

### 4. Refactor pages page-by-page to use the grouped pattern

Highest-impact first; each page becomes stacked `<IOSGroup>`s on the existing gray canvas instead of large `<Card>` slabs:

- **Settings** — already close. Convert Profile / Password / Notifications / Theme / Logout sections into `IOSGroup`s of `IOSRow`s with the existing colored tile glyphs.
- **Clinic Detail** — Connection cards (Meta, GBP, Google Ads, Tracking Setup) become a single connections group of rows with status pills on the right. Team picker and tabs gain the same treatment.
- **Reports** — date filter + per-department rows in one group; downloads as right-side action.
- **Clients / Employees / Sub Accounts / Clinics list** — each row becomes an `IOSRow` (avatar tile + name + meta on right + chevron) inside per-letter or per-status groups; the existing A–Z list already maps to iOS section headers.
- **Department pages** (Website / SEO / AI SEO / Google Ads / Social) — convert the in-tab section panels (Health, Analytics summary, Reports, GBP) to grouped lists. Ticket grid stays card-based (already good).
- **Dashboards** (Admin / Concierge / Client) — KPI strip stays; the side panels (OpenTicketsList, OpenTasksList, TeamActivity, RecentActivity, UpcomingPosts) become grouped lists with colored tiles per category.
- **Login / Reset Password / Book Meeting** — wrap form fields in one `IOSGroup` with row-style inputs (borderless, divider between fields), matching the Title/Notes group in the screenshot.

### 5. Make Tabs feel like iOS segmented control

Update `src/components/ui/tabs.tsx` so `TabsList` is a `bg-muted rounded-full p-1` pill and `TabsTrigger[data-state=active]` is a white pill with subtle shadow. This single change retunes every tabbed surface (department tabs, clinic detail tabs, social tabs).

### 6. Polish details

- Replace heavy section H2s with the iOS pattern: small all-caps muted caption ABOVE each `IOSGroup`.
- Right-align values, use `text-primary` for tappable values (like "Medium ▾" in the screenshot).
- Add `chevron-right` to navigational rows.
- Soft global page padding bumped to `px-4 sm:px-6 py-6` to give iOS-style breathing room.

## Technical notes

- No business logic touched. Pure structural/presentational refactor.
- Existing `Card`, `Button`, `Input`, `Select` primitives keep working — `IOSGroup` and `IOSRow` are additive and used where the grouped pattern fits.
- Department accent colors and brand identity preserved; only the chrome around them changes.
- Scope is large — I'll work in passes (primitives + Settings + Clinic Detail first, then dashboards, then department pages, then the remaining list pages), and check in between so you can steer.

## Out of scope

- Calendar / Content Calendar grid (already custom, mobile-first design)
- Ticket cards (already revamped last pass)
- Login visual identity beyond field grouping
