
Do I know what the issue is? Yes.

What I confirmed
- The frontend is successfully starting the job. The latest browser request to `generate-blog-batch` returned `202 Accepted` with `post_id = 6a99ba89-1324-4f29-a96f-ea737e861a27`.
- The failure happens after that, inside background processing.
- The live `generate-blog-batch` logs show repeated Anthropic failures:
  - retry 2/4
  - retry 3/4
  - retry 4/4
  - final error: `Anthropic API error: 529 ... overloaded_error`
- The matching `blog_posts` row ended as:
  - `generation_status = failed`
  - `qa_status = PENDING`
  - `raw_output_text = null`
- That means no blog content was produced at all. This is not a clinic-settings issue, SEO toggle issue, or prompt lookup issue.
- Anthropic’s docs define `529 overloaded_error` as a temporary API overload.

Why it is failing
- The current function already retries, but only 4 times over a short window.
- If Anthropic stays overloaded through those retries, the code marks the job as `failed`.
- The app does not store or show the real failure reason on `blog_posts`, so the UI only says “Blog generation failed”.
- Because the function returns `202` first and then works in the background, the user sees a generic failure later without knowing it was provider overload.

What will actually solve it
1. Immediate workaround
- Wait a few minutes and retry. Right now the concrete cause is Anthropic overload, not bad input.

2. Proper product fix
- Make blog generation durable instead of “try a few times, then fail forever”.
- Reuse `blog_posts` as the job record and add retry metadata:
  - `failure_reason`
  - `retry_count`
  - `next_retry_at`
  - `last_attempt_at`
- On retryable AI errors (`429`, `500`, `502`, `503`, `504`, `529`):
  - do not mark the row as final `failed`
  - set it to `retrying`
  - save a readable reason like: `Anthropic API is temporarily overloaded. Auto-retrying.`
- Only mark `failed` after all scheduled retries are exhausted.

3. Add a durable worker
- Keep `generate-blog-batch` as the starter function that validates input and creates the `blog_posts` row.
- Move the actual generation logic into a reusable processor function.
- Add a cron-driven worker edge function that picks up `pending` / `retrying` blog rows and processes them every few minutes.
- This fits the project’s existing pattern because `pg_cron` / `pg_net` are already enabled and cron-invoked edge functions already exist.

4. Improve the UI
- Update `useBlogPosts.ts` and `BlogTab.tsx` to show:
  - `processing`
  - `retrying`
  - `failed` with real reason
- Replace the current fixed 5-minute polling assumption with status-aware refreshing.
- Optional: block new blog generations while one for the same clinic is already `pending`, `processing`, or `retrying`.

Important technical note
- Increasing retries alone may help a little, but it is not the real fix.
- A larger retry count inside one edge runtime still leaves you exposed to provider instability and runtime limits.
- Durable queued retries are the reliable solution.

Files to update if approved
- `supabase/functions/generate-blog-batch/index.ts`
- new worker edge function for queued blog retries
- `src/hooks/useBlogPosts.ts`
- `src/components/seo/blog/BlogTab.tsx`
- new Supabase migration for retry/failure columns and cron scheduling

Validation after implementation
- Start a blog generation and confirm it still returns `202`
- If Anthropic overload happens, confirm the row becomes `retrying` instead of immediately `failed`
- Confirm the UI shows the real reason
- Confirm the cron worker retries automatically and eventually ends as `completed` or a final readable `failed`
