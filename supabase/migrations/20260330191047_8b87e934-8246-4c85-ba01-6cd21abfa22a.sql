SELECT cron.unschedule('google-ads-daily-sync');

SELECT cron.schedule(
  'google-ads-daily-sync',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://yuyossgquiyuoqbeenri.supabase.co/functions/v1/google-ads-cron',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1eW9zc2dxdWl5dW9xYmVlbnJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNjMwODksImV4cCI6MjA4NjgzOTA4OX0.EGwUbBiZSLKFyZEKUDPIF9xm41t1QRjOcQ6_v4lxgs0"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);