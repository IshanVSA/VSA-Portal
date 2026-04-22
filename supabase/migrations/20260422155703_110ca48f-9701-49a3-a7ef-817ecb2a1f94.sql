-- Ensure pg_cron and pg_net extensions are enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove existing schedule if any (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('meta-analytics-daily-sync');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Schedule Meta analytics sync daily at 07:30 UTC
SELECT cron.schedule(
  'meta-analytics-daily-sync',
  '30 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://yuyossgquiyuoqbeenri.supabase.co/functions/v1/meta-analytics-cron',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1eW9zc2dxdWl5dW9xYmVlbnJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNjMwODksImV4cCI6MjA4NjgzOTA4OX0.EGwUbBiZSLKFyZEKUDPIF9xm41t1QRjOcQ6_v4lxgs0"}'::jsonb,
    body := jsonb_build_object('scheduled_at', now())
  ) AS request_id;
  $$
);