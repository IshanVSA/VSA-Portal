
What’s happening now

- The latest Alma run is not just “slow”.
- The logs show the worker did start and got through:
  - Researcher in about 9s
  - Planner in about 44s
  - Writer in about 78s
  - then it started Art Director
- Right after that, the worker shuts down before finishing the remaining 5 agents.
- So the real issue is still edge-function runtime length. Even with the queue/worker setup, one worker run is still trying to complete the full 8-agent pipeline in a single invocation.

Why it still says “Pipeline Running”

- The row stays in `processing` after the worker is killed mid-run.
- The cron keeps waking the worker, but the job does not complete because each retry hits the same runtime ceiling.
- The UI label is technically reflecting the DB status, but the backend job is effectively timing out, not actively progressing.

Why it feels long

- The first 3 agents alone already take about 130 seconds.
- There are 5 more agents after that.
- The current UI message saying “usually takes 2-5 minutes” is too optimistic for this pipeline.

Plan to fix it properly

1. Make SM2 resumable by stage
- Refactor `sm2-worker` so one invocation handles only a small part of the pipeline, not all 8 agents.
- Persist intermediate outputs after each stage: research, plan, write, art, stories, concierge, fact check, review.
- Store the current stage on the `sm2_generations` row and resume from the next stage on the next cron tick.

2. Add stage-tracking fields in the database
- Add fields like:
  - `pipeline_stage`
  - `pipeline_data` JSONB for intermediate agent outputs
  - optional `stage_started_at` / `stage_completed_at`
- This avoids losing progress when the worker shuts down.

3. Update worker logic
- Pick one due job
- Run only the next unfinished stage
- Save output immediately
- Requeue the row for the next tick until final HTML assembly is complete
- Mark `pending` only after final upload succeeds

4. Improve stalled-job recovery
- If a stage sits in `processing` too long, mark it retryable from the same stage instead of restarting the entire pipeline.
- Keep failure reasons human-readable.

5. Fix the UI messaging
- Change “2-5 minutes” to a more realistic queued/background message
- Show the current stage in the status area, for example:
  - Running: Research
  - Running: Writing
  - Running: Art Direction
- Show “last updated” or retry info so it doesn’t look frozen

6. Verify end-to-end
- Re-run Alma
- Confirm the job moves stage-by-stage across multiple worker ticks
- Confirm it no longer gets stuck forever on “Pipeline Running”
- Confirm final HTML is generated and visible in the history card

Files likely involved

- `supabase/functions/sm2-worker/index.ts`
- `supabase/functions/generate-sm2-content/index.ts`
- `src/hooks/useSM2Generation.ts`
- `src/components/social/ContentGenerationTab.tsx`
- new migration for SM2 stage persistence

Technical note

- The queue architecture was a good first step, but the worker still does too much in one run.
- The durable fix is not “wait longer”, it is “persist after each agent and resume on the next tick”.
