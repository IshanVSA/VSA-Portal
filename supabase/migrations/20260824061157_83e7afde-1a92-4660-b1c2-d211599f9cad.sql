-- 1) short_links: drop blanket authenticated read
DROP POLICY IF EXISTS "Authenticated users can read short links" ON public.short_links;
REVOKE SELECT ON public.short_links FROM authenticated, anon;

-- 2) Lock down maintenance RPCs
REVOKE EXECUTE ON FUNCTION public.record_cron_heartbeat(text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.populate_monthly_holidays(uuid, integer, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.regenerate_gbp_batches() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._rebuild_gbp_batches_from_clusters() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rebuild_geo_clusters() FROM anon;

-- 3) rebuild_geo_clusters stays callable from the admin UI, but enforce admin inside it
CREATE OR REPLACE FUNCTION public.rebuild_geo_clusters()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.has_role((SELECT auth.uid()), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins can rebuild geo clusters';
  END IF;

  INSERT INTO public.clinic_gbp_config (clinic_id, geo_radius_km, local_landmarks)
  SELECT c.id, 7, ARRAY[]::text[]
  FROM public.clinics c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.clinic_gbp_config cfg WHERE cfg.clinic_id = c.id
  );

  WITH derived AS (
    SELECT c.id AS clinic_id,
           COALESCE(NULLIF(public.extract_city_from_address(c.address), ''), 'Unassigned') AS city
    FROM public.clinics c
  ),
  with_slug AS (
    SELECT clinic_id, city, COALESCE(public.slugify_city(city), 'UNASSIGNED') AS cluster_id
    FROM derived
  ),
  grouped AS (
    SELECT cluster_id, MIN(city) AS region, array_agg(clinic_id ORDER BY clinic_id) AS clinics
    FROM with_slug
    GROUP BY cluster_id
  )
  INSERT INTO public.geo_clusters (cluster_id, region, clinics)
  SELECT cluster_id, region, clinics FROM grouped
  ON CONFLICT (cluster_id) DO UPDATE
    SET region = EXCLUDED.region,
        clinics = EXCLUDED.clinics;

  DELETE FROM public.geo_clusters gc
  WHERE NOT EXISTS (
    SELECT 1 FROM public.clinics c
    WHERE COALESCE(public.slugify_city(COALESCE(NULLIF(public.extract_city_from_address(c.address), ''), 'Unassigned')), 'UNASSIGNED') = gc.cluster_id
  );
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.rebuild_geo_clusters() FROM anon;
GRANT EXECUTE ON FUNCTION public.rebuild_geo_clusters() TO authenticated;