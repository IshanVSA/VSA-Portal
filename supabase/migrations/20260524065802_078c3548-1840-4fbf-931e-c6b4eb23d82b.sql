
-- ============================================================================
-- Google Search Console
-- ============================================================================

CREATE TABLE public.clinic_gsc_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL UNIQUE REFERENCES public.clinics(id) ON DELETE CASCADE,
  site_url TEXT,
  site_display_name TEXT,
  refresh_token_enc TEXT,
  connected_by UUID,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.clinic_gsc_daily (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  ctr NUMERIC NOT NULL DEFAULT 0,
  position NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, date)
);
CREATE INDEX idx_gsc_daily_clinic_date ON public.clinic_gsc_daily(clinic_id, date DESC);

CREATE TABLE public.clinic_gsc_queries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  window_start DATE NOT NULL,
  window_end DATE NOT NULL,
  query TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  ctr NUMERIC NOT NULL DEFAULT 0,
  position NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_gsc_queries_clinic_window ON public.clinic_gsc_queries(clinic_id, window_end DESC);

CREATE TABLE public.clinic_gsc_pages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  window_start DATE NOT NULL,
  window_end DATE NOT NULL,
  page TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  ctr NUMERIC NOT NULL DEFAULT 0,
  position NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_gsc_pages_clinic_window ON public.clinic_gsc_pages(clinic_id, window_end DESC);

-- updated_at trigger for credentials
CREATE TRIGGER trg_gsc_creds_updated
  BEFORE UPDATE ON public.clinic_gsc_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.clinic_gsc_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_gsc_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_gsc_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_gsc_pages ENABLE ROW LEVEL SECURITY;

-- Credentials: admin full, concierge select for their clinics
CREATE POLICY gsc_creds_admin_all ON public.clinic_gsc_credentials
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY gsc_creds_concierge_select ON public.clinic_gsc_credentials
  FOR SELECT USING (has_role(auth.uid(), 'concierge'::app_role) AND clinic_id IN (SELECT get_concierge_clinic_ids(auth.uid())));

-- Performance tables: admin full, concierge select, client+sub-account select for accessible clinics
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['clinic_gsc_daily','clinic_gsc_queries','clinic_gsc_pages']) LOOP
    EXECUTE format('CREATE POLICY %I_admin_all ON public.%I FOR ALL USING (has_role(auth.uid(), ''admin''::app_role));', t, t);
    EXECUTE format('CREATE POLICY %I_concierge_select ON public.%I FOR SELECT USING (has_role(auth.uid(), ''concierge''::app_role) AND clinic_id IN (SELECT get_concierge_clinic_ids(auth.uid())));', t, t);
    EXECUTE format('CREATE POLICY %I_client_select ON public.%I FOR SELECT USING (has_role(auth.uid(), ''client''::app_role) AND clinic_id IN (SELECT get_accessible_clinic_ids(auth.uid())));', t, t);
    EXECUTE format('CREATE POLICY %I_subclient_select ON public.%I FOR SELECT USING (is_sub_account(auth.uid()) AND clinic_id IN (SELECT get_sub_account_clinic_ids(auth.uid())));', t, t);
  END LOOP;
END $$;

-- ============================================================================
-- Google Business Profile performance
-- ============================================================================

CREATE TABLE public.clinic_gbp_performance_daily (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL,
  date DATE NOT NULL,
  business_impressions_desktop_maps INTEGER NOT NULL DEFAULT 0,
  business_impressions_desktop_search INTEGER NOT NULL DEFAULT 0,
  business_impressions_mobile_maps INTEGER NOT NULL DEFAULT 0,
  business_impressions_mobile_search INTEGER NOT NULL DEFAULT 0,
  call_clicks INTEGER NOT NULL DEFAULT 0,
  website_clicks INTEGER NOT NULL DEFAULT 0,
  business_direction_requests INTEGER NOT NULL DEFAULT 0,
  business_bookings INTEGER NOT NULL DEFAULT 0,
  business_conversations INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, location_id, date)
);
CREATE INDEX idx_gbp_perf_clinic_date ON public.clinic_gbp_performance_daily(clinic_id, date DESC);

-- Track GBP performance sync status on existing credentials table
ALTER TABLE public.clinic_api_credentials
  ADD COLUMN IF NOT EXISTS gbp_perf_last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gbp_perf_last_sync_status TEXT,
  ADD COLUMN IF NOT EXISTS gbp_perf_last_sync_error TEXT;

ALTER TABLE public.clinic_gbp_performance_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY gbp_perf_admin_all ON public.clinic_gbp_performance_daily
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY gbp_perf_concierge_select ON public.clinic_gbp_performance_daily
  FOR SELECT USING (has_role(auth.uid(), 'concierge'::app_role) AND clinic_id IN (SELECT get_concierge_clinic_ids(auth.uid())));
CREATE POLICY gbp_perf_client_select ON public.clinic_gbp_performance_daily
  FOR SELECT USING (has_role(auth.uid(), 'client'::app_role) AND clinic_id IN (SELECT get_accessible_clinic_ids(auth.uid())));
CREATE POLICY gbp_perf_subclient_select ON public.clinic_gbp_performance_daily
  FOR SELECT USING (is_sub_account(auth.uid()) AND clinic_id IN (SELECT get_sub_account_clinic_ids(auth.uid())));
