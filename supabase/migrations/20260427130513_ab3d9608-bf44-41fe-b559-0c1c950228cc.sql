-- ANALYTICS
DROP POLICY IF EXISTS "Authenticated users can view analytics" ON public.analytics;

CREATE POLICY "Admins can view all analytics"
ON public.analytics FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Concierges can view assigned analytics"
ON public.analytics FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'concierge'::app_role)
  AND clinic_id IN (SELECT get_concierge_clinic_ids(auth.uid()))
);

CREATE POLICY "Clients can view own analytics"
ON public.analytics FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'client'::app_role)
  AND clinic_id IN (SELECT id FROM public.clinics WHERE owner_user_id = auth.uid())
);

-- CALENDAR SUBMISSIONS
DROP POLICY IF EXISTS "Authenticated users can view submissions" ON public.calendar_submissions;

CREATE POLICY "Admins can view all calendar submissions"
ON public.calendar_submissions FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Concierges can view assigned calendar submissions"
ON public.calendar_submissions FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'concierge'::app_role)
  AND clinic_id IN (SELECT get_concierge_clinic_ids(auth.uid()))
);

CREATE POLICY "Clients can view own calendar submissions"
ON public.calendar_submissions FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'client'::app_role)
  AND clinic_id IN (SELECT id FROM public.clinics WHERE owner_user_id = auth.uid())
);

-- CONTENT POSTS
DROP POLICY IF EXISTS "Authenticated users can view posts" ON public.content_posts;

CREATE POLICY "Admins can view all content posts"
ON public.content_posts FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Concierges can view assigned content posts"
ON public.content_posts FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'concierge'::app_role)
  AND clinic_id IN (SELECT get_concierge_clinic_ids(auth.uid()))
);

CREATE POLICY "Clients can view own content posts"
ON public.content_posts FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'client'::app_role)
  AND clinic_id IN (SELECT id FROM public.clinics WHERE owner_user_id = auth.uid())
);