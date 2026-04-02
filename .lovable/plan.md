

## Plan: Make Batch Queue Month-Independent

### Problem
Batches are currently stored with a specific `month` and `year`, so only April 2026 shows data. The user wants the batch structure to be permanent — it reflects cluster groupings, not monthly cycles.

### Approach
Remove the month/year dependency from the batch system entirely. Batches represent cluster groupings and should persist until clinics are added/removed.

### Changes

**1. Database Migration**
- Drop `month` and `year` columns from `gbp_batches` table
- Add a unique constraint on `cluster_id` (and null for solo batches) to prevent duplicates
- Update existing rows (they already have the right structure, just drop the month/year columns)

**2. `src/hooks/useGBPBatches.ts`**
- Remove `month` and `year` parameters from `useGBPBatches`
- Query `gbp_batches` without month/year filters — just `select(*).order("batch_number")`
- Remove month/year from `generateQueue` mutation body
- Update query keys to remove month/year

**3. `src/components/seo/gbp/BatchQueue.tsx`**
- Remove the Month and Year selectors entirely from the Batch Queue UI
- Remove `selectedMonth` / `selectedYear` state
- The post count query still needs month/year context — keep a month/year selector only for the "generated posts" count display, or remove post counts from batch queue
- Update the "no batches" empty state messaging

**4. `supabase/functions/generate-batch-queue/index.ts`**
- Remove month/year from the insert payload
- Remove the "already exists for this month/year" check — instead check if batches exist at all
- Add logic: if batches already exist, compare current clinic configs against existing batches and rebuild only if clinics changed (or provide a "Regenerate" option)
- Remove month/year from the duplicate check; use a simple "batches exist" check with option to force-regenerate

**5. `supabase/functions/run-collision-check/index.ts`**
- Update any references that join on batch month/year to just use batch_id directly (likely already fine)

### Summary
- Batches become a permanent representation of cluster groupings
- Month/Year selectors removed from Batch Queue
- Generate Queue becomes "Generate/Regenerate Batches" (one-time setup that updates when clinics change)
- Post generation and history remain month-specific (separate concern)

