
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
  -- Delete all existing batches
  DELETE FROM public.gbp_batches;

  -- Process clustered clinics
  FOR cluster_row IN
    SELECT cluster_id, clinics FROM public.geo_clusters ORDER BY cluster_id
  LOOP
    -- Insert batch for this cluster
    INSERT INTO public.gbp_batches (batch_number, cluster_id, clinics, status)
    VALUES (batch_num, cluster_row.cluster_id, cluster_row.clinics, 'queued');
    batch_num := batch_num + 1;

    -- Update variant positions for clinics in this cluster
    pos_index := 0;
    FOR config_row IN
      SELECT id, clinic_id FROM public.clinic_gbp_config
      WHERE clinic_id = ANY(cluster_row.clinics)
      ORDER BY clinic_id
    LOOP
      variant_pos := positions[(pos_index % 4) + 1];
      UPDATE public.clinic_gbp_config
      SET cluster_position = variant_pos, cluster_id = cluster_row.cluster_id
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
    SET cluster_position = 'A', cluster_id = NULL
    WHERE id = config_row.id;
  END LOOP;

  RETURN NULL;
END;
$$;

-- Trigger on geo_clusters changes
CREATE TRIGGER trg_regenerate_batches_on_cluster_change
AFTER INSERT OR UPDATE OR DELETE ON public.geo_clusters
FOR EACH STATEMENT
EXECUTE FUNCTION public.regenerate_gbp_batches();

-- Also trigger when clinic_gbp_config rows are added/removed
CREATE TRIGGER trg_regenerate_batches_on_config_change
AFTER INSERT OR DELETE ON public.clinic_gbp_config
FOR EACH STATEMENT
EXECUTE FUNCTION public.regenerate_gbp_batches();
