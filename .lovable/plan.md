# Add Month Selector + Always-Visible Calendar in SM2 Generation Tab

## Why the calendar is missing today
`useSM2Generation` hardcodes `currentMonth` to the **next** calendar month (May 2026). The Generation tab only renders the calendar when there is a generation matching that month. Alma's existing generation is for **April 2026** with 10 posts already in `sm2_posts`, so `currentGeneration` is `null` and the calendar block is skipped — the April generation only shows up as a row in "Generation History" at the bottom.

## Changes

All edits in **`src/components/social/ContentGenerationTab.tsx`** (no DB / edge function changes).

### 1. Month picker in the Pre-Generation dialog
- Add a `targetMonth` state (`YYYY-MM`), defaulting to next month.
- Build a list of selectable months: current month + next 6.
- Render a labeled `Select` ("Target Month") at the top of the dialog body with the option list above. Update the dialog title and the `monthLabel` shown in the header to use `targetMonth`.
- Pass `targetMonth` into `useMonthlySignals(clinicId, targetMonth)` so the holiday/signals preview reflects the chosen month.
- `handleGenerate` calls `generate.mutate(targetMonth)` (instead of `currentMonth`).

### 2. Calendar that follows the selected generation
- Add `viewingGenerationId` state in the component.
- Compute `selectedGen` as:
  1. The generation whose `id === viewingGenerationId`, else
  2. `currentGeneration` (next month) if present, else
  3. `generations[0]` (most recent).
- Always render the calendar `Card`. Inside:
  - If `selectedGen` is in `queued/processing/retrying/generation_failed` → show a small status banner ("Pipeline running…" / failure reason) inside the card.
  - Else render `<SM2CalendarView />` with `selectedGen`.
  - If no generation exists at all → empty state "Generate content for a month to see the calendar here."
- Add a compact month switcher above the calendar (chevrons + dropdown listing all generations by `month_year`) that updates `viewingGenerationId`.

### 3. Auto-select on completion + clickable history rows
- When `generate.mutate` succeeds, set `viewingGenerationId` to the new generation id so the calendar swaps automatically once polling reports `pending`.
- Make each row in "Generation History" clickable — clicking sets `viewingGenerationId` and scrolls the calendar card into view.

## Out of scope
- No backend or schema changes. The `generate-sm2-content` edge function already accepts an arbitrary `month_year` payload.
- No changes to `SM2CalendarView`, `useSM2Generation`, or RLS.

## Files
- `src/components/social/ContentGenerationTab.tsx` (edit)
