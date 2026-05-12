-- 1) Backfill user_login_activity from auth.users.last_sign_in_at for users with no row
INSERT INTO public.user_login_activity (user_id, first_login_at, last_seen_at, login_count, updated_at)
SELECT u.id, COALESCE(u.last_sign_in_at, u.created_at), u.last_sign_in_at, 1, now()
FROM auth.users u
LEFT JOIN public.user_login_activity a ON a.user_id = u.id
WHERE a.user_id IS NULL
  AND u.last_sign_in_at IS NOT NULL;

-- 2) Update admin client login summary to fall back to auth.users.last_sign_in_at
CREATE OR REPLACE FUNCTION public.get_client_login_summary()
 RETURNS TABLE(user_id uuid, full_name text, email text, role text, parent_user_id uuid, first_login_at timestamp with time zone, last_seen_at timestamp with time zone, login_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS user_id,
    p.full_name,
    p.email,
    ur.role::text AS role,
    csa.parent_user_id,
    COALESCE(a.first_login_at, au.last_sign_in_at) AS first_login_at,
    COALESCE(a.last_seen_at, au.last_sign_in_at) AS last_seen_at,
    COALESCE(a.login_count, CASE WHEN au.last_sign_in_at IS NOT NULL THEN 1 ELSE 0 END) AS login_count
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  LEFT JOIN public.user_login_activity a ON a.user_id = p.id
  LEFT JOIN auth.users au ON au.id = p.id
  LEFT JOIN LATERAL (
    SELECT c.owner_user_id AS parent_user_id
    FROM public.client_sub_accounts cs
    JOIN public.sub_account_clinics sac ON sac.sub_account_id = cs.id
    JOIN public.clinics c ON c.id = sac.clinic_id
    WHERE cs.sub_user_id = p.id
    LIMIT 1
  ) csa ON TRUE
  WHERE ur.role IN ('client'::public.app_role, 'sub_client'::public.app_role)
  ORDER BY COALESCE(a.last_seen_at, au.last_sign_in_at) DESC NULLS LAST, p.full_name ASC;
END;
$function$;