
-- Extend clinic_api_credentials with GBP connection fields
ALTER TABLE public.clinic_api_credentials
  ADD COLUMN IF NOT EXISTS gbp_refresh_token text,
  ADD COLUMN IF NOT EXISTS gbp_account_id text,
  ADD COLUMN IF NOT EXISTS gbp_location_id text,
  ADD COLUMN IF NOT EXISTS gbp_location_name text,
  ADD COLUMN IF NOT EXISTS gbp_connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_gbp_sync_at timestamptz;

-- Extend gbp_post_history with publishing state
ALTER TABLE public.gbp_post_history
  ADD COLUMN IF NOT EXISTS scheduled_publish_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS gbp_post_resource_name text,
  ADD COLUMN IF NOT EXISTS publish_error text,
  ADD COLUMN IF NOT EXISTS publish_attempts integer NOT NULL DEFAULT 0;

-- Index to speed up the cron worker lookup
CREATE INDEX IF NOT EXISTS idx_gbp_post_history_scheduled
  ON public.gbp_post_history (status, scheduled_publish_at)
  WHERE status = 'scheduled';

-- Enable required extensions for cron
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
