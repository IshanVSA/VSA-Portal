CREATE OR REPLACE FUNCTION public.rebuild_geo_clusters()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- 1) Ensure every clinic has a clinic_gbp_config row
  INSERT INTO public.clinic_gbp_config (clinic_id, geo_radius_km, local_landmarks)
  SELECT c.id, 7, ARRAY[]::text[]
  FROM public.clinics c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.clinic_gbp_config cfg WHERE cfg.clinic_id = c.id
  );

  -- 2) Upsert the current set of geo_clusters
  WITH derived AS (
    SELECT
      c.id AS clinic_id,
      COALESCE(NULLIF(public.extract_city_from_address(c.address), ''), 'Unassigned') AS city
    FROM public.clinics c
  ),
  with_slug AS (
    SELECT clinic_id, city, COALESCE(public.slugify_city(city), 'UNASSIGNED') AS cluster_id
    FROM derived
  ),
  grouped AS (
    SELECT
      cluster_id,
      MIN(city) AS region,
      array_agg(clinic_id ORDER BY clinic_id) AS clinics
    FROM with_slug
    GROUP BY cluster_id
  )
  INSERT INTO public.geo_clusters (cluster_id, region, clinics, is_solo)
  SELECT g.cluster_id, g.region, g.clinics, (array_length(g.clinics, 1) <= 1)
  FROM grouped g
  ON CONFLICT (cluster_id) DO UPDATE
    SET region = EXCLUDED.region,
        clinics = EXCLUDED.clinics,
        is_solo = EXCLUDED.is_solo,
        updated_at = now();

  -- 3) Clear FK references on dependent tables BEFORE deleting orphan clusters
  --    (clinic_gbp_config + gbp_batches + gbp_post_history + gbp_compliance_scans).
  UPDATE public.clinic_gbp_config
     SET cluster_id = NULL
   WHERE cluster_id IS NOT NULL
     AND cluster_id NOT IN (
       SELECT COALESCE(public.slugify_city(
                COALESCE(NULLIF(public.extract_city_from_address(c.address), ''), 'Unassigned')
              ), 'UNASSIGNED')
       FROM public.clinics c
     );

  UPDATE public.gbp_post_history SET batch_id = NULL WHERE batch_id IS NOT NULL;
  UPDATE public.gbp_compliance_scans SET batch_id = NULL WHERE batch_id IS NOT NULL;
  DELETE FROM public.gbp_batches WHERE id IS NOT NULL;

  -- 4) Now safe to drop clusters that no longer have any clinics
  DELETE FROM public.geo_clusters
  WHERE cluster_id NOT IN (
    SELECT COALESCE(public.slugify_city(
             COALESCE(NULLIF(public.extract_city_from_address(c.address), ''), 'Unassigned')
           ), 'UNASSIGNED')
    FROM public.clinics c
  );

  -- 5) Refresh batches (will rebuild against the cleaned-up cluster set)
  PERFORM public._rebuild_gbp_batches_from_clusters();
END;
$function$;

-- Backfill the correct full street address for 48th Avenue Animal Hospital
UPDATE public.clinics
SET address = '5020 48 Ave, Delta, BC V4K 3V3, Canada'
WHERE id = '417749c9-688a-4757-85aa-83fcef8f9e72';