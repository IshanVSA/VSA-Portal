INSERT INTO public.user_login_activity (user_id, first_login_at, last_seen_at, login_count, updated_at)
SELECT
  u.id,
  COALESCE(u.confirmed_at, u.created_at, u.last_sign_in_at) AS first_login_at,
  u.last_sign_in_at AS last_seen_at,
  1 AS login_count,
  now()
FROM auth.users u
JOIN public.user_roles ur ON ur.user_id = u.id
WHERE u.last_sign_in_at IS NOT NULL
  AND ur.role IN ('client'::public.app_role, 'sub_client'::public.app_role)
ON CONFLICT (user_id) DO UPDATE
SET last_seen_at = GREATEST(public.user_login_activity.last_seen_at, EXCLUDED.last_seen_at),
    first_login_at = LEAST(
      COALESCE(public.user_login_activity.first_login_at, EXCLUDED.first_login_at),
      EXCLUDED.first_login_at
    ),
    updated_at = now();