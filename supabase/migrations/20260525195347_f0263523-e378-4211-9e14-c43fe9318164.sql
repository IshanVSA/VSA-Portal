
CREATE TABLE IF NOT EXISTS public.clinic_ga4_cta_daily (
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  date date NOT NULL,
  cta_type text NOT NULL,
  event_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, date, cta_type)
);

CREATE INDEX IF NOT EXISTS idx_ga4_cta_clinic_date ON public.clinic_ga4_cta_daily (clinic_id, date);

ALTER TABLE public.clinic_ga4_cta_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY ga4_cta_admin_all ON public.clinic_ga4_cta_daily
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY ga4_cta_concierge_select ON public.clinic_ga4_cta_daily
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'concierge'::app_role) AND clinic_id IN (SELECT get_concierge_clinic_ids(auth.uid())));

CREATE POLICY ga4_cta_client_select ON public.clinic_ga4_cta_daily
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'client'::app_role) AND clinic_id IN (SELECT get_accessible_clinic_ids(auth.uid())));

CREATE POLICY ga4_cta_subclient_select ON public.clinic_ga4_cta_daily
  FOR SELECT TO authenticated
  USING (is_sub_account(auth.uid()) AND clinic_id IN (SELECT get_sub_account_clinic_ids(auth.uid())));
