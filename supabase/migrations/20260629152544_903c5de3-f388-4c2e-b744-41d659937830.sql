CREATE OR REPLACE FUNCTION public.get_clinic_department_team(
  _clinic_id uuid,
  _team_roles text[]
)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  team_role text,
  app_role text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authorization: admins and concierge can inspect team assignments;
  -- clients, sub-accounts, and partners can inspect only clinics they can access.
  IF auth.uid() IS NULL OR NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'concierge'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.clinics c
      WHERE c.id = _clinic_id
        AND c.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.sub_account_clinics sac
      INNER JOIN public.client_sub_accounts csa ON csa.id = sac.sub_account_id
      WHERE sac.clinic_id = _clinic_id
        AND csa.sub_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.clinic_partners cp
      WHERE cp.clinic_id = _clinic_id
        AND cp.user_id = auth.uid()
    )
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH staff_profiles AS (
    SELECT p.id, p.full_name, p.email, p.team_role
    FROM public.profiles p
    WHERE p.team_role = ANY (_team_roles)
  ),
  app_roles AS (
    SELECT ur.user_id,
           CASE
             WHEN bool_or(ur.role = 'admin'::app_role) THEN 'admin'
             WHEN bool_or(ur.role = 'concierge'::app_role) THEN 'concierge'
             ELSE 'client'
           END AS role
    FROM public.user_roles ur
    WHERE ur.user_id IN (SELECT id FROM staff_profiles)
    GROUP BY ur.user_id
  )
  SELECT
    sp.id AS user_id,
    COALESCE(sp.full_name, split_part(sp.email, '@', 1), 'Member') AS full_name,
    sp.team_role,
    COALESCE(ar.role, 'concierge') AS app_role
  FROM staff_profiles sp
  INNER JOIN public.clinic_team_members ctm
    ON ctm.user_id = sp.id
   AND ctm.clinic_id = _clinic_id
  LEFT JOIN app_roles ar ON ar.user_id = sp.id
  WHERE COALESCE(ar.role, 'concierge') <> 'client'
  ORDER BY sp.full_name NULLS LAST;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_clinic_department_team(uuid, text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_clinic_department_team(uuid, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_clinic_department_team(uuid, text[]) TO authenticated;