
Goal: fix the SM2 generation flow so Alma Animal Hospital does not get stuck on "Pipeline Running..." again.

What I found
- The current `generate-sm2-content` function still runs the full 8-agent SM2 pipeline inside a single edge function request and only tries to keep it alive with `EdgeRuntime.waitUntil`.
- The logs already show why this is failing: the pipeline starts, completes Researcher, Planner, and Writer, begins Art Director, then the function shuts down before the remaining agents finish.
- That means the previous patch improved registration, but it did not solve the architectural problem: the SM2 run is too long for a single edge-function lifecycle.
- Blog generation in this project already uses the durable pattern we need: queue job -> cron worker picks it up -> retries/backoff -> clear status updates.

Implementation plan

1. Convert SM2 to a durable queued worker flow
- Keep `generate-sm2-content` as the starter function only.
- Change it to:
  - validate auth and prerequisites
  - block duplicate active runs for the same clinic/month
  - create an `sm2_generations` row in an active queue state like `queued`
  - return `202` immediately with the generation ID
- Move the actual 8-agent pipeline execution into a dedicated worker edge function, following the existing `blog-worker` architecture.

2. Add worker-friendly SM2 job state tracking
- Extend `sm2_generations` with retry/attempt fields similar to blog jobs:
  - `retry_count`
  - `next_retry_at`
  - `last_attempt_at`
- Use `approval_status` values consistently for active and terminal states:
  - `queued`
  - `processing`
  - `retrying`
  - `pending`
  - `generation_failed`
  - existing approval states remain unchanged after generation completes
- Add an index for active queue lookups so the worker can efficiently pick the next due job.

3. Create an `sm2-worker` edge function
- Worker behavior:
  - pick one due SM2 job in `queued` or `retrying`
  - mark it `processing`
  - run the existing 8-agent pipeline
  - upload the HTML deliverable
  - update the row to `pending` on success
  - write human-readable `failure_reason` on failure
- Add retry logic for transient Anthropic/provider failures using the same style as `blog-worker`:
  - 429 / 5xx / 529 / overloaded / timeout
  - exponential backoff
  - terminal fail after max retries

4. Schedule the worker
- Add a scheduled invocation for `sm2-worker`, mirroring the existing `blog-worker` cron pattern.
- This ensures stuck generations are no longer dependent on the original browser-triggered request staying alive.

5. Improve the Social Media UI so status is trustworthy
- Update `useSM2Generation` to support the new active states:
  - `queued`
  - `processing`
  - `retrying`
- Add automatic refetch while any generation is active, so the page updates even after refresh or if the original mutation poll stops.
- Improve polling/toasts so they surface real `failure_reason` text instead of generic "Please try again."
- Update `ContentGenerationTab` status badges/labels for the new lifecycle, for example:
  - Queued
  - Pipeline Running
  - Retrying
  - Generation Failed

6. Prevent duplicate runs
- Add a server-side check in the starter function so clicking Generate again cannot create multiple active SM2 jobs for the same clinic and month.
- Return the existing job ID/status if one is already active.

7. Clean up currently stuck records
- Run a one-time database cleanup for stale `processing` SM2 rows, including Alma's stuck run, so they become retryable/failed instead of hanging forever in the UI.
- I will make the message user-friendly, such as "Generation interrupted before completion. Please retry."

Files likely involved
- `supabase/functions/generate-sm2-content/index.ts`
- new `supabase/functions/sm2-worker/index.ts`
- one or more `supabase/migrations/*.sql` files for SM2 retry fields/indexes
- scheduled worker invocation setup
- `src/hooks/useSM2Generation.ts`
- `src/components/social/ContentGenerationTab.tsx`

Verification
- Trigger generation for Alma again.
- Confirm status moves through queued/processing and no longer stays permanently on "Pipeline Running...".
- Confirm successful run reaches `pending` with HTML file path populated.
- Confirm transient failures move to `retrying`, then either recover or end in `generation_failed` with a visible failure reason.
- Confirm page refresh still shows live status updates.
- Confirm duplicate clicks do not create duplicate active jobs.

Technical note
- This is not a small bug in polling or labels. The logs indicate a true execution-lifecycle problem: the SM2 pipeline is simply too long to be safely completed inside one edge function request. The durable worker pattern is the correct fix for this codebase because it already exists here for blog generation and matches the project’s current conventions.
