ALTER TABLE public.department_tickets
  ADD COLUMN IF NOT EXISTS completion_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS completion_email_recipients integer,
  ADD COLUMN IF NOT EXISTS completion_email_error text;