-- Activity tracking table
CREATE TABLE IF NOT EXISTS public.user_login_activity (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  first_login_at timestamptz,
  last_seen_at timestamptz,
  login_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_login_activity ENABLE ROW LEVEL SECURITY;

-- Admins can read everyone's activity
DROP POLICY IF EXISTS "Admins can view all login activity" ON public.user_login_activity;
CREATE POLICY "Admins can view all login activity"
  ON public.user_login_activity
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Users can read their own row (harmless and useful for "last seen" hints)
DROP POLICY IF EXISTS "Users can view own login activity" ON public.user_login_activity;
CREATE POLICY "Users can view own login activity"
  ON public.user_login_activity
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- No direct INSERT/UPDATE/DELETE policies — writes only flow through
-- the SECURITY DEFINER function below.

-- Heartbeat RPC: throttled upsert of the caller's activity row.
CREATE OR REPLACE FUNCTION public.touch_login_activity()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  existing public.user_login_activity%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO existing FROM public.user_login_activity WHERE user_id = uid;

  IF NOT FOUND THEN
    INSERT INTO public.user_login_activity (user_id, first_login_at, last_seen_at, login_count, updated_at)
    VALUES (uid, now(), now(), 1, now());
    RETURN;
  END IF;

  -- Throttle: only refresh if last_seen_at is older than 5 minutes
  IF existing.last_seen_at IS NULL OR existing.last_seen_at < now() - interval '5 minutes' THEN
    UPDATE public.user_login_activity
       SET last_seen_at = now(),
           login_count = COALESCE(login_count, 0) + 1,
           first_login_at = COALESCE(first_login_at, now()),
           updated_at = now()
     WHERE user_id = uid;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_login_activity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_login_activity() TO authenticated;

-- Admin-only summary across clients + sub-accounts
CREATE OR REPLACE FUNCTION public.get_client_login_summary()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  role text,
  parent_user_id uuid,
  first_login_at timestamptz,
  last_seen_at timestamptz,
  login_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    a.first_login_at,
    a.last_seen_at,
    COALESCE(a.login_count, 0) AS login_count
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  LEFT JOIN public.user_login_activity a ON a.user_id = p.id
  LEFT JOIN LATERAL (
    SELECT c.owner_user_id AS parent_user_id
    FROM public.client_sub_accounts cs
    JOIN public.sub_account_clinics sac ON sac.sub_account_id = cs.id
    JOIN public.clinics c ON c.id = sac.clinic_id
    WHERE cs.sub_user_id = p.id
    LIMIT 1
  ) csa ON TRUE
  WHERE ur.role IN ('client'::public.app_role, 'sub_client'::public.app_role)
  ORDER BY a.last_seen_at DESC NULLS LAST, p.full_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_login_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_login_summary() TO authenticated;