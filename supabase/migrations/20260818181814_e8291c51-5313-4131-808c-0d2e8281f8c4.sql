-- 1. Rollup table for old pageviews
CREATE TABLE IF NOT EXISTS public.website_pageviews_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  day date NOT NULL,
  path text NOT NULL DEFAULT '',
  country_code text,
  region text,
  views integer NOT NULL DEFAULT 0,
  sessions integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS website_pageviews_daily_uniq
  ON public.website_pageviews_daily (clinic_id, day, path, COALESCE(country_code,''), COALESCE(region,''));
CREATE INDEX IF NOT EXISTS website_pageviews_daily_clinic_day
  ON public.website_pageviews_daily (clinic_id, day DESC);

GRANT SELECT ON public.website_pageviews_daily TO authenticated;
GRANT ALL ON public.website_pageviews_daily TO service_role;

ALTER TABLE public.website_pageviews_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff and clinic users can read pageview rollups"
ON public.website_pageviews_daily
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  OR clinic_id IN (SELECT public.get_accessible_clinic_ids(auth.uid()))
);

-- 2. Helper index for time-based pruning
CREATE INDEX IF NOT EXISTS website_pageviews_created_at_idx
  ON public.website_pageviews (created_at);
CREATE INDEX IF NOT EXISTS clinic_gsc_daily_date_bucket_idx
  ON public.clinic_gsc_daily (date, bucket_type);

-- 3. Rollup function
CREATE OR REPLACE FUNCTION public.rollup_website_pageviews(_older_than_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cutoff timestamptz := now() - make_interval(days => _older_than_days);
  _moved integer := 0;
BEGIN
  INSERT INTO public.website_pageviews_daily (clinic_id, day, path, country_code, region, views, sessions)
  SELECT clinic_id,
         (created_at AT TIME ZONE 'UTC')::date AS day,
         COALESCE(path, ''),
         country_code,
         region,
         COUNT(*)::int,
         COUNT(DISTINCT session_id)::int
  FROM public.website_pageviews
  WHERE created_at < _cutoff
  GROUP BY 1,2,3,4,5
  ON CONFLICT (clinic_id, day, path, COALESCE(country_code,''), COALESCE(region,''))
  DO UPDATE SET views = public.website_pageviews_daily.views + EXCLUDED.views,
                sessions = GREATEST(public.website_pageviews_daily.sessions, EXCLUDED.sessions);

  DELETE FROM public.website_pageviews WHERE created_at < _cutoff;
  GET DIAGNOSTICS _moved = ROW_COUNT;
  RETURN _moved;
END;
$$;

REVOKE ALL ON FUNCTION public.rollup_website_pageviews(integer) FROM PUBLIC, anon, authenticated;

-- 4. GSC detail pruning (keeps 'total' buckets forever)
CREATE OR REPLACE FUNCTION public.prune_gsc_detail(_keep_days integer DEFAULT 180)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _deleted integer := 0;
BEGIN
  DELETE FROM public.clinic_gsc_daily
  WHERE bucket_type <> 'total'
    AND date < (current_date - _keep_days);
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_gsc_detail(integer) FROM PUBLIC, anon, authenticated;

-- 5. Throttle hot workers
SELECT cron.alter_job(14, schedule => '*/5 * * * *');
SELECT cron.alter_job(11, schedule => '*/10 * * * *');

-- 6. Nightly maintenance job (pure SQL, no secrets)
SELECT cron.unschedule('db-maintenance-nightly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'db-maintenance-nightly');

SELECT cron.schedule(
  'db-maintenance-nightly',
  '30 3 * * *',
  $$SELECT public.rollup_website_pageviews(90); SELECT public.prune_gsc_detail(180);$$
);