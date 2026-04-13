SELECT cron.schedule(
  'blog-worker-every-3min',
  '*/3 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://yuyossgquiyuoqbeenri.supabase.co/functions/v1/blog-worker',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer a3f8c2e71d4b9065af2318ec7d5042b1f69a8c3e27d14b05af9823ec7d506142"}'::jsonb,
    body := '{"time": "now"}'::jsonb
  ) AS request_id;
  $$
);