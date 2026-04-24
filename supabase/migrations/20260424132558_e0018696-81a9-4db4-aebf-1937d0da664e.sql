CREATE OR REPLACE FUNCTION public.delete_clinic_by_id(_clinic_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  _deleted_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins can delete clinics';
  END IF;

  IF _clinic_id IS NULL THEN
    RAISE EXCEPTION 'Clinic ID is required';
  END IF;

  DELETE FROM public.compliance_override_log WHERE clinic_id = _clinic_id;
  DELETE FROM public.post_activity_log WHERE post_id IN (SELECT id FROM public.content_posts WHERE clinic_id = _clinic_id);
  DELETE FROM public.post_comments WHERE post_id IN (SELECT id FROM public.content_posts WHERE clinic_id = _clinic_id);
  DELETE FROM public.post_workflow WHERE post_id IN (SELECT id FROM public.content_posts WHERE clinic_id = _clinic_id);
  DELETE FROM public.content_calendar WHERE content_request_id IN (SELECT id FROM public.content_requests WHERE clinic_id = _clinic_id);
  DELETE FROM public.content_versions WHERE content_request_id IN (SELECT id FROM public.content_requests WHERE clinic_id = _clinic_id);
  DELETE FROM public.content_calendar WHERE clinic_id = _clinic_id;
  DELETE FROM public.content_posts WHERE clinic_id = _clinic_id;
  DELETE FROM public.content_requests WHERE clinic_id = _clinic_id;
  DELETE FROM public.ticket_audit_log WHERE ticket_id IN (SELECT id FROM public.department_tickets WHERE clinic_id = _clinic_id);
  DELETE FROM public.ticket_assignees WHERE ticket_id IN (SELECT id FROM public.department_tickets WHERE clinic_id = _clinic_id);
  DELETE FROM public.department_ticket_assignments WHERE ticket_id IN (SELECT id FROM public.department_tickets WHERE clinic_id = _clinic_id);
  DELETE FROM public.department_tickets WHERE clinic_id = _clinic_id;
  DELETE FROM public.department_chat_reads WHERE clinic_id = _clinic_id;
  DELETE FROM public.department_chats WHERE clinic_id = _clinic_id;
  DELETE FROM public.sm2_post_performance WHERE generation_id IN (SELECT id FROM public.sm2_generations WHERE clinic_id = _clinic_id);
  DELETE FROM public.sm2_posts WHERE generation_id IN (SELECT id FROM public.sm2_generations WHERE clinic_id = _clinic_id) OR clinic_id = _clinic_id;
  DELETE FROM public.sm2_generations WHERE clinic_id = _clinic_id;
  DELETE FROM public.analytics WHERE clinic_id = _clinic_id;
  DELETE FROM public.blog_client_submissions WHERE clinic_id = _clinic_id;
  DELETE FROM public.blog_posts WHERE clinic_id = _clinic_id;
  DELETE FROM public.blog_tracker WHERE clinic_id = _clinic_id;
  DELETE FROM public.calendar_submissions WHERE clinic_id = _clinic_id;
  DELETE FROM public.client_journey_steps WHERE clinic_id = _clinic_id;
  DELETE FROM public.clinic_api_credentials WHERE clinic_id = _clinic_id;
  DELETE FROM public.clinic_brand_dna WHERE clinic_id = _clinic_id;
  DELETE FROM public.clinic_gbp_config WHERE clinic_id = _clinic_id;
  DELETE FROM public.clinic_monthly_signals WHERE clinic_id = _clinic_id;
  DELETE FROM public.clinic_promotions WHERE clinic_id = _clinic_id;
  DELETE FROM public.clinic_team_members WHERE clinic_id = _clinic_id;
  DELETE FROM public.gbp_compliance_scans WHERE clinic_id = _clinic_id;
  DELETE FROM public.gbp_post_history WHERE clinic_id = _clinic_id;
  DELETE FROM public.gbp_recent_content WHERE clinic_id = _clinic_id;
  DELETE FROM public.oauth_temp_tokens WHERE clinic_id = _clinic_id;
  DELETE FROM public.pagespeed_scores WHERE clinic_id = _clinic_id;
  DELETE FROM public.seo_analytics WHERE clinic_id = _clinic_id;
  DELETE FROM public.sm2_post_performance WHERE clinic_id = _clinic_id;
  DELETE FROM public.website_pageviews WHERE clinic_id = _clinic_id;

  DELETE FROM public.clinics WHERE id = _clinic_id;

  GET DIAGNOSTICS _deleted_count = ROW_COUNT;

  IF _deleted_count = 0 THEN
    RAISE EXCEPTION 'Clinic not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_clinic_by_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_clinic_by_id(uuid) TO authenticated;