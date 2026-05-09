
CREATE OR REPLACE FUNCTION public.realtime_topic_authorized(_topic text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  parts text[];
  scope text;
  scope_id uuid;
  gen_clinic uuid;
BEGIN
  IF uid IS NULL OR _topic IS NULL OR _topic = '' THEN
    RETURN false;
  END IF;

  parts := string_to_array(_topic, ':');
  scope := parts[1];

  IF scope = 'admin' THEN
    RETURN public.has_role(uid, 'admin'::app_role);
  END IF;

  IF scope = 'staff' THEN
    RETURN public.has_role(uid, 'admin'::app_role)
        OR public.has_role(uid, 'concierge'::app_role)
        OR EXISTS (SELECT 1 FROM public.department_members WHERE user_id = uid)
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND team_role IS NOT NULL);
  END IF;

  IF scope = 'user' AND array_length(parts,1) >= 2 THEN
    BEGIN scope_id := parts[2]::uuid; EXCEPTION WHEN others THEN RETURN false; END;
    RETURN scope_id = uid;
  END IF;

  IF scope = 'clinic' AND array_length(parts,1) >= 2 THEN
    BEGIN scope_id := parts[2]::uuid; EXCEPTION WHEN others THEN RETURN false; END;
    RETURN public.has_role(uid, 'admin'::app_role)
        OR EXISTS (
          SELECT 1 FROM public.clinics c
          WHERE c.id = scope_id
            AND (c.owner_user_id = uid OR c.assigned_concierge_id = uid)
        )
        OR public.is_clinic_team_member(uid, scope_id)
        OR scope_id IN (SELECT public.get_concierge_clinic_ids(uid))
        OR scope_id IN (SELECT public.get_sub_account_clinic_ids(uid));
  END IF;

  IF scope = 'gen' AND array_length(parts,1) >= 2 THEN
    BEGIN scope_id := parts[2]::uuid; EXCEPTION WHEN others THEN RETURN false; END;
    SELECT clinic_id INTO gen_clinic FROM public.sm2_generations WHERE id = scope_id;
    IF gen_clinic IS NULL THEN RETURN false; END IF;
    RETURN public.has_role(uid, 'admin'::app_role)
        OR EXISTS (
          SELECT 1 FROM public.clinics c
          WHERE c.id = gen_clinic
            AND (c.owner_user_id = uid OR c.assigned_concierge_id = uid)
        )
        OR public.is_clinic_team_member(uid, gen_clinic)
        OR gen_clinic IN (SELECT public.get_concierge_clinic_ids(uid))
        OR gen_clinic IN (SELECT public.get_sub_account_clinic_ids(uid));
  END IF;

  RETURN false;
END;
$$;
