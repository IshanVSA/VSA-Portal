CREATE INDEX IF NOT EXISTS idx_clinic_gsc_daily_clinic_date_bucket
  ON public.clinic_gsc_daily (clinic_id, date, bucket_type);

CREATE OR REPLACE FUNCTION public.get_gsc_dashboard(
  _clinic_id uuid,
  _from date,
  _to date,
  _prev_from date,
  _prev_to date,
  _brand_tokens text[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
WITH cur AS (
  SELECT * FROM public.clinic_gsc_daily
  WHERE clinic_id = _clinic_id AND date >= _from AND date <= _to
),
prev AS (
  SELECT * FROM public.clinic_gsc_daily
  WHERE clinic_id = _clinic_id AND date >= _prev_from AND date <= _prev_to
    AND bucket_type = 'total'
),
totals AS (
  SELECT COALESCE(SUM(impressions),0)::bigint AS impressions,
         COALESCE(SUM(clicks),0)::bigint AS clicks,
         COALESCE(SUM(position * impressions),0)::numeric AS pos_weighted
  FROM cur WHERE bucket_type = 'total'
),
prev_totals AS (
  SELECT COALESCE(SUM(impressions),0)::bigint AS impressions,
         COALESCE(SUM(clicks),0)::bigint AS clicks,
         COALESCE(SUM(position * impressions),0)::numeric AS pos_weighted
  FROM prev
),
daily AS (
  SELECT date, SUM(clicks)::bigint AS clicks, SUM(impressions)::bigint AS impressions
  FROM cur WHERE bucket_type = 'total' GROUP BY date ORDER BY date
),
q AS (
  SELECT bucket_value AS query,
         SUM(clicks)::bigint AS clicks,
         SUM(impressions)::bigint AS impressions,
         CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::numeric / SUM(impressions) ELSE 0 END AS ctr,
         CASE WHEN SUM(impressions) > 0 THEN SUM(position * impressions) / SUM(impressions) ELSE 0 END AS position
  FROM cur WHERE bucket_type = 'query' GROUP BY bucket_value
),
qp AS (SELECT * FROM q WHERE position > 0 AND position <= 50),
p AS (
  SELECT bucket_value AS page,
         SUM(clicks)::bigint AS clicks,
         SUM(impressions)::bigint AS impressions,
         CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::numeric / SUM(impressions) ELSE 0 END AS ctr,
         CASE WHEN SUM(impressions) > 0 THEN SUM(position * impressions) / SUM(impressions) ELSE 0 END AS position
  FROM cur WHERE bucket_type = 'page' GROUP BY bucket_value
),
d AS (
  SELECT bucket_value AS device, SUM(clicks)::bigint AS clicks, SUM(impressions)::bigint AS impressions
  FROM cur WHERE bucket_type = 'device' GROUP BY bucket_value
),
c AS (
  SELECT upper(bucket_value) AS country, SUM(clicks)::bigint AS clicks, SUM(impressions)::bigint AS impressions
  FROM cur WHERE bucket_type = 'country' GROUP BY bucket_value
),
brand AS (
  SELECT
    COALESCE(SUM(CASE WHEN is_brand THEN clicks ELSE 0 END),0)::bigint AS brand,
    COALESCE(SUM(CASE WHEN is_brand THEN 0 ELSE clicks END),0)::bigint AS non_brand
  FROM (
    SELECT clicks,
           EXISTS (
             SELECT 1 FROM unnest(_brand_tokens) t
             WHERE t <> '' AND lower(qp.query) LIKE '%' || lower(t) || '%'
           ) AS is_brand
    FROM qp
  ) s
)
SELECT jsonb_build_object(
  'totals', (SELECT jsonb_build_object(
      'impressions', impressions, 'clicks', clicks,
      'ctr', CASE WHEN impressions > 0 THEN clicks::numeric / impressions ELSE 0 END,
      'avgPosition', CASE WHEN impressions > 0 THEN pos_weighted / impressions ELSE 0 END
    ) FROM totals),
  'prevTotals', (SELECT jsonb_build_object(
      'impressions', impressions, 'clicks', clicks,
      'ctr', CASE WHEN impressions > 0 THEN clicks::numeric / impressions ELSE 0 END,
      'avgPosition', CASE WHEN impressions > 0 THEN pos_weighted / impressions ELSE 0 END
    ) FROM prev_totals),
  'daily', COALESCE((SELECT jsonb_agg(jsonb_build_object('date', date, 'clicks', clicks, 'impressions', impressions)) FROM daily), '[]'::jsonb),
  'topQueries', COALESCE((SELECT jsonb_agg(x) FROM (SELECT * FROM qp ORDER BY clicks DESC, impressions DESC LIMIT 20) x), '[]'::jsonb),
  'opportunityQueries', COALESCE((SELECT jsonb_agg(x) FROM (SELECT * FROM qp WHERE position >= 11 AND position <= 20 ORDER BY impressions DESC LIMIT 10) x), '[]'::jsonb),
  'topPages', COALESCE((SELECT jsonb_agg(x) FROM (SELECT * FROM p ORDER BY clicks DESC, impressions DESC LIMIT 15) x), '[]'::jsonb),
  'devices', COALESCE((SELECT jsonb_agg(x) FROM (SELECT * FROM d ORDER BY impressions DESC) x), '[]'::jsonb),
  'countries', COALESCE((SELECT jsonb_agg(x) FROM (SELECT * FROM c ORDER BY clicks DESC, impressions DESC LIMIT 15) x), '[]'::jsonb),
  'brandVsNonBrand', (SELECT jsonb_build_object('brand', brand, 'nonBrand', non_brand) FROM brand)
);
$$;

GRANT EXECUTE ON FUNCTION public.get_gsc_dashboard(uuid, date, date, date, date, text[]) TO authenticated, service_role;