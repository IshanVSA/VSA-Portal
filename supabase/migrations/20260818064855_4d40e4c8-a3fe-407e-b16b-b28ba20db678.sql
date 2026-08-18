ALTER TABLE public.auth_error_logs
  ADD COLUMN IF NOT EXISTS success boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS failure_kind text;

CREATE INDEX IF NOT EXISTS auth_error_logs_created_at_idx ON public.auth_error_logs (created_at DESC);