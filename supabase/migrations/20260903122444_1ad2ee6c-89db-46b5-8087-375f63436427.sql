ALTER TABLE public.clinic_api_credentials
  ADD COLUMN IF NOT EXISTS meta_user_access_token text,
  ADD COLUMN IF NOT EXISTS meta_ad_account_id text,
  ADD COLUMN IF NOT EXISTS meta_ad_account_name text,
  ADD COLUMN IF NOT EXISTS last_meta_ads_sync_at timestamptz;