
-- 1. clinic_partners table
CREATE TABLE IF NOT EXISTS public.clinic_partners (
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  PRIMARY KEY (clinic_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_clinic_partners_user ON public.clinic_partners(user_id);

ALTER TABLE public.clinic_partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage clinic_partners" ON public.clinic_partners;
CREATE POLICY "Admins manage clinic_partners" ON public.clinic_partners
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Partners view own partner rows" ON public.clinic_partners;
CREATE POLICY "Partners view own partner rows" ON public.clinic_partners
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- 2. Helpers
CREATE OR REPLACE FUNCTION public.get_partner_clinic_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT clinic_id FROM public.clinic_partners WHERE user_id = _user_id
$$;

-- Extend get_accessible_clinic_ids to include partner clinics
CREATE OR REPLACE FUNCTION public.get_accessible_clinic_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.clinics WHERE owner_user_id = _user_id
  UNION
  SELECT sac.clinic_id
  FROM public.sub_account_clinics sac
  JOIN public.client_sub_accounts csa ON csa.id = sac.sub_account_id
  WHERE csa.sub_user_id = _user_id
  UNION
  SELECT clinic_id FROM public.clinic_partners WHERE user_id = _user_id
$$;

-- 3. Partner mirror policies (full access mirroring owner/sub-account)

-- clinics
DROP POLICY IF EXISTS "Partners can view assigned clinics" ON public.clinics;
CREATE POLICY "Partners can view assigned clinics" ON public.clinics
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));

-- analytics
DROP POLICY IF EXISTS "Partners can view analytics" ON public.analytics;
CREATE POLICY "Partners can view analytics" ON public.analytics
  FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));

-- blog_client_submissions
DROP POLICY IF EXISTS "Partners can view blog_client_submissions" ON public.blog_client_submissions;
CREATE POLICY "Partners can view blog_client_submissions" ON public.blog_client_submissions
  FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));
DROP POLICY IF EXISTS "Partners can insert blog_client_submissions" ON public.blog_client_submissions;
CREATE POLICY "Partners can insert blog_client_submissions" ON public.blog_client_submissions
  FOR INSERT TO authenticated
  WITH CHECK (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));

-- blog_posts
DROP POLICY IF EXISTS "Partners can view blog_posts" ON public.blog_posts;
CREATE POLICY "Partners can view blog_posts" ON public.blog_posts
  FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));

-- blog_tracker
DROP POLICY IF EXISTS "Partners can view blog_tracker" ON public.blog_tracker;
CREATE POLICY "Partners can view blog_tracker" ON public.blog_tracker
  FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));

-- calendar_submissions
DROP POLICY IF EXISTS "Partners can view calendar_submissions" ON public.calendar_submissions;
CREATE POLICY "Partners can view calendar_submissions" ON public.calendar_submissions
  FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));

-- client_journey_steps
DROP POLICY IF EXISTS "Partners can view client_journey_steps" ON public.client_journey_steps;
CREATE POLICY "Partners can view client_journey_steps" ON public.client_journey_steps
  FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));

-- clinic_brand_dna
DROP POLICY IF EXISTS "Partners can view clinic_brand_dna" ON public.clinic_brand_dna;
CREATE POLICY "Partners can view clinic_brand_dna" ON public.clinic_brand_dna
  FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));
DROP POLICY IF EXISTS "Partners can insert clinic_brand_dna" ON public.clinic_brand_dna;
CREATE POLICY "Partners can insert clinic_brand_dna" ON public.clinic_brand_dna
  FOR INSERT TO authenticated
  WITH CHECK (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));
DROP POLICY IF EXISTS "Partners can update clinic_brand_dna" ON public.clinic_brand_dna;
CREATE POLICY "Partners can update clinic_brand_dna" ON public.clinic_brand_dna
  FOR UPDATE TO authenticated
  USING (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));

-- clinic_gbp_config
DROP POLICY IF EXISTS "Partners can view clinic_gbp_config" ON public.clinic_gbp_config;
CREATE POLICY "Partners can view clinic_gbp_config" ON public.clinic_gbp_config
  FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));

-- clinic_monthly_signals
DROP POLICY IF EXISTS "Partners can view clinic_monthly_signals" ON public.clinic_monthly_signals;
CREATE POLICY "Partners can view clinic_monthly_signals" ON public.clinic_monthly_signals
  FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));
DROP POLICY IF EXISTS "Partners can insert clinic_monthly_signals" ON public.clinic_monthly_signals;
CREATE POLICY "Partners can insert clinic_monthly_signals" ON public.clinic_monthly_signals
  FOR INSERT TO authenticated
  WITH CHECK (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));
DROP POLICY IF EXISTS "Partners can update clinic_monthly_signals" ON public.clinic_monthly_signals;
CREATE POLICY "Partners can update clinic_monthly_signals" ON public.clinic_monthly_signals
  FOR UPDATE TO authenticated
  USING (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));

-- clinic_promotions
DROP POLICY IF EXISTS "Partners can view clinic_promotions" ON public.clinic_promotions;
CREATE POLICY "Partners can view clinic_promotions" ON public.clinic_promotions
  FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));
DROP POLICY IF EXISTS "Partners can insert clinic_promotions" ON public.clinic_promotions;
CREATE POLICY "Partners can insert clinic_promotions" ON public.clinic_promotions
  FOR INSERT TO authenticated
  WITH CHECK (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));
DROP POLICY IF EXISTS "Partners can update clinic_promotions" ON public.clinic_promotions;
CREATE POLICY "Partners can update clinic_promotions" ON public.clinic_promotions
  FOR UPDATE TO authenticated
  USING (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));

-- content_calendar
DROP POLICY IF EXISTS "Partners can view content_calendar" ON public.content_calendar;
CREATE POLICY "Partners can view content_calendar" ON public.content_calendar
  FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));

-- content_posts
DROP POLICY IF EXISTS "Partners can view content_posts" ON public.content_posts;
CREATE POLICY "Partners can view content_posts" ON public.content_posts
  FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));

-- content_requests
DROP POLICY IF EXISTS "Partners can view content_requests" ON public.content_requests;
CREATE POLICY "Partners can view content_requests" ON public.content_requests
  FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));
DROP POLICY IF EXISTS "Partners can update content_requests" ON public.content_requests;
CREATE POLICY "Partners can update content_requests" ON public.content_requests
  FOR UPDATE TO authenticated
  USING (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));

-- content_versions
DROP POLICY IF EXISTS "Partners can view content_versions" ON public.content_versions;
CREATE POLICY "Partners can view content_versions" ON public.content_versions
  FOR SELECT TO authenticated
  USING (content_request_id IN (
    SELECT id FROM public.content_requests
    WHERE clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid())))
  ));
DROP POLICY IF EXISTS "Partners can update content_versions" ON public.content_versions;
CREATE POLICY "Partners can update content_versions" ON public.content_versions
  FOR UPDATE TO authenticated
  USING (content_request_id IN (
    SELECT id FROM public.content_requests
    WHERE clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid())))
  ));

-- department_tickets
DROP POLICY IF EXISTS "Partners can view tickets for assigned clinics" ON public.department_tickets;
CREATE POLICY "Partners can view tickets for assigned clinics" ON public.department_tickets
  FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));
DROP POLICY IF EXISTS "Partners can create tickets for assigned clinics" ON public.department_tickets;
CREATE POLICY "Partners can create tickets for assigned clinics" ON public.department_tickets
  FOR INSERT TO authenticated
  WITH CHECK (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))) AND created_by = (SELECT auth.uid()));

-- department_ticket_assignments
DROP POLICY IF EXISTS "Partners can view assignments for partnered clinic tickets" ON public.department_ticket_assignments;
CREATE POLICY "Partners can view assignments for partnered clinic tickets" ON public.department_ticket_assignments
  FOR SELECT TO authenticated
  USING (ticket_id IN (
    SELECT id FROM public.department_tickets
    WHERE clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid())))
  ));

-- ticket_assignees
DROP POLICY IF EXISTS "Partners can view ticket_assignees for partnered clinics" ON public.ticket_assignees;
CREATE POLICY "Partners can view ticket_assignees for partnered clinics" ON public.ticket_assignees
  FOR SELECT TO authenticated
  USING (ticket_id IN (
    SELECT id FROM public.department_tickets
    WHERE clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid())))
  ));

-- ticket_audit_log
DROP POLICY IF EXISTS "Partners can view ticket_audit_log for partnered clinics" ON public.ticket_audit_log;
CREATE POLICY "Partners can view ticket_audit_log for partnered clinics" ON public.ticket_audit_log
  FOR SELECT TO authenticated
  USING (ticket_id IN (
    SELECT id FROM public.department_tickets
    WHERE clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid())))
  ));

-- gbp_compliance_scans
DROP POLICY IF EXISTS "Partners can view gbp_compliance_scans" ON public.gbp_compliance_scans;
CREATE POLICY "Partners can view gbp_compliance_scans" ON public.gbp_compliance_scans
  FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));

-- gbp_post_history
DROP POLICY IF EXISTS "Partners can view gbp_post_history" ON public.gbp_post_history;
CREATE POLICY "Partners can view gbp_post_history" ON public.gbp_post_history
  FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));

-- gbp_recent_content
DROP POLICY IF EXISTS "Partners can view gbp_recent_content" ON public.gbp_recent_content;
CREATE POLICY "Partners can view gbp_recent_content" ON public.gbp_recent_content
  FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));

-- post_activity_log
DROP POLICY IF EXISTS "Partners can view post_activity_log" ON public.post_activity_log;
CREATE POLICY "Partners can view post_activity_log" ON public.post_activity_log
  FOR SELECT TO authenticated
  USING (post_id IN (
    SELECT id FROM public.content_posts
    WHERE clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid())))
  ));

-- seo_analytics
DROP POLICY IF EXISTS "Partners can view seo_analytics" ON public.seo_analytics;
CREATE POLICY "Partners can view seo_analytics" ON public.seo_analytics
  FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));

-- sm2_generations
DROP POLICY IF EXISTS "Partners can view sm2_generations" ON public.sm2_generations;
CREATE POLICY "Partners can view sm2_generations" ON public.sm2_generations
  FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));
DROP POLICY IF EXISTS "Partners can update sm2_generations" ON public.sm2_generations;
CREATE POLICY "Partners can update sm2_generations" ON public.sm2_generations
  FOR UPDATE TO authenticated
  USING (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));

-- sm2_post_performance
DROP POLICY IF EXISTS "Partners can view sm2_post_performance" ON public.sm2_post_performance;
CREATE POLICY "Partners can view sm2_post_performance" ON public.sm2_post_performance
  FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));

-- sm2_posts
DROP POLICY IF EXISTS "Partners can view sm2_posts" ON public.sm2_posts;
CREATE POLICY "Partners can view sm2_posts" ON public.sm2_posts
  FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));
DROP POLICY IF EXISTS "Partners can update sm2_posts" ON public.sm2_posts;
CREATE POLICY "Partners can update sm2_posts" ON public.sm2_posts
  FOR UPDATE TO authenticated
  USING (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));

-- website_pageviews
DROP POLICY IF EXISTS "Partners can view website_pageviews" ON public.website_pageviews;
CREATE POLICY "Partners can view website_pageviews" ON public.website_pageviews
  FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT public.get_partner_clinic_ids((SELECT auth.uid()))));
