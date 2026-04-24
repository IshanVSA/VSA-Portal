## Goal
Split the SM2 client approval into **two distinct rounds** instead of one:

1. **Round 1 — Copy approval (text only).** Concierge sends generated content to the client *without images*. Client reviews captions/hooks/hashtags and approves the copy (or requests changes).
2. **Round 2 — Visual approval.** Only after copy is approved, concierge uploads images to each post, then sends back to the client. Client gives final approval, which unlocks scheduling.

## Current state (what I verified)
- `useSM2Generation.ts` has a single `sendToClient` mutation that **requires every post to already have an image** (gate in `sendToClient.mutationFn`). It moves status: `pending → sent_to_client → approved_client/feedback_submitted`.
- `SM2CalendarView.tsx` blocks the "Send to client" button on `imagesComplete` and shows "Awaiting visuals · X/Y posts" badges.
- `ClientContentReview.tsx` shows the deliverable to the client as a single review with Approve / Request Changes.
- `auto-approve-posts/index.ts` cron auto-approves anything sitting in `sent_to_client` for 5 days.
- Image upload UI already exists (`useSM2Posts.uploadImage`) — concierges currently use it *before* sending. We just change *when* it's required.

## New status machine for `sm2_generations.approval_status`
```
pending
  → sent_for_copy_review        (concierge sends; no images required)
      → copy_changes_requested  (client requests copy changes; concierge edits & re-sends)
      → copy_approved           (client approves copy → unlocks image upload)
          → sent_for_final_review   (concierge has uploaded all images & sent back)
              → final_changes_requested
              → approved_client / approved_auto   (final approval; existing downstream)
generation_failed (unchanged)
```
Existing rows using `sent_to_client` / `approved_client` / `feedback_submitted` / `approved_auto` will be migrated forward (see Migration section). Downstream code that reads `approved_client` / `approved_auto` (e.g. `ClientContentCalendar` "APPROVED_STATUSES") keeps working unchanged.

## Changes by file

### Backend / data
1. **New migration** (`supabase/migrations/...`):
   - No schema column changes needed — `approval_status` is `text`.
   - Backfill any existing rows:
     - `sent_to_client` → `sent_for_copy_review` (so legacy in-flight items restart at copy stage; safest default).
     - `feedback_submitted` → `copy_changes_requested`.
     - `approved_client` / `approved_auto` stay as-is (those are already finalized in current world; we treat them as final approved).
   - Optional: add a CHECK-style validation trigger to enforce the new vocabulary (skip if it risks breaking the cron — see #2).

2. **`supabase/functions/auto-approve-posts/index.ts`**:
   - Currently auto-approves `sent_to_client` after 5 days. Update to handle **both** waiting states:
     - `sent_for_copy_review` → auto-promote to `copy_approved` after 5 days (with same Day 0/3/5 emails).
     - `sent_for_final_review` → auto-promote to `approved_auto` after 5 days (existing behavior, just under new status name).
   - Email copy in those reminders should mention what they're approving ("the captions" vs "the visuals").

### Hook: `src/hooks/useSM2Generation.ts`
- Replace `sendToClient` mutation with two mutations (or one parameterized):
  - **`sendCopyForReview(generationId)`** — sets `approval_status='sent_for_copy_review'`, `sent_to_client_at=now()`. **No image gate.** Allowed when status is `pending` or `copy_changes_requested`.
  - **`sendFinalForReview(generationId)`** — runs the existing image-completeness gate (every post has ≥1 image). Sets `approval_status='sent_for_final_review'`, updates `sent_to_client_at=now()`. Allowed when status is `copy_approved` or `final_changes_requested`.
- Replace `approveContent` with two mutations:
  - **`approveCopy(generationId)`** — `pending|copy_changes_requested → copy_approved` (no `approved_at`).
  - **`approveFinal(generationId)`** — `sent_for_final_review → approved_client`, sets `approved_at=now()` (this is the existing finalize behavior).
- Replace `submitFeedback` with two:
  - **`requestCopyChanges({ generationId, feedback })`** → `copy_changes_requested`.
  - **`requestFinalChanges({ generationId, feedback })`** → `final_changes_requested`.

### Concierge UI: `src/components/social/ContentGenerationTab.tsx` + `SM2CalendarView.tsx`
- Drive the primary CTA from `approval_status`:
  - `pending` → button: **"Send copy to client for review"** (no image gate).
  - `copy_changes_requested` → same button label, plus a banner showing client feedback to address.
  - `sent_for_copy_review` → disabled state: "Awaiting client copy approval (auto-approves in N days)".
  - `copy_approved` → button: **"Send for final approval"**, gated on `imagesComplete`. Surface "Upload images: X/Y posts" with the existing inline uploader.
  - `final_changes_requested` → same button, plus client visual feedback banner.
  - `sent_for_final_review` → disabled state: "Awaiting client final approval".
  - `approved_client` / `approved_auto` → existing "Approved" badge.
- Image uploader stays available throughout but becomes the *focus* only after `copy_approved`. We can subtly grey/collapse it before then (still allow early uploading — no harm).
- Update status-badge map (`STATUS_CONFIG` in `ContentGenerationTab.tsx` line ~389) with the new statuses.

### Client UI: `src/components/social/ClientContentReview.tsx` + `ClientPostsTab.tsx`
- Update the visibility filter (currently looks for `sent_to_client`/`approved_client`/`approved_auto`/`feedback_submitted`) to include `sent_for_copy_review`, `copy_approved` (read-only “Awaiting visuals from concierge”), `sent_for_final_review`, `final_changes_requested`, `approved_client`, `approved_auto`.
- Render two different review cards based on `approval_status`:
  - **Copy review card** (`sent_for_copy_review`): show captions/hooks/hashtags only, hide image slots (or show "Visuals will be added after you approve the copy"). Buttons: **Approve copy** / **Request copy changes**.
  - **Final review card** (`sent_for_final_review`): full deliverable with images. Buttons: **Approve final** / **Request changes**.
  - **Between rounds** (`copy_approved`, `final_changes_requested` etc.): read-only status banner so the client knows where they stand.
- `AutoApprovalNotice` countdown applies to both `sent_for_copy_review` and `sent_for_final_review`.

### Calendar view (`SM2CalendarView.tsx`)
- Update status helpers (lines ~98–110) so the new statuses produce sensible badges ("Awaiting copy review", "Copy approved · upload visuals", "Awaiting final review", "Final approved").
- "Send" CTA in the dialog (line ~310) becomes context-aware: gated on images **only** when sending for final review.

### Downstream consumers (no logic change, just status set update)
- `ClientContentCalendar.tsx` `APPROVED_STATUSES` already includes `approved_client` / `approved_auto` — these remain the "fully approved" terminal states, so scheduling/visibility still triggers at the right moment.
- `ClientPostsTab.tsx` line 28 filter — broaden to surface both review rounds.

## Open questions (please confirm before I implement)
1. **Backfill of in-flight items** — for any generations currently in `sent_to_client` (full-deliverable awaiting approval under the old flow), should I:
   - (a) Map them to `sent_for_final_review` (treat as already past copy approval, since concierge already uploaded images), **or**
   - (b) Reset them to `sent_for_copy_review` (safer, but client re-approves copy)?
   I recommend **(a)** since images are already attached.
2. **Auto-approval window** — keep the same 5-day window for *both* rounds, or shorten the copy round (e.g. 3 days) so the whole cycle isn't 10 days?
3. **Early image uploads** — should concierges be allowed to upload images *before* copy is approved (current behavior, just not required), or should the uploader be hard-locked until `copy_approved`?

Once you confirm those three, I'll implement in default mode.