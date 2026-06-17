
CREATE OR REPLACE FUNCTION public.get_website_analytics(
  _clinic_id uuid,
  _from timestamptz,
  _to timestamptz,
  _timezone text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  _tz text := COALESCE(_timezone, 'UTC');
  _from_key date;
  _to_key date;
  _mid_key date;
  _result jsonb;
BEGIN
  -- Validate timezone; fall back to UTC if invalid
  BEGIN
    PERFORM now() AT TIME ZONE _tz;
  EXCEPTION WHEN OTHERS THEN
    _tz := 'UTC';
  END;

  _from_key := (_from AT TIME ZONE _tz)::date;
  _to_key := (_to AT TIME ZONE _tz)::date;
  _mid_key := _from_key + ((_to_key - _from_key) / 2);

  WITH base AS (
    SELECT
      session_id,
      path,
      created_at,
      country_code,
      region,
      ((created_at AT TIME ZONE _tz)::date) AS dkey,
      EXTRACT(HOUR FROM (created_at AT TIME ZONE _tz))::int AS hr
    FROM public.website_pageviews
    WHERE clinic_id = _clinic_id
      AND created_at >= (_from_key::timestamp AT TIME ZONE _tz)
      AND created_at <  ((_to_key + 1)::timestamp AT TIME ZONE _tz)
  ),
  -- Session aggregates over the full period
  sess AS (
    SELECT
      session_id,
      COUNT(*) AS pv_count,
      MIN(created_at) AS first_at,
      MAX(created_at) AS last_at,
      MIN(dkey) AS first_dkey
    FROM base
    GROUP BY session_id
  ),
  sess_metrics AS (
    SELECT
      session_id,
      pv_count,
      first_dkey,
      LEAST(EXTRACT(EPOCH FROM (last_at - first_at))::int, 900) AS dur_sec,
      (pv_count > 1) AS engaged
    FROM sess
  ),
  -- KPIs for current half (>= mid) and previous half (< mid)
  kpi AS (
    SELECT
      COUNT(*) FILTER (WHERE first_dkey >= _mid_key) AS cur_sessions,
      COUNT(*) FILTER (WHERE first_dkey <  _mid_key) AS prev_sessions,
      COUNT(*) FILTER (WHERE first_dkey >= _mid_key AND engaged) AS cur_engaged,
      COUNT(*) FILTER (WHERE first_dkey <  _mid_key AND engaged) AS prev_engaged,
      COALESCE(AVG(dur_sec) FILTER (WHERE first_dkey >= _mid_key AND engaged), 0)::int AS cur_avg_dur,
      COALESCE(AVG(dur_sec) FILTER (WHERE first_dkey <  _mid_key AND engaged), 0)::int AS prev_avg_dur,
      SUM(pv_count) FILTER (WHERE first_dkey >= _mid_key) AS cur_views,
      SUM(pv_count) FILTER (WHERE first_dkey <  _mid_key) AS prev_views
    FROM sess_metrics
  ),
  daily AS (
    SELECT dkey, COUNT(*) AS views
    FROM base
    GROUP BY dkey
  ),
  daily_series AS (
    SELECT d::date AS dkey
    FROM generate_series(_from_key, _to_key, '1 day') d
  ),
  daily_full AS (
    SELECT ds.dkey, COALESCE(daily.views, 0) AS views
    FROM daily_series ds
    LEFT JOIN daily USING (dkey)
    ORDER BY ds.dkey
  ),
  hourly AS (
    SELECT hr, COUNT(*) AS views
    FROM base
    GROUP BY hr
  ),
  hourly_series AS (
    SELECT h AS hr FROM generate_series(0, 23) h
  ),
  hourly_full AS (
    SELECT hs.hr, COALESCE(hourly.views, 0) AS views
    FROM hourly_series hs
    LEFT JOIN hourly USING (hr)
    ORDER BY hs.hr
  ),
  pages AS (
    SELECT path, COUNT(*) AS views, COUNT(DISTINCT session_id) AS visitors
    FROM base
    GROUP BY path
    ORDER BY views DESC
    LIMIT 10
  ),
  depth AS (
    SELECT
      COUNT(*) FILTER (WHERE pv_count = 1) AS one_page,
      COUNT(*) FILTER (WHERE pv_count BETWEEN 2 AND 3) AS two_three,
      COUNT(*) FILTER (WHERE pv_count >= 4) AS four_plus,
      COUNT(*) AS total
    FROM sess
  ),
  geo AS (
    SELECT
      country_code AS country,
      COUNT(*) AS visitors
    FROM base
    WHERE country_code IS NOT NULL
    GROUP BY country_code
    ORDER BY visitors DESC
    LIMIT 25
  ),
  geo_regions AS (
    SELECT country_code AS country, region, COUNT(*) AS cnt,
      ROW_NUMBER() OVER (PARTITION BY country_code ORDER BY COUNT(*) DESC) AS rn
    FROM base
    WHERE country_code IS NOT NULL
    GROUP BY country_code, region
  ),
  geo_total AS (
    SELECT COUNT(*) AS total FROM base WHERE country_code IS NOT NULL
  )
  SELECT jsonb_build_object(
    'timezone', _tz,
    'kpi', (SELECT to_jsonb(kpi) FROM kpi),
    'daily', COALESCE((SELECT jsonb_agg(jsonb_build_object('date_key', dkey, 'views', views) ORDER BY dkey) FROM daily_full), '[]'::jsonb),
    'hourly', COALESCE((SELECT jsonb_agg(jsonb_build_object('hour', hr, 'views', views) ORDER BY hr) FROM hourly_full), '[]'::jsonb),
    'top_pages', COALESCE((SELECT jsonb_agg(jsonb_build_object('path', path, 'views', views, 'visitors', visitors)) FROM pages), '[]'::jsonb),
    'session_depth', (SELECT to_jsonb(depth) FROM depth),
    'geo_total', (SELECT total FROM geo_total),
    'geo', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'country', g.country,
        'visitors', g.visitors,
        'top_regions', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('name', COALESCE(gr.region, 'Unknown'), 'count', gr.cnt) ORDER BY gr.cnt DESC)
          FROM geo_regions gr
          WHERE gr.country = g.country AND gr.rn <= 3
        ), '[]'::jsonb)
      ) ORDER BY g.visitors DESC)
      FROM geo g
    ), '[]'::jsonb)
  ) INTO _result;

  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_website_analytics(uuid, timestamptz, timestamptz, text) TO authenticated, anon;
