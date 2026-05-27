## Website Delivery Checklist Tab

Add a new **Checklist** tab inside the Website department that tracks delivery/configuration items per clinic. Items are managed globally (admin-editable) and tracked per clinic. Hidden from clients.

### Database (2 new tables)

**`website_checklist_items`** — global master list shared across all clinics
- `id`, `section` (text: e.g. "Before Migration" / "After Migration"), `label` (text), `position` (int for ordering), `is_active` (bool), `created_at`, `updated_at`
- Seeded with the 24 items from the uploaded checklist (2 before-migration + 22 after-migration)
- RLS: admin/concierge can read & write; clients blocked

**`website_checklist_status`** — per-clinic completion state
- `id`, `clinic_id` (fk), `item_id` (fk → website_checklist_items), `is_done` (bool), `completed_by` (uuid, nullable), `completed_at` (timestamptz, nullable), `notes` (text, nullable), `created_at`, `updated_at`
- Unique constraint on `(clinic_id, item_id)`
- RLS: admin/concierge only

When a new item is added globally, it appears for every clinic as unchecked (no row needed — UI shows missing rows as not-done).

### UI

**New tab** in `src/pages/WebsiteDepartment.tsx`: `ListChecks` icon, label "Checklist", gated to `isStaff` (admin/concierge) — same pattern as Tasks/Chat tabs. **Hidden from clients.**

**New component** `src/components/department/WebsiteChecklistTab.tsx`:
- Grouped by section ("Before Migration", "After Migration") in collapsible cards
- Each item = checkbox + label + (when checked) small "by {name} · {date}" caption + optional notes popover
- Progress bar at top: "X of Y complete" per clinic
- Toggling a checkbox upserts into `website_checklist_status`
- **Manage items** button (admin only) → opens a dialog to add/rename/reorder/deactivate global items; changes propagate to all clinics immediately

**New hook** `src/hooks/useWebsiteChecklist.ts`:
- `useChecklistItems()` — global active items
- `useChecklistStatus(clinicId)` — joined items + status for a clinic
- Mutations: `toggleItem`, `addItem`, `updateItem`, `deactivateItem`, `reorderItems`

### Files

- migration: create both tables + RLS + seed 24 items
- new: `src/components/department/WebsiteChecklistTab.tsx`
- new: `src/components/department/ChecklistItemsManagerDialog.tsx` (admin manage modal)
- new: `src/hooks/useWebsiteChecklist.ts`
- edit: `src/pages/WebsiteDepartment.tsx` (add tab)

### Notes / Open questions

1. Should the **Manage items** dialog be admin-only, or concierge too? (Default: admin-only — concierge can only tick boxes.)
2. Item deletion: soft-delete via `is_active=false` so historical completion data is preserved — OK?
