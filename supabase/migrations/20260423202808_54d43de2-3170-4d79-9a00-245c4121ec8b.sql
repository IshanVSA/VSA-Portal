CREATE OR REPLACE FUNCTION public.delete_clinic_by_id(_clinic_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  DELETE FROM public.clinics
  WHERE id = _clinic_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clinic not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_clinic_by_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_clinic_by_id(uuid) TO authenticated;