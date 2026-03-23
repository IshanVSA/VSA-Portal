ALTER TABLE public.clinics
ADD COLUMN IF NOT EXISTS website_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS seo_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS google_ads_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS social_media_enabled boolean NOT NULL DEFAULT true;