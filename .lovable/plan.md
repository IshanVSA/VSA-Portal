# Single-Step Social Media Approval

Replace the current two-round approval (copy review → visuals → final review) with one combined approval. Staff prepares captions AND visuals together, sends once, and the client's approval is treated as the final approval.

## Behavior changes

**Staff side (ContentGenerationTab / SM2CalendarView)**
- Visuals (image upload) section is unlocked from the moment a generation completes — no longer gated behind `copy_approved`.
- Remove the "Send copy to client" CTA. Replace with a single **"Send to client for approval"** button.
- That button is disabled until every post has at least one image attached (same rule that currently governs final-round send).
- Clicking it sets `approval_status = 'sent_for_final_review'` directly (skipping `sent_for_copy_review` / `copy_approved`).
- Wording cleanup: remove "Copy approved · add visuals", "captions only", "Round 1 / Round 2" copy throughout the calendar view and status badges.

**Client side (ClientContentReview)**
- Only one review state is shown: `sent_for_final_review`.
- Approve button reads **"Approve"** and sets `approval_status = 'approved_client'` (already the existing final-approve path).
- "Request changes" sends back as `final_changes_requested` (existing behavior).
- Remove the "Copy approved · awaiting visuals" intermediate card.

**Backend / automation**
- `useSM2Generation.sendToClient`: write `sent_for_final_review` (and set `sent_to_client_at`) instead of `sent_for_copy_review`. Remove the separate `approveCopy` / `sendFinalReview` two-step methods from the UI flow (keep functions usable but unused, or delete callers).
- `supabase/functions/auto-approve-posts` Part 3a (copy review auto-advance) becomes a no-op since nothing will enter `sent_for_copy_review` anymore. Keep Part 3b (final review → `approved_client`) unchanged.
- `supabase/functions/notify-content-approval`: default `stage` to `"final"`; only the final-review email template is used going forward.

**Legacy data**
- Existing generations still sitting in `sent_for_copy_review` / `copy_approved` remain renderable (badges/labels kept in maps) so historical records aren't broken, but no new generation can reach those states.

## Files to touch

- `src/hooks/useSM2Generation.ts` — reroute send to `sent_for_final_review`; deprecate copy-stage mutations from UI.
- `src/components/social/SM2CalendarView.tsx` — `imagesUnlocked = true`, drop copy-locked branch, single send button gated on `imagesComplete`, update banners/labels.
- `src/components/social/ContentGenerationTab.tsx` — collapse "Send copy" / "Send final" buttons into one; update status priority + badge labels.
- `src/components/social/ClientContentReview.tsx` — show only final-review actionable state; update labels and the intermediate "copy approved" card.
- `src/components/social/ClientContentCalendar.tsx`, `ClientPostsTab.tsx`, `overview/*SocialOverview.tsx`, `dashboard/AdminDashboard.tsx`, `notifications/NotificationBell.tsx`, `hooks/usePendingCounts.ts` — audit copy-stage status checks; treat them as legacy-only (no new emissions) and update any user-facing wording.
- `supabase/functions/notify-content-approval/index.ts` — default `stage` to `"final"`.
- `supabase/functions/auto-approve-posts/index.ts` — leave Part 3a in place as a safety net for legacy rows; add a comment noting it's deprecated.

## Out of scope

- No DB schema migration (status enum/values stay the same; we just stop producing the intermediate ones).
- No changes to GBP posts, blog, or any other department.
- No changes to the 5-day auto-approval window — it just collapses from two windows to one.
