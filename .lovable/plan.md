
## Plan: Replace "Services" with "Quick Actions" in Social Media Overview

Replace the existing Services badge list in the Social Media Overview with 5 new Quick Actions, each opening a tailored intake form that creates a `department_tickets` row in the `social_media` department.

### Quick Actions to add

| # | Action | Fields |
|---|--------|--------|
| 1 | Content Request | Title, Description, Additional Notes, Attachments |
| 2 | Client Visit | Pet Type (dropdown: Dogs / Cats / Others), Pet Name, Service Opted / Reason for Visit, Service to Highlight, Description, Attachments |
| 3 | Bulk Uploads | Up to 20 attachments. On ticket completion, files move into the Uploads tab |
| 4 | Special Promotion | Title, Description, Start Date, End Date (optional), Additional Notes, Attachments |
| 5 | Boost | Issues / Concerns, Special Service to Promote, Start Date, End Date, Additional Notes, Attachments |

### UI changes (`SocialOverview.tsx`)

- Rename the card from "Services" to "Quick Actions".
- Replace the badge list with a 5-tile grid (icon + title + short helper text) styled like the existing dashboard quick actions. Each tile opens its own dialog.
- Remove the old `socialServices` array and the prefilled-service flow on this card.

### New ticket-form components (under `src/components/department/ticket-forms/`)

Following the existing form pattern (`onChange(description)` + reusable `FileUploader`):

- `ContentRequestForm.tsx` — title, description, notes, attachments
- `ClientVisitForm.tsx` — pet type (Select), pet name, reason, highlight service, description, attachments
- `SpecialPromotionForm.tsx` — title, description, start date (Calendar/Popover), optional end date, notes, attachments
- `BoostForm.tsx` — concerns, service to promote, start/end dates, notes, attachments

For "Bulk Uploads" no custom intake fields are needed beyond the file dropzone and an optional note, so it can use a lightweight inline dialog with `FileUploader` (max 20).

### Wiring into the ticket pipeline

- Register the 5 new ticket types in:
  - `src/lib/ticket-display-labels.ts` (display name mapping)
  - `src/lib/ticket-department-map.ts` → all 5 visible only in `social_media`
  - `NewTicketDialog.tsx` `CUSTOM_FORM_TYPES`, `AUTO_TITLES`, and `renderCustomForm()` switch
- Each Quick Action tile opens `NewTicketDialog` with `defaultType` preset to the new type, so the existing submission, attachment upload, and "Forwarded to" flow is reused (no duplication).

### Bulk Uploads → Uploads tab on completion

- Bulk Uploads ticket stores files under `tickets/{ticketId}/...` like other tickets (existing behavior).
- Add a small server-side action on ticket completion:
  - **Migration**: a Postgres trigger on `department_tickets` that fires when a `Bulk Uploads` ticket transitions to `status = 'completed'`. The trigger calls a SECURITY DEFINER function that copies each path from `tickets/{id}/*` to `social_media/*` inside the same `department-files` bucket using `storage.objects` row updates (rename path).
  - Simpler alternative (preferred for reliability): when an admin/concierge marks a Bulk Uploads ticket completed in the UI (`TicketCard` / `TicketKanbanView` / `TicketTableView`), client-side calls `supabase.storage.from('department-files').move(oldPath, 'social_media/' + filename)` for each attachment, then refreshes the Uploads tab list.
- The Uploads tab already lists everything under `social_media/` in the bucket, so moved files appear automatically. No schema change required for this option.

### Database

- No schema changes needed unless we go with the trigger-based move. Recommended approach: do the move client-side on status transition to "completed" — zero migrations, simpler.

### Files to touch (technical)

- `src/components/social/SocialOverview.tsx` — replace Services card with Quick Actions grid.
- `src/components/department/NewTicketDialog.tsx` — register 5 new custom forms.
- `src/lib/ticket-display-labels.ts`, `src/lib/ticket-department-map.ts` — add type entries.
- New: `ContentRequestForm.tsx`, `ClientVisitForm.tsx`, `SpecialPromotionForm.tsx`, `BoostForm.tsx`, `BulkUploadsForm.tsx`.
- `TicketCard.tsx` (and Kanban/Table) — on transition to completed for `Bulk Uploads`, move attachments into `social_media/` folder.

### Verification

- Each Quick Action opens its dialog with correct fields.
- Submitting creates a ticket visible in the Social Media Tickets tab with the right title and parsed description.
- Marking a Bulk Uploads ticket as Completed moves its files into the Uploads tab.
- Other departments still work unchanged (these 5 types are scoped to `social_media`).
