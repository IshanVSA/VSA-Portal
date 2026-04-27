ALTER TABLE public.clinic_api_credentials
ADD COLUMN IF NOT EXISTS meta_granted_scopes text[] DEFAULT NULL;