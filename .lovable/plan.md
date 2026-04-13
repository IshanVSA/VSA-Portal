

## Plan: Process Blog Jobs One at a Time to Avoid Overload

### Problem
The blog-worker currently picks up 3 jobs per run and processes them sequentially in a single edge function invocation. This concentrates multiple large Anthropic API calls into one execution window, increasing the chance of hitting overload (529) errors.

### Solution
Process only 1 job per worker invocation. Since the cron runs every 3 minutes, jobs still get processed promptly, but the load is spread out over time instead of batched.

### Changes

**1. `supabase/functions/blog-worker/index.ts`**
- Change `.limit(3)` to `.limit(1)` on line 278
- Remove the `for` loop -- process the single job directly
- This means each 3-minute cron tick handles at most 1 Anthropic call

**2. `supabase/config.toml`**
- Add entries for `blog-worker` and `generate-blog-batch` with `verify_jwt = false` so the cron job can reliably invoke them

### What stays the same
- All retry logic, exponential backoff, and status tracking remain unchanged
- The UI auto-refresh and status display remain unchanged
- If multiple jobs are queued, they process one per cron tick (every 3 minutes apart)

