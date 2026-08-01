CREATE OR REPLACE FUNCTION public.can_read_department_file(_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'storage'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _f text[];
  _f1 text;
  _f2 text;
  _f3 text;
  _uuid_re text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
  IF _uid IS NULL OR _name IS NULL THEN
    RETURN false;
  END IF;

  -- Staff can see everything
  IF public.has_role(_uid, 'admin'::public.app_role)
     OR public.has_role(_uid, 'concierge'::public.app_role) THEN
    RETURN true;
  END IF;

  _f := storage.foldername(_name);
  _f1 := _f[1];
  _f2 := _f[2];
  _f3 := _f[3];

  -- Ticket attachments and per-ticket deliverables
  IF _f1 IN ('tickets', 'content-deliverables') THEN
    RETURN _f2 IS NOT NULL AND _f2 ~* _uuid_re AND EXISTS (
      SELECT 1 FROM public.department_tickets t
      WHERE t.id = _f2::uuid
        AND (
          t.created_by = _uid
          OR t.clinic_id IN (SELECT public.get_accessible_clinic_ids(_uid))
        )
    );
  END IF;

  -- SM2 deliverables: either sm2/<generation-id>/... or sm2/<file>.html
  IF _f1 = 'sm2' THEN
    IF _f2 IS NOT NULL AND _f2 ~* _uuid_re THEN
      RETURN EXISTS (
        SELECT 1 FROM public.sm2_generations g
        WHERE g.id = _f2::uuid
          AND g.clinic_id IN (SELECT public.get_accessible_clinic_ids(_uid))
      );
    END IF;
    RETURN EXISTS (
      SELECT 1 FROM public.sm2_generations g
      WHERE g.html_file_path IS NOT NULL
        AND (g.html_file_path = _name OR g.html_file_path LIKE '%' || _name)
        AND g.clinic_id IN (SELECT public.get_accessible_clinic_ids(_uid))
    );
  END IF;

  -- Client chat images: client-chat/<department>/<clinic-id>/...
  IF _f1 = 'client-chat' THEN
    RETURN _f3 IS NOT NULL AND _f3 ~* _uuid_re AND _f3::uuid IN (
      SELECT public.get_accessible_clinic_ids(_uid)
    );
  END IF;

  -- Remaining folders are clinic-scoped: <folder>/<clinic-id>/...
  RETURN _f2 IS NOT NULL AND _f2 ~* _uuid_re AND _f2::uuid IN (
    SELECT public.get_accessible_clinic_ids(_uid)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.can_read_department_file(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_read_department_file(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Authenticated users can view department files" ON storage.objects;

CREATE POLICY "Scoped read of department files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'department-files'
  AND public.can_read_department_file(name)
);