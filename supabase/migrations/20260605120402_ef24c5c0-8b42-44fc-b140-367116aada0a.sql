-- 1. Wipe compromised Google Ads credentials
UPDATE public.clinic_api_credentials
SET google_ads_refresh_token = NULL,
    google_ads_customer_id = NULL,
    google_ads_login_customer_id = NULL,
    google_ads_account_name = NULL,
    last_google_sync_at = NULL;

-- 2. Clear any in-flight OAuth temp tokens
DELETE FROM public.oauth_temp_tokens WHERE provider IN ('google_ads', 'ga4');

-- 3. Security audit log
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  actor_user_id uuid,
  clinic_id uuid,
  ip text,
  user_agent text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_audit_log_created_idx ON public.security_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS security_audit_log_action_idx ON public.security_audit_log (action);
CREATE INDEX IF NOT EXISTS security_audit_log_actor_idx ON public.security_audit_log (actor_user_id);

GRANT SELECT ON public.security_audit_log TO authenticated;
GRANT ALL ON public.security_audit_log TO service_role;

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read security audit log"
ON public.security_audit_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));
