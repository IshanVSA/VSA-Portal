SELECT cron.unschedule('sm2-worker-tick');

SELECT cron.schedule(
  'sm2-worker-tick',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://yuyossgquiyuoqbeenri.supabase.co/functions/v1/sm2-worker',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer a3f8c2e71d4b9065af2318ec7d5042b1f69a8c3e27d14b05af9823ec7d506142"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

UPDATE sm2_generations
SET last_attempt_at = now() - interval '1 hour',
    updated_at = now()
WHERE approval_status = 'processing'
  AND pipeline_stage <> 'completed'
  AND last_attempt_at < now() - interval '10 minutes';