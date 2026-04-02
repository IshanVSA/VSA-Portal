
-- Enable extensions if not already
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Schedule the monthly GBP batch queue generation on the 1st at 5:00 AM UTC
SELECT cron.schedule(
  'gbp-monthly-batch-queue',
  '0 5 1 * *',
  $$
  SELECT net.http_post(
    url := 'https://yuyossgquiyuoqbeenri.supabase.co/functions/v1/generate-batch-queue',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer a3f8c2e71d4b9065af2318ec7d5042b1f69a8c3e27d14b05af9823ec7d506142"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
