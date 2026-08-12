select cron.unschedule('ga4-evening-catchup');
select cron.unschedule('sync-gsc-evening-catchup');
select cron.unschedule('ga4-daily-sync');
select cron.unschedule('sync-gsc-daily');

select cron.schedule(
  'ga4-sync-worker',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://yuyossgquiyuoqbeenri.supabase.co/functions/v1/ga4-cron',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1eW9zc2dxdWl5dW9xYmVlbnJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNjMwODksImV4cCI6MjA4NjgzOTA4OX0.EGwUbBiZSLKFyZEKUDPIF9xm41t1QRjOcQ6_v4lxgs0"}'::jsonb,
    body := '{"source":"cron"}'::jsonb
  ) AS request_id;
  $$
);

select cron.schedule(
  'gsc-sync-worker',
  '5,20,35,50 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://yuyossgquiyuoqbeenri.supabase.co/functions/v1/gsc-cron',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl1eW9zc2dxdWl5dW9xYmVlbnJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNjMwODksImV4cCI6MjA4NjgzOTA4OX0.EGwUbBiZSLKFyZEKUDPIF9xm41t1QRjOcQ6_v4lxgs0"}'::jsonb,
    body := '{"source":"cron"}'::jsonb
  ) AS request_id;
  $$
);