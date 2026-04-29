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
  hook_for_pos TEXT;
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
      hook_for_pos := CASE variant_pos
        WHEN 'A' THEN 'QUESTION'
        WHEN 'B' THEN 'URGENCY'
        WHEN 'C' THEN 'MYTH-BUST'
        WHEN 'D' THEN 'STAT'
      END;
      UPDATE public.clinic_gbp_config
         SET cluster_position = variant_pos,
             cluster_id = cluster_row.cluster_id,
             topic_variant_current = variant_pos,
             hook_style_current = hook_for_pos
       WHERE id = config_row.id;
      pos_index := pos_index + 1;
    END LOOP;
  END LOOP;

  FOR config_row IN
    SELECT cgc.id, cgc.clinic_id, cgc.cluster_position
    FROM public.clinic_gbp_config cgc
    WHERE NOT EXISTS (
      SELECT 1 FROM public.geo_clusters gc
      WHERE cgc.clinic_id = ANY(gc.clinics)
    )
  LOOP
    UPDATE public.clinic_gbp_config
       SET cluster_position = COALESCE(cluster_position, 'A'),
           topic_variant_current = COALESCE(cluster_position, 'A'),
           hook_style_current = CASE COALESCE(cluster_position, 'A')
             WHEN 'A' THEN 'QUESTION'
             WHEN 'B' THEN 'URGENCY'
             WHEN 'C' THEN 'MYTH-BUST'
             WHEN 'D' THEN 'STAT'
           END
     WHERE id = config_row.id;
  END LOOP;
END;
$$;

UPDATE public.clinic_gbp_config
   SET topic_variant_current = COALESCE(topic_variant_current, cluster_position, 'A'),
       hook_style_current = COALESCE(
         hook_style_current,
         CASE COALESCE(cluster_position, 'A')
           WHEN 'A' THEN 'QUESTION'
           WHEN 'B' THEN 'URGENCY'
           WHEN 'C' THEN 'MYTH-BUST'
           WHEN 'D' THEN 'STAT'
         END
       )
 WHERE topic_variant_current IS NULL OR hook_style_current IS NULL;

UPDATE public.clinic_gbp_config cgc
   SET phone_number = c.phone
  FROM public.clinics c
 WHERE cgc.clinic_id = c.id
   AND cgc.phone_number IS NULL
   AND c.phone IS NOT NULL
   AND btrim(c.phone) <> '';

UPDATE public.clinic_gbp_config cgc
   SET neighbourhood = public.extract_city_from_address(c.address)
  FROM public.clinics c
 WHERE cgc.clinic_id = c.id
   AND cgc.neighbourhood IS NULL
   AND public.extract_city_from_address(c.address) IS NOT NULL;

UPDATE public.clinic_gbp_config
   SET hospital_type = 1
 WHERE hospital_type IS NULL;

SELECT public._rebuild_gbp_batches_from_clusters();