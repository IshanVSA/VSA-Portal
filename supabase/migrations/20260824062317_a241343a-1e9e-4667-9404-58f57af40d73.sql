DO $$
DECLARE
  v_secret text := 'a3f8c2e71d4b9065af2318ec7d5042b1f69a8c3e27d14b05af9823ec7d506142';
  v_base text := 'https://yuyossgquiyuoqbeenri.supabase.co/functions/v1/';
BEGIN
  PERFORM cron.alter_job(
    (SELECT jobid FROM cron.job WHERE jobname = 'ga4-sync-worker'),
    command := format($cmd$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{"source":"cron"}'::jsonb) AS request_id;$cmd$,
      v_base || 'ga4-cron',
      json_build_object('Content-Type','application/json','x-cron-secret', v_secret, 'Authorization','Bearer ' || v_secret)::text)
  );

  PERFORM cron.alter_job(
    (SELECT jobid FROM cron.job WHERE jobname = 'gsc-sync-worker'),
    command := format($cmd$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{"source":"cron"}'::jsonb) AS request_id;$cmd$,
      v_base || 'gsc-cron',
      json_build_object('Content-Type','application/json','x-cron-secret', v_secret, 'Authorization','Bearer ' || v_secret)::text)
  );

  PERFORM cron.alter_job(
    (SELECT jobid FROM cron.job WHERE jobname = 'google-ads-daily-sync'),
    command := format($cmd$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb) AS request_id;$cmd$,
      v_base || 'google-ads-cron',
      json_build_object('Content-Type','application/json','x-cron-secret', v_secret, 'Authorization','Bearer ' || v_secret)::text)
  );

  PERFORM cron.alter_job(
    (SELECT jobid FROM cron.job WHERE jobname = 'meta-analytics-daily-sync'),
    command := format($cmd$SELECT net.http_post(url := %L, headers := %L::jsonb, body := jsonb_build_object('scheduled_at', now())) AS request_id;$cmd$,
      v_base || 'meta-analytics-cron',
      json_build_object('Content-Type','application/json','x-cron-secret', v_secret, 'Authorization','Bearer ' || v_secret)::text)
  );
END $$;