

## Plan: Add Regenerate After Feedback + Manual HTML Editor

### What Changes

**1. Regenerate button when feedback is submitted**

In `ContentGenerationTab.tsx`, add a "Regenerate" button next to any generation with `approval_status === "feedback_submitted"`. Clicking it opens the same pre-generation dialog and triggers a new generation for that month (the edge function already handles overwriting the same month).

**2. Manual HTML editor for admin/concierge**

Add an "Edit Content" button (next to "View Content") that opens a full-screen dialog with a code editor (`<textarea>`) pre-loaded with the fetched HTML. On save, it uploads the modified HTML back to the same storage path, overwriting the previous version. This gives staff full manual control over the final output.

### Technical Details

**File: `src/components/social/ContentGenerationTab.tsx`**

- In the generation history card, after the feedback display block, add a "Regenerate" button when `gen.approval_status === "feedback_submitted"`. This button opens the preflight dialog and calls `generate.mutate(gen.month_year)`.
- Add an "Edit Content" button (pencil icon) next to the Eye button for any generation with `html_file_path`. This opens a new `HtmlEditorDialog` component.

**New component: `HtmlEditorDialog` (inline in same file)**

- Fetches HTML from storage, displays in a `<textarea>` (monospace, full height).
- Side-by-side or tabbed layout: edit on left, live preview iframe on right.
- "Save" button uploads the edited HTML to the same `filePath` in `department-files` bucket using `supabase.storage.from("department-files").upload(filePath, blob, { upsert: true })`.
- After save, invalidates the SM2 generations query and shows a success toast.

**File: `src/hooks/useSM2Generation.ts`**

- No changes needed. The `generate` mutation already accepts any month string, so re-generating after feedback works with existing logic.

**Edge function**: No changes. The `generate-sm2-content` function already handles re-generation for an existing month by overwriting the storage file and updating the database row.

### Summary

- 2 UI additions in `ContentGenerationTab.tsx`: Regenerate button + Edit Content dialog
- No backend/database changes required

