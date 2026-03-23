ALTER TABLE public.clinics
ADD COLUMN IF NOT EXISTS timezone text;

COMMENT ON COLUMN public.clinics.timezone IS 'IANA timezone for clinic-specific analytics grouping, e.g. America/New_York';