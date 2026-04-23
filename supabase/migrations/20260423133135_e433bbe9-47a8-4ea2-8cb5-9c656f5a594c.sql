-- Tighten seo_analytics SELECT policy
DROP POLICY IF EXISTS "Authenticated can view seo_analytics" ON public.seo_analytics;
DROP POLICY IF EXISTS "Authenticated users can view seo_analytics" ON public.seo_analytics;

CREATE POLICY "Admins can view seo_analytics"
ON public.seo_analytics FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Concierges can view assigned seo_analytics"
ON public.seo_analytics FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'concierge'::app_role)
  AND clinic_id IN (SELECT get_concierge_clinic_ids(auth.uid()))
);

CREATE POLICY "Clients can view own seo_analytics"
ON public.seo_analytics FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'client'::app_role)
  AND clinic_id IN (SELECT id FROM public.clinics WHERE owner_user_id = auth.uid())
);

-- Tighten website_pageviews SELECT policy
DROP POLICY IF EXISTS "Authenticated can view website_pageviews" ON public.website_pageviews;
DROP POLICY IF EXISTS "Authenticated users can view website_pageviews" ON public.website_pageviews;
DROP POLICY IF EXISTS "Authenticated users can view pageviews" ON public.website_pageviews;

CREATE POLICY "Admins can view website_pageviews"
ON public.website_pageviews FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Concierges can view assigned website_pageviews"
ON public.website_pageviews FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'concierge'::app_role)
  AND clinic_id IN (SELECT get_concierge_clinic_ids(auth.uid()))
);

CREATE POLICY "Clients can view own website_pageviews"
ON public.website_pageviews FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'client'::app_role)
  AND clinic_id IN (SELECT id FROM public.clinics WHERE owner_user_id = auth.uid())
);