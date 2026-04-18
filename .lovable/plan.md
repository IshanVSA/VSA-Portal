

## Plan: Enrich PostDayDialog to match the full HTML view

The calendar popup currently shows only basic fields (single hook, caption, hashtags, CTA, compliance flag). Image 2 shows the full deliverable: post #, theme badges, PASS status, **Hook A + Hook B**, **topic/title**, full caption, hashtags, and collapsible **Art Direction**, **Stories (5 frames)**, **Concierge Brief** sections. We need to (a) persist the missing fields on `sm2_posts`, (b) populate them in the worker, and (c) render them in `PostDayDialog`.

### 1. DB migration — add columns to `sm2_posts`

Nullable, backwards-compatible:
- `post_number int` (the #1, #2 badge)
- `topic text` (the bold title "Cherry blossom season pet safety…")
- `hook_b text` (second hook)
- `status text` (PASS / FLAG / FAIL from fact-check)
- `art_direction jsonb` (concept, layout, type, colour, texture, neg, dimensions, frames, transitions)
- `stories jsonb` (array of frame objects: type, visual, sticker)
- `concierge_brief jsonb` (engagement triggers, response examples, posting time, boost notes — whatever the concierge agent emits per-post)

### 2. Worker — populate the new columns

In `supabase/functions/sm2-worker/index.ts` `assemble` stage (around line 504), extend the row mapping to also pull from `arts[i]`, `storiesPosts[i]`, `conciergePosts[i]`, `factChecks[i]`:
- `post_number: i + 1`
- `topic: p.topic`
- `hook_b: w.hook_b || p.hook_b_direction`
- `status: factChecks[i]?.status || "PASS"`
- `art_direction: arts[i]` (whole object)
- `stories: storiesPosts[i]?.frames || storiesPosts[i]` (frames array)
- `concierge_brief: conciergePosts[i]`

### 3. Hook — extend `SM2Post` type

Add the new optional fields to `SM2Post` interface in `src/hooks/useSM2Posts.ts`. Also update `src/integrations/supabase/types.ts` (auto-managed; will refresh on migration).

### 4. UI — rewrite `PostDayDialog` post card

Match image 2 layout. New card structure (per post, image slot stays on the left as today):

```
#1  [Educational] [Educational carousel] [PASS]    ← header row
Cherry blossom season pet safety in Vancouver parks ← topic, bold

┌─ Hook A: ...                                   ┐
└─ Hook B: ...                                   ┘

Caption (full multi-paragraph, whitespace-pre-wrap)

#hashtag #hashtag ...   (primary-tinted)

▸ Art Direction          (collapsible, shows concept/layout/type/colour/texture/neg/dimensions, plus frames & transitions for reels)
▸ Stories (5)            (collapsible, lists each frame: type · visual · sticker)
▸ Concierge Brief        (collapsible, shows engagement triggers, posting time, boost notes)

CTA: ...
⚠ compliance_notes (if any)
```

Use `Collapsible` from `@/components/ui/collapsible` (already in project) for the three expandable sections. Status badge color: green for PASS, amber for FLAG, red for FAIL. Keep client-feedback textarea & image-upload slot exactly as today.

### 5. Backwards compatibility

Existing generations only have the basic fields populated — collapsible sections simply won't render when the jsonb is null. No backfill needed; new generations will have everything.

### Files touched

- **Migration**: add 7 nullable columns to `sm2_posts`.
- `supabase/functions/sm2-worker/index.ts` — extend the row mapping in the assemble stage.
- `src/hooks/useSM2Posts.ts` — extend `SM2Post` interface.
- `src/components/social/PostDayDialog.tsx` — rewrite post card with the new sections.

