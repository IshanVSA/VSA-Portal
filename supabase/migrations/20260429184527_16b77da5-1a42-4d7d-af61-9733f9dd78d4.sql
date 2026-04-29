ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS welcome_email_last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS welcome_email_last_error text;