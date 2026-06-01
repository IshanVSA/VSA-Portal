SELECT cron.unschedule('ga4-daily-sync') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ga4-daily-sync');

SELECT cron.schedule(
  'ga4-daily-sync',
  '30 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://yuyossgquiyuoqbeenri.supabase.co/functions/v1/ga4-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret', true),
      'x-cron-secret', current_setting('app.settings.cron_secret', true)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);