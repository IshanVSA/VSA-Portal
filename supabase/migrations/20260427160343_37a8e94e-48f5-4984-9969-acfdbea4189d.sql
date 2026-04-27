DROP POLICY IF EXISTS "Authenticated can view activity log" ON public.post_activity_log;

CREATE POLICY "Admins can view all activity log"
ON public.post_activity_log FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Concierges can view assigned activity log"
ON public.post_activity_log FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'concierge'::app_role)
  AND post_id IN (
    SELECT id FROM public.sm2_posts
    WHERE clinic_id IN (SELECT get_concierge_clinic_ids(auth.uid()))
  )
);

CREATE POLICY "Clients can view own clinic activity log"
ON public.post_activity_log FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'client'::app_role)
  AND post_id IN (
    SELECT id FROM public.sm2_posts
    WHERE clinic_id IN (SELECT id FROM public.clinics WHERE owner_user_id = auth.uid())
  )
);