
-- Temp table for OAuth token exchange (tokens stored server-side, frontend gets UUID ref)
CREATE TABLE public.oauth_temp_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id uuid NOT NULL,
  provider text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '10 minutes')
);

ALTER TABLE public.oauth_temp_tokens ENABLE ROW LEVEL SECURITY;

-- Only allow authenticated admins to read (via edge functions with service role)
-- No public access policies - only service role can read/write

-- Make department-files bucket private
UPDATE storage.buckets SET public = false WHERE id = 'department-files';
