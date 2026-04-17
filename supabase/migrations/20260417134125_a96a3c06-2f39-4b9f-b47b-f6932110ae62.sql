-- Add retry/queue tracking fields to sm2_generations
ALTER TABLE public.sm2_generations
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

-- Index for efficient worker queue lookups (active jobs only)
CREATE INDEX IF NOT EXISTS idx_sm2_generations_queue
  ON public.sm2_generations (created_at)
  WHERE approval_status IN ('queued', 'retrying', 'processing');

-- Schedule sm2-worker to run every minute (mirrors blog-worker pattern)
SELECT cron.unschedule('sm2-worker-tick') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'sm2-worker-tick'
);

SELECT cron.schedule(
  'sm2-worker-tick',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://yuyossgquiyuoqbeenri.supabase.co/functions/v1/sm2-worker',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1eW9zc2dxdWl5dW9xYmVlbnJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNjMwODksImV4cCI6MjA4NjgzOTA4OX0.EGwUbBiZSLKFyZEKUDPIF9xm41t1QRjOcQ6_v4lxgs0"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- One-time cleanup: mark stuck "processing" SM2 jobs (>10min) as failed so users can retry
UPDATE public.sm2_generations
SET approval_status = 'generation_failed',
    failure_reason = 'Generation interrupted before completion. Please retry.',
    updated_at = now()
WHERE approval_status = 'processing'
  AND (last_attempt_at IS NULL OR last_attempt_at < now() - interval '10 minutes')
  AND created_at < now() - interval '10 minutes';