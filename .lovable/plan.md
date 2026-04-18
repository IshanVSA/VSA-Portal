

## Plan: Calendar-based Approval Flow for SM2 Content

Replace the current HTML-iframe deliverable view with an Apple-style monthly calendar where each post sits on its scheduled day. Concierge/admin attach an image per post, then send the whole calendar to the client for review and approval.

### Current state (verified)

- `sm2_generations` stores one row per clinic/month with an `html_file_path` deliverable and `approval_status` lifecycle (`pending` → `sent_to_client` → `approved_client` / `feedback_submitted`).
- Posts themselves currently live inside the generated HTML, not as structured rows. We need structured posts to render a calendar and attach images.
- `useSM2Generation` already handles generate / sendToClient / approve / submitFeedback.
- Storage bucket `department-files` (public) is available for images.

### Data model changes

New table `sm2_posts` (one row per post inside a generation):

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `generation_id` | uuid fk → `sm2_generations.id` cascade | |
| `clinic_id` | uuid | for RLS |
| `scheduled_date` | date | day on the calendar |
| `platform` | text | facebook / instagram / tiktok |
| `post_type` | text | reel / static / story / carousel |
| `theme` | text | e.g. Education, Promotion |
| `caption` | text | |
| `hashtags` | text[] | |
| `cta` | text | |
| `hook` | text | |
| `compliance_notes` | text | |
| `image_path` | text nullable | storage path inside `department-files` |
| `image_uploaded_at` | timestamptz | |
| `image_uploaded_by` | uuid | |
| `position` | int | order within the day |
| `created_at` / `updated_at` | timestamptz | |

RLS: admin + concierge full access for clinics they manage; client SELECT only when parent generation `approval_status` is in `sent_to_client | approved_client | feedback_submitted`.

Add a derived flag (computed in UI, no column): `imagesComplete = posts.every(p => p.image_path)`. Send-to-client button is disabled until true.

Edge function `generate-sm2-content` updated to also insert `sm2_posts` rows after the pipeline finishes (parsed from the same structured output the HTML is built from). Existing HTML deliverable is kept as a fallback view.

### UI changes

**New component: `src/components/social/SM2CalendarView.tsx`**
- Apple Calendar-style monthly grid (reuse styling from existing `MonthlyView` in content-calendar; do not reuse the component itself since data shape differs).
- Each day cell shows compact chips per post (platform icon + theme color + small thumbnail if image uploaded, otherwise a "no image" placeholder).
- Header: month label, status pill (`Pending images 4/10`, `Ready to send`, `Sent to client`, `Approved`), and primary action button:
  - Concierge/admin, `pending` + images incomplete → button disabled with tooltip "Add images to all posts first".
  - Concierge/admin, `pending` + images complete → "Send to client for review".
  - Client, `sent_to_client` → "Approve" + "Request changes" (existing mutations).
- Click a day → opens **PostDayDialog** popup.

**New component: `src/components/social/PostDayDialog.tsx`**
- Shows all posts scheduled for that date.
- Each post card: platform, theme, caption, hashtags, CTA, hook, compliance notes (read-only for everyone — content is locked once generated, matches current behavior).
- Image slot per post:
  - Concierge/admin: drag-and-drop or file picker, uploads to `department-files/sm2/{generation_id}/{post_id}.{ext}`, writes `image_path` on the post. Replace/remove supported.
  - Client: read-only image preview.
- Client view also shows per-post inline feedback textarea (optional) — saved to `sm2_posts.client_feedback` (add nullable text column) so concierge can revise specific posts later.

**Wiring**
- `src/components/social/ContentGenerationTab.tsx` (staff): replace HTML iframe deliverable with `SM2CalendarView` for the `currentGeneration`. Keep a small "View raw HTML" link for fallback.
- `src/components/social/ClientContentReview.tsx` (client) similarly switches to `SM2CalendarView` when generation is `sent_to_client`.

**New hook: `src/hooks/useSM2Posts.ts`**
- `useSM2Posts(generationId)` → list, image upload mutation, image delete mutation, optional per-post feedback save.
- Realtime channel on `sm2_posts` filtered by `generation_id` so multiple staff see image uploads live.

### Send-to-client gating

Update `sendToClient` mutation in `useSM2Generation`:
- Before update, fetch posts and verify all have `image_path`. If not, throw "All posts need images before sending."
- On success: existing `sent_to_client` status + toast.

### Backwards compatibility

- Existing generations without `sm2_posts` rows: show a one-time "Migrate to calendar" button on the deliverable that calls a small edge function `backfill-sm2-posts` to parse the HTML and create rows. Out of scope for this iteration if you'd rather skip — let me know.

### Files touched

Migration:
- New table `sm2_posts` + RLS + indexes.
- Add `client_feedback text` to `sm2_posts`.

Edge:
- `supabase/functions/generate-sm2-content/index.ts` — insert structured posts after pipeline.

Frontend:
- `src/components/social/SM2CalendarView.tsx` (new)
- `src/components/social/PostDayDialog.tsx` (new)
- `src/hooks/useSM2Posts.ts` (new)
- `src/hooks/useSM2Generation.ts` — guard `sendToClient`, expose `imagesComplete` helper.
- `src/components/social/ContentGenerationTab.tsx` — render calendar.
- `src/components/social/ClientContentReview.tsx` — render calendar for client.

### Open question

Backfill for already-generated months: should we (a) skip — only new generations get the calendar, or (b) add the backfill edge function so existing deliverables also become calendars? Defaulting to (a) unless you say otherwise.

