CREATE OR REPLACE FUNCTION public.delete_clinic_by_id(_clinic_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  _deleted_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins can delete clinics';
  END IF;

  IF _clinic_id IS NULL THEN
    RAISE EXCEPTION 'Clinic ID is required';
  END IF;

  EXECUTE format(
    'DELETE FROM public.clinics WHERE id = %L::uuid',
    _clinic_id
  );

  GET DIAGNOSTICS _deleted_count = ROW_COUNT;

  IF _deleted_count = 0 THEN
    RAISE EXCEPTION 'Clinic not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_clinic_by_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_clinic_by_id(uuid) TO authenticated;