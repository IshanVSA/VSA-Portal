CREATE TABLE IF NOT EXISTS public.auth_error_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  context text not null default 'login',
  email text,
  user_id uuid,
  error_code text,
  error_status int,
  error_message text,
  friendly_message text,
  user_agent text,
  route text
);

GRANT INSERT ON public.auth_error_logs TO anon, authenticated;
GRANT SELECT ON public.auth_error_logs TO authenticated;
GRANT ALL ON public.auth_error_logs TO service_role;

ALTER TABLE public.auth_error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone can record an auth error" ON public.auth_error_logs;
CREATE POLICY "anyone can record an auth error"
  ON public.auth_error_logs FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "admins can read auth errors" ON public.auth_error_logs;
CREATE POLICY "admins can read auth errors"
  ON public.auth_error_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS auth_error_logs_created_at_idx ON public.auth_error_logs (created_at DESC);