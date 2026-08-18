-- 1) Throttle chatty schedules
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'auto-approve-content-requests-15min'),
  schedule => '0 * * * *'
);

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'gsc-sync-worker'),
  schedule => '10,40 * * * *'
);

-- 2) Tighter GSC detail retention: country rows age out at 90 days,
--    every other non-total bucket at 180 days, totals are kept forever.
CREATE OR REPLACE FUNCTION public.prune_gsc_detail(_keep_days integer DEFAULT 180)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted integer := 0;
  _n integer := 0;
BEGIN
  DELETE FROM public.clinic_gsc_daily
  WHERE bucket_type = 'country'
    AND date < (CURRENT_DATE - LEAST(_keep_days, 90));
  GET DIAGNOSTICS _n = ROW_COUNT;
  _deleted := _deleted + _n;

  DELETE FROM public.clinic_gsc_daily
  WHERE bucket_type NOT IN ('total', 'country')
    AND date < (CURRENT_DATE - _keep_days);
  GET DIAGNOSTICS _n = ROW_COUNT;
  _deleted := _deleted + _n;

  RETURN _deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_gsc_detail(integer) FROM PUBLIC, anon, authenticated;

-- 3) Retention for the remaining append-only operational tables
CREATE OR REPLACE FUNCTION public.prune_ops_tables()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted integer := 0;
  _n integer := 0;
BEGIN
  DELETE FROM public.tracking_events WHERE created_at < now() - interval '180 days';
  GET DIAGNOSTICS _n = ROW_COUNT;
  _deleted := _deleted + _n;

  DELETE FROM public.analytics WHERE recorded_at < now() - interval '400 days';
  GET DIAGNOSTICS _n = ROW_COUNT;
  _deleted := _deleted + _n;

  DELETE FROM public.auth_error_logs WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS _n = ROW_COUNT;
  _deleted := _deleted + _n;

  RETURN _deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_ops_tables() FROM PUBLIC, anon, authenticated;

-- 4) Nightly maintenance now runs all three passes
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'db-maintenance-nightly'),
  command => $cmd$
    SELECT public.rollup_website_pageviews(90);
    SELECT public.prune_gsc_detail(180);
    SELECT public.prune_ops_tables();
  $cmd$
);
