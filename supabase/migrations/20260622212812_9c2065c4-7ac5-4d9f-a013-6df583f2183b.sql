
-- Add sub-account SELECT policies mirroring client access for assigned clinics

CREATE POLICY "Sub-accounts can view website_pageviews"
ON public.website_pageviews FOR SELECT TO authenticated
USING (clinic_id IN (SELECT public.get_sub_account_clinic_ids(auth.uid())));

CREATE POLICY "Sub-accounts can view sm2_post_performance"
ON public.sm2_post_performance FOR SELECT TO authenticated
USING (clinic_id IN (SELECT public.get_sub_account_clinic_ids(auth.uid())));

CREATE POLICY "Sub-accounts can view clinic_gbp_config"
ON public.clinic_gbp_config FOR SELECT TO authenticated
USING (clinic_id IN (SELECT public.get_sub_account_clinic_ids(auth.uid())));

CREATE POLICY "Sub-accounts can view gbp_post_history"
ON public.gbp_post_history FOR SELECT TO authenticated
USING (clinic_id IN (SELECT public.get_sub_account_clinic_ids(auth.uid())));

CREATE POLICY "Sub-accounts can view gbp_compliance_scans"
ON public.gbp_compliance_scans FOR SELECT TO authenticated
USING (clinic_id IN (SELECT public.get_sub_account_clinic_ids(auth.uid())));

CREATE POLICY "Sub-accounts can view gbp_recent_content"
ON public.gbp_recent_content FOR SELECT TO authenticated
USING (clinic_id IN (SELECT public.get_sub_account_clinic_ids(auth.uid())));

CREATE POLICY "Sub-accounts can view clinic_monthly_signals"
ON public.clinic_monthly_signals FOR SELECT TO authenticated
USING (clinic_id IN (SELECT public.get_sub_account_clinic_ids(auth.uid())));

CREATE POLICY "Sub-accounts can view clinic_promotions"
ON public.clinic_promotions FOR SELECT TO authenticated
USING (clinic_id IN (SELECT public.get_sub_account_clinic_ids(auth.uid())));

CREATE POLICY "Sub-accounts can view content_calendar"
ON public.content_calendar FOR SELECT TO authenticated
USING (clinic_id IN (SELECT public.get_sub_account_clinic_ids(auth.uid())));

CREATE POLICY "Sub-accounts can view content_requests"
ON public.content_requests FOR SELECT TO authenticated
USING (
  status = ANY (ARRAY['admin_approved','client_selected','final_approved'])
  AND clinic_id IN (SELECT public.get_sub_account_clinic_ids(auth.uid()))
);

CREATE POLICY "Sub-accounts can view content_versions"
ON public.content_versions FOR SELECT TO authenticated
USING (
  content_request_id IN (
    SELECT id FROM public.content_requests
    WHERE status = ANY (ARRAY['admin_approved','client_approved'])
      AND clinic_id IN (SELECT public.get_sub_account_clinic_ids(auth.uid()))
  )
);

CREATE POLICY "Sub-accounts can view post_activity_log"
ON public.post_activity_log FOR SELECT TO authenticated
USING (
  post_id IN (
    SELECT id FROM public.sm2_posts
    WHERE clinic_id IN (SELECT public.get_sub_account_clinic_ids(auth.uid()))
  )
);

CREATE POLICY "Sub-accounts can view ticket_assignees"
ON public.ticket_assignees FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.department_tickets t
    WHERE t.id = ticket_assignees.ticket_id
      AND t.clinic_id IN (SELECT public.get_sub_account_clinic_ids(auth.uid()))
  )
);

CREATE POLICY "Sub-accounts can view department_ticket_assignments"
ON public.department_ticket_assignments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.department_tickets t
    WHERE t.id = department_ticket_assignments.ticket_id
      AND t.clinic_id IN (SELECT public.get_sub_account_clinic_ids(auth.uid()))
  )
);

CREATE POLICY "Sub-accounts can view ticket_audit_log"
ON public.ticket_audit_log FOR SELECT TO authenticated
USING (
  ticket_id IN (
    SELECT id FROM public.department_tickets
    WHERE clinic_id IN (SELECT public.get_sub_account_clinic_ids(auth.uid()))
  )
);

CREATE POLICY "Sub-accounts can view blog_tracker"
ON public.blog_tracker FOR SELECT TO authenticated
USING (clinic_id IN (SELECT public.get_sub_account_clinic_ids(auth.uid())));

CREATE POLICY "Sub-accounts can view client_journey_steps"
ON public.client_journey_steps FOR SELECT TO authenticated
USING (clinic_id IN (SELECT public.get_sub_account_clinic_ids(auth.uid())));
