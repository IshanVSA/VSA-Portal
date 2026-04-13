ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_blog_posts_retryable
  ON public.blog_posts (generation_status, next_retry_at)
  WHERE generation_status IN ('pending', 'retrying');