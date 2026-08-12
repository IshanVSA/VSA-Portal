
DROP POLICY IF EXISTS ga4_traffic_partner_select ON public.clinic_ga4_traffic_daily;
CREATE POLICY ga4_traffic_partner_select ON public.clinic_ga4_traffic_daily FOR SELECT TO authenticated
USING (clinic_id IN (SELECT public.get_partner_clinic_ids(auth.uid())));

DROP POLICY IF EXISTS ga4_cta_partner_select ON public.clinic_ga4_cta_daily;
CREATE POLICY ga4_cta_partner_select ON public.clinic_ga4_cta_daily FOR SELECT TO authenticated
USING (clinic_id IN (SELECT public.get_partner_clinic_ids(auth.uid())));

DROP POLICY IF EXISTS gsc_daily_partner_select ON public.clinic_gsc_daily;
CREATE POLICY gsc_daily_partner_select ON public.clinic_gsc_daily FOR SELECT TO authenticated
USING (clinic_id IN (SELECT public.get_partner_clinic_ids(auth.uid())));

DROP POLICY IF EXISTS gbp_perf_partner_select ON public.clinic_gbp_performance_daily;
CREATE POLICY gbp_perf_partner_select ON public.clinic_gbp_performance_daily FOR SELECT TO authenticated
USING (clinic_id IN (SELECT public.get_partner_clinic_ids(auth.uid())));

GRANT SELECT ON public.clinic_ga4_traffic_daily, public.clinic_ga4_cta_daily, public.clinic_gsc_daily, public.clinic_gbp_performance_daily TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_clinic_analytics_connection(uuid) TO authenticated;
