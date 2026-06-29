
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
  -- Authorization: admin/concierge always allowed; otherwise caller must have access to this clinic
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'concierge'::app_role)
    OR _clinic_id = ANY (public.get_accessible_clinic_ids(auth.uid()))
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
  LEFT JOIN app_roles ar ON ar.user_id = sp.id
  INNER JOIN public.clinic_team_members ctm
    ON ctm.user_id = sp.id AND ctm.clinic_id = _clinic_id
  WHERE COALESCE(ar.role, 'concierge') <> 'client';
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_clinic_department_team(uuid, text[]) TO authenticated;
