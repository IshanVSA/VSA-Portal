SELECT cron.schedule(
  'google-ads-daily-sync',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://yuyossgquiyuoqbeenri.supabase.co/functions/v1/google-ads-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret', true)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);