
-- Allow admins, assigned concierges, and clinic owners to write clinic logos
-- Path convention: clinic-logos/{clinic_id}/logo.{ext}

CREATE OR REPLACE FUNCTION public.can_manage_clinic_logo(_user_id uuid, _clinic_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.clinics
      WHERE id = _clinic_id
        AND (owner_user_id = _user_id OR assigned_concierge_id = _user_id)
    )
    OR public.is_clinic_team_member(_user_id, _clinic_id)
$$;

DROP POLICY IF EXISTS "Clinic logo insert" ON storage.objects;
CREATE POLICY "Clinic logo insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'department-files'
  AND (storage.foldername(name))[1] = 'clinic-logos'
  AND public.can_manage_clinic_logo(auth.uid(), ((storage.foldername(name))[2])::uuid)
);

DROP POLICY IF EXISTS "Clinic logo update" ON storage.objects;
CREATE POLICY "Clinic logo update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'department-files'
  AND (storage.foldername(name))[1] = 'clinic-logos'
  AND public.can_manage_clinic_logo(auth.uid(), ((storage.foldername(name))[2])::uuid)
);

DROP POLICY IF EXISTS "Clinic logo delete" ON storage.objects;
CREATE POLICY "Clinic logo delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'department-files'
  AND (storage.foldername(name))[1] = 'clinic-logos'
  AND public.can_manage_clinic_logo(auth.uid(), ((storage.foldername(name))[2])::uuid)
);
