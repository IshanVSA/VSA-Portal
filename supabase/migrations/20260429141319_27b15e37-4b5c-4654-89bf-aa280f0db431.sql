-- Helpers
CREATE OR REPLACE FUNCTION public.slugify_city(_city text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _city IS NULL OR btrim(_city) = '' THEN NULL
    ELSE upper(regexp_replace(regexp_replace(btrim(_city), '[^A-Za-z0-9 \-]', '', 'g'), '\s+', '-', 'g'))
  END;
$$;

CREATE OR REPLACE FUNCTION public.extract_city_from_address(_address text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  parts text[];
  candidate text;
  cleaned text;
  i integer;
BEGIN
  IF _address IS NULL OR btrim(_address) = '' THEN
    RETURN NULL;
  END IF;
  parts := string_to_array(_address, ',');
  IF array_length(parts, 1) IS NULL THEN
    RETURN NULL;
  END IF;
  FOR i IN 1..array_length(parts, 1) LOOP
    parts[i] := btrim(parts[i]);
  END LOOP;
  FOR i IN REVERSE array_length(parts, 1)..1 LOOP
    candidate := parts[i];
    IF candidate IS NULL OR candidate = '' THEN CONTINUE; END IF;
    cleaned := candidate;
    cleaned := regexp_replace(cleaned, '[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d', '', 'g');
    cleaned := regexp_replace(cleaned, '\d{5}(-\d{4})?', '', 'g');
    cleaned := btrim(cleaned);
    IF upper(cleaned) IN ('CANADA','USA','UNITED STATES','U.S.','US','U.S.A.') THEN CONTINUE; END IF;
    cleaned := regexp_replace(cleaned, '^(BC|AB|ON|QC|MB|SK|NS|NB|NL|PE|YT|NT|NU|British Columbia|Alberta|Ontario|Quebec|Manitoba|Saskatchewan|Nova Scotia|New Brunswick|CA|WA|OR|CO|NY|TX|FL|IL|MA|NJ|VA|GA|NC|AZ|MI|PA|OH)\s*$', '', 'i');
    cleaned := btrim(cleaned);
    IF cleaned = '' THEN CONTINUE; END IF;
    IF length(cleaned) <= 3 AND cleaned ~ '^[A-Za-z]+$' THEN CONTINUE; END IF;
    cleaned := regexp_replace(cleaned, '\s+(BC|AB|ON|QC|MB|SK|NS|NB|NL|PE|YT|NT|NU|CA|WA|OR|CO|NY|TX|FL|IL|MA|NJ|VA|GA|NC|AZ|MI|PA|OH)$', '', 'i');
    cleaned := btrim(cleaned);
    IF cleaned <> '' THEN
      RETURN initcap(cleaned);
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

-- Helper: rebuild gbp_batches from current clusters + configs
CREATE OR REPLACE FUNCTION public._rebuild_gbp_batches_from_clusters()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  config_row RECORD;
  cluster_row RECORD;
  batch_num INTEGER := 1;
  pos_index INTEGER;
  variant_pos TEXT;
  positions TEXT[] := ARRAY['A','B','C','D'];
BEGIN
  UPDATE public.gbp_post_history SET batch_id = NULL WHERE batch_id IS NOT NULL;
  UPDATE public.gbp_compliance_scans SET batch_id = NULL WHERE batch_id IS NOT NULL;
  DELETE FROM public.gbp_batches WHERE id IS NOT NULL;

  FOR cluster_row IN
    SELECT cluster_id, clinics FROM public.geo_clusters ORDER BY cluster_id
  LOOP
    INSERT INTO public.gbp_batches (batch_number, cluster_id, clinics, status)
    VALUES (batch_num, cluster_row.cluster_id, cluster_row.clinics, 'queued');
    batch_num := batch_num + 1;

    pos_index := 0;
    FOR config_row IN
      SELECT id, clinic_id FROM public.clinic_gbp_config
      WHERE clinic_id = ANY(cluster_row.clinics)
      ORDER BY clinic_id
    LOOP
      variant_pos := positions[(pos_index % 4) + 1];
      UPDATE public.clinic_gbp_config
         SET cluster_position = variant_pos,
             cluster_id = cluster_row.cluster_id
       WHERE id = config_row.id;
      pos_index := pos_index + 1;
    END LOOP;
  END LOOP;
END;
$$;

-- Main rebuild routine
CREATE OR REPLACE FUNCTION public.rebuild_geo_clusters()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Ensure every clinic has a clinic_gbp_config row
  INSERT INTO public.clinic_gbp_config (clinic_id, geo_radius_km, local_landmarks)
  SELECT c.id, 7, ARRAY[]::text[]
  FROM public.clinics c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.clinic_gbp_config cfg WHERE cfg.clinic_id = c.id
  );

  -- Rebuild geo_clusters: group by slug only (region picked deterministically)
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

  -- Delete clusters no longer represented
  DELETE FROM public.geo_clusters
  WHERE cluster_id NOT IN (
    SELECT COALESCE(public.slugify_city(
             COALESCE(NULLIF(public.extract_city_from_address(c.address), ''), 'Unassigned')
           ), 'UNASSIGNED')
    FROM public.clinics c
  );

  -- Refresh batches
  PERFORM public._rebuild_gbp_batches_from_clusters();
END;
$$;

-- Trigger on clinics
CREATE OR REPLACE FUNCTION public.trg_clinics_auto_cluster()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.address IS NOT DISTINCT FROM OLD.address THEN
    RETURN NULL;
  END IF;
  PERFORM public.rebuild_geo_clusters();
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS clinics_auto_cluster_aiud ON public.clinics;
CREATE TRIGGER clinics_auto_cluster_aiud
AFTER INSERT OR UPDATE OF address OR DELETE
ON public.clinics
FOR EACH ROW
EXECUTE FUNCTION public.trg_clinics_auto_cluster();

GRANT EXECUTE ON FUNCTION public.rebuild_geo_clusters() TO authenticated;
GRANT EXECUTE ON FUNCTION public.extract_city_from_address(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.slugify_city(text) TO authenticated;

-- One-time backfill
SELECT public.rebuild_geo_clusters();