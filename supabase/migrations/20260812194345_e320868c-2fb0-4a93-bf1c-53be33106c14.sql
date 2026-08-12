
CREATE OR REPLACE FUNCTION public.get_clinic_analytics_connection(_clinic_id uuid)
RETURNS TABLE(ga4_property_id text, ga4_last_sync_at timestamptz, gsc_site_url text, gsc_last_sync_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR _clinic_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (public.has_role(auth.uid(), 'concierge'::public.app_role)
        AND _clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid())))
    OR _clinic_id IN (SELECT public.get_accessible_clinic_ids(auth.uid()))
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ga.ga4_property_id,
    ga.last_sync_at,
    gs.site_url,
    gs.last_sync_at
  FROM (SELECT 1) one
  LEFT JOIN public.clinic_ga4_credentials ga ON ga.clinic_id = _clinic_id
  LEFT JOIN public.clinic_gsc_credentials gs ON gs.clinic_id = _clinic_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_clinic_analytics_connection(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_clinic_analytics_connection(uuid) TO authenticated;
