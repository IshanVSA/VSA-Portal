-- Fix clinic deletion: the regenerate_gbp_batches() trigger runs an unsafe
-- "DELETE FROM gbp_batches" with no WHERE clause, which fails under
-- pg-safeupdate when cascading from a clinic delete (clinic_gbp_config DELETE
-- fires the trigger). Add an explicit WHERE clause and null out FK references
-- on history tables so cleanup stays robust.

CREATE OR REPLACE FUNCTION public.regenerate_gbp_batches()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  config_row RECORD;
  cluster_row RECORD;
  batch_num INTEGER := 1;
  pos_index INTEGER;
  variant_pos TEXT;
  positions TEXT[] := ARRAY['A','B','C','D'];
BEGIN
  -- Null out nullable FK references before clearing batches (safe-update friendly)
  UPDATE public.gbp_post_history
     SET batch_id = NULL
   WHERE batch_id IS NOT NULL;

  UPDATE public.gbp_compliance_scans
     SET batch_id = NULL
   WHERE batch_id IS NOT NULL;

  -- Delete all existing batches with an explicit WHERE clause
  DELETE FROM public.gbp_batches WHERE id IS NOT NULL;

  -- Process clustered clinics
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

  -- Process solo clinics (have GBP config but not in any cluster)
  FOR config_row IN
    SELECT cgc.id, cgc.clinic_id
    FROM public.clinic_gbp_config cgc
    WHERE NOT EXISTS (
      SELECT 1 FROM public.geo_clusters gc
      WHERE cgc.clinic_id = ANY(gc.clinics)
    )
    ORDER BY cgc.clinic_id
  LOOP
    INSERT INTO public.gbp_batches (batch_number, cluster_id, clinics, status)
    VALUES (batch_num, NULL, ARRAY[config_row.clinic_id], 'queued');
    batch_num := batch_num + 1;

    UPDATE public.clinic_gbp_config
       SET cluster_position = 'A',
           cluster_id = NULL
     WHERE id = config_row.id;
  END LOOP;

  RETURN NULL;
END;
$$;