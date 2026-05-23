
-- ─────────── credentials table ───────────
CREATE TABLE public.clinic_ga4_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL UNIQUE REFERENCES public.clinics(id) ON DELETE CASCADE,
  ga4_property_id text,
  ga4_property_display_name text,
  ga4_account_display_name text,
  refresh_token_enc text,
  connected_by uuid REFERENCES auth.users(id),
  last_sync_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clinic_ga4_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ga4_creds_admin_all" ON public.clinic_ga4_credentials
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "ga4_creds_concierge_select" ON public.clinic_ga4_credentials
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'concierge'::public.app_role)
    AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  );

CREATE TRIGGER clinic_ga4_credentials_touch
  BEFORE UPDATE ON public.clinic_ga4_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────── daily traffic data ───────────
CREATE TABLE public.clinic_ga4_traffic_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  date date NOT NULL,
  channel_group text NOT NULL,
  sessions integer NOT NULL DEFAULT 0,
  engaged_sessions integer NOT NULL DEFAULT 0,
  engagement_rate numeric NOT NULL DEFAULT 0,
  avg_engagement_time_seconds numeric NOT NULL DEFAULT 0,
  events_per_session numeric NOT NULL DEFAULT 0,
  event_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, date, channel_group)
);

CREATE INDEX idx_ga4_traffic_clinic_date ON public.clinic_ga4_traffic_daily (clinic_id, date DESC);

ALTER TABLE public.clinic_ga4_traffic_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ga4_traffic_admin_all" ON public.clinic_ga4_traffic_daily
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "ga4_traffic_concierge_select" ON public.clinic_ga4_traffic_daily
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'concierge'::public.app_role)
    AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  );

CREATE POLICY "ga4_traffic_client_select" ON public.clinic_ga4_traffic_daily
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'client'::public.app_role)
    AND clinic_id IN (SELECT public.get_accessible_clinic_ids(auth.uid()))
  );

CREATE POLICY "ga4_traffic_subclient_select" ON public.clinic_ga4_traffic_daily
  FOR SELECT TO authenticated
  USING (
    public.is_sub_account(auth.uid())
    AND clinic_id IN (SELECT public.get_sub_account_clinic_ids(auth.uid()))
  );

CREATE TRIGGER clinic_ga4_traffic_daily_touch
  BEFORE UPDATE ON public.clinic_ga4_traffic_daily
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
