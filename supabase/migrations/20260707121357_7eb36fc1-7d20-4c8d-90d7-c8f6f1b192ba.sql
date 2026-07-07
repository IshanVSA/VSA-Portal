
-- ─── credentials table ───
CREATE TABLE public.clinic_gsc_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL UNIQUE REFERENCES public.clinics(id) ON DELETE CASCADE,
  site_url text,
  site_display_name text,
  permission_level text,
  refresh_token_enc text,
  connected_by uuid REFERENCES auth.users(id),
  last_sync_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_gsc_credentials TO authenticated;
GRANT ALL ON public.clinic_gsc_credentials TO service_role;

ALTER TABLE public.clinic_gsc_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gsc_creds_admin_all" ON public.clinic_gsc_credentials
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "gsc_creds_concierge_select" ON public.clinic_gsc_credentials
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'concierge'::public.app_role)
    AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  );

CREATE TRIGGER clinic_gsc_credentials_touch
  BEFORE UPDATE ON public.clinic_gsc_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── daily GSC data ───
-- One row per (clinic, date, bucket_type, bucket_value).
-- bucket_type ∈ ('total','query','page','country','device').
CREATE TABLE public.clinic_gsc_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  date date NOT NULL,
  bucket_type text NOT NULL,
  bucket_value text NOT NULL DEFAULT '',
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  ctr numeric NOT NULL DEFAULT 0,
  position numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, date, bucket_type, bucket_value)
);

CREATE INDEX idx_gsc_daily_clinic_date ON public.clinic_gsc_daily (clinic_id, date DESC);
CREATE INDEX idx_gsc_daily_clinic_bucket ON public.clinic_gsc_daily (clinic_id, bucket_type, date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_gsc_daily TO authenticated;
GRANT ALL ON public.clinic_gsc_daily TO service_role;

ALTER TABLE public.clinic_gsc_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gsc_daily_admin_all" ON public.clinic_gsc_daily
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "gsc_daily_concierge_select" ON public.clinic_gsc_daily
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'concierge'::public.app_role)
    AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  );

CREATE POLICY "gsc_daily_client_select" ON public.clinic_gsc_daily
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'client'::public.app_role)
    AND clinic_id IN (SELECT public.get_accessible_clinic_ids(auth.uid()))
  );

CREATE POLICY "gsc_daily_subclient_select" ON public.clinic_gsc_daily
  FOR SELECT TO authenticated
  USING (
    public.is_sub_account(auth.uid())
    AND clinic_id IN (SELECT public.get_sub_account_clinic_ids(auth.uid()))
  );

CREATE TRIGGER clinic_gsc_daily_touch
  BEFORE UPDATE ON public.clinic_gsc_daily
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
