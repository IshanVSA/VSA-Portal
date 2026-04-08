
-- Helper function: check if user is a team member of a clinic
CREATE OR REPLACE FUNCTION public.is_clinic_team_member(_user_id uuid, _clinic_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinic_team_members
    WHERE user_id = _user_id AND clinic_id = _clinic_id
  )
$$;

-- Helper function: get all clinic IDs a concierge can access (via assigned_concierge_id OR clinic_team_members)
CREATE OR REPLACE FUNCTION public.get_concierge_clinic_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.clinics WHERE assigned_concierge_id = _user_id
  UNION
  SELECT clinic_id FROM public.clinic_team_members WHERE user_id = _user_id
$$;

-- ==========================================
-- CLINICS table
-- ==========================================
DROP POLICY IF EXISTS "Concierges can view assigned clinics" ON public.clinics;
CREATE POLICY "Concierges can view assigned clinics"
  ON public.clinics FOR SELECT TO public
  USING (
    has_role(auth.uid(), 'concierge'::app_role)
    AND (
      assigned_concierge_id = auth.uid()
      OR id IN (SELECT clinic_id FROM public.clinic_team_members WHERE user_id = auth.uid())
    )
  );

-- ==========================================
-- CLINIC_BRAND_DNA table
-- ==========================================
DROP POLICY IF EXISTS "Concierges can view clinic_brand_dna" ON public.clinic_brand_dna;
CREATE POLICY "Concierges can view clinic_brand_dna"
  ON public.clinic_brand_dna FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'concierge'::app_role)
    AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "Concierges can insert clinic_brand_dna" ON public.clinic_brand_dna;
CREATE POLICY "Concierges can insert clinic_brand_dna"
  ON public.clinic_brand_dna FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'concierge'::app_role)
    AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "Concierges can update clinic_brand_dna" ON public.clinic_brand_dna;
CREATE POLICY "Concierges can update clinic_brand_dna"
  ON public.clinic_brand_dna FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'concierge'::app_role)
    AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  );

-- ==========================================
-- CLINIC_MONTHLY_SIGNALS table
-- ==========================================
DROP POLICY IF EXISTS "Concierges can view clinic_monthly_signals" ON public.clinic_monthly_signals;
CREATE POLICY "Concierges can view clinic_monthly_signals"
  ON public.clinic_monthly_signals FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'concierge'::app_role)
    AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "Concierges can insert clinic_monthly_signals" ON public.clinic_monthly_signals;
CREATE POLICY "Concierges can insert clinic_monthly_signals"
  ON public.clinic_monthly_signals FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'concierge'::app_role)
    AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "Concierges can update clinic_monthly_signals" ON public.clinic_monthly_signals;
CREATE POLICY "Concierges can update clinic_monthly_signals"
  ON public.clinic_monthly_signals FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'concierge'::app_role)
    AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  );

-- ==========================================
-- CLINIC_PROMOTIONS table
-- ==========================================
DROP POLICY IF EXISTS "Concierges can manage clinic_promotions" ON public.clinic_promotions;
CREATE POLICY "Concierges can manage clinic_promotions"
  ON public.clinic_promotions FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'concierge'::app_role)
    AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  )
  WITH CHECK (
    has_role(auth.uid(), 'concierge'::app_role)
    AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "Concierges can view clinic_promotions" ON public.clinic_promotions;
CREATE POLICY "Concierges can view clinic_promotions"
  ON public.clinic_promotions FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'concierge'::app_role)
    AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  );

-- ==========================================
-- SM2_GENERATIONS table
-- ==========================================
DROP POLICY IF EXISTS "Concierges can view sm2_generations" ON public.sm2_generations;
CREATE POLICY "Concierges can view sm2_generations"
  ON public.sm2_generations FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'concierge'::app_role)
    AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "Concierges can insert sm2_generations" ON public.sm2_generations;
CREATE POLICY "Concierges can insert sm2_generations"
  ON public.sm2_generations FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'concierge'::app_role)
    AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "Concierges can update sm2_generations" ON public.sm2_generations;
CREATE POLICY "Concierges can update sm2_generations"
  ON public.sm2_generations FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'concierge'::app_role)
    AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  );

-- ==========================================
-- CONTENT_REQUESTS table
-- ==========================================
DROP POLICY IF EXISTS "Concierges can view own content_requests" ON public.content_requests;
CREATE POLICY "Concierges can view own content_requests"
  ON public.content_requests FOR SELECT TO public
  USING (
    has_role(auth.uid(), 'concierge'::app_role)
    AND (
      created_by_concierge_id = auth.uid()
      OR clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
    )
  );

-- ==========================================
-- CONTENT_CALENDAR table
-- ==========================================
DROP POLICY IF EXISTS "Concierges can view content_calendar" ON public.content_calendar;
CREATE POLICY "Concierges can view content_calendar"
  ON public.content_calendar FOR SELECT TO public
  USING (
    has_role(auth.uid(), 'concierge'::app_role)
    AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "Concierges can update content_calendar" ON public.content_calendar;
CREATE POLICY "Concierges can update content_calendar"
  ON public.content_calendar FOR UPDATE TO public
  USING (
    has_role(auth.uid(), 'concierge'::app_role)
    AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  );

-- ==========================================
-- CLINIC_GBP_CONFIG table
-- ==========================================
DROP POLICY IF EXISTS "Concierges can view clinic_gbp_config" ON public.clinic_gbp_config;
CREATE POLICY "Concierges can view clinic_gbp_config"
  ON public.clinic_gbp_config FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'concierge'::app_role)
    AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "Concierges can insert clinic_gbp_config" ON public.clinic_gbp_config;
CREATE POLICY "Concierges can insert clinic_gbp_config"
  ON public.clinic_gbp_config FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'concierge'::app_role)
    AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "Concierges can update clinic_gbp_config" ON public.clinic_gbp_config;
CREATE POLICY "Concierges can update clinic_gbp_config"
  ON public.clinic_gbp_config FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'concierge'::app_role)
    AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  );

-- ==========================================
-- GBP_POST_HISTORY table
-- ==========================================
DROP POLICY IF EXISTS "Concierges can view gbp_post_history" ON public.gbp_post_history;
CREATE POLICY "Concierges can view gbp_post_history"
  ON public.gbp_post_history FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'concierge'::app_role)
    AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "Concierges can insert gbp_post_history" ON public.gbp_post_history;
CREATE POLICY "Concierges can insert gbp_post_history"
  ON public.gbp_post_history FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'concierge'::app_role)
    AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "Concierges can update gbp_post_history" ON public.gbp_post_history;
CREATE POLICY "Concierges can update gbp_post_history"
  ON public.gbp_post_history FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'concierge'::app_role)
    AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  );

-- ==========================================
-- GBP_COMPLIANCE_SCANS table
-- ==========================================
DROP POLICY IF EXISTS "Concierges can view gbp_compliance_scans" ON public.gbp_compliance_scans;
CREATE POLICY "Concierges can view gbp_compliance_scans"
  ON public.gbp_compliance_scans FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'concierge'::app_role)
    AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "Concierges can insert gbp_compliance_scans" ON public.gbp_compliance_scans;
CREATE POLICY "Concierges can insert gbp_compliance_scans"
  ON public.gbp_compliance_scans FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'concierge'::app_role)
    AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  );

-- ==========================================
-- GBP_RECENT_CONTENT table
-- ==========================================
DROP POLICY IF EXISTS "Concierges can view gbp_recent_content" ON public.gbp_recent_content;
CREATE POLICY "Concierges can view gbp_recent_content"
  ON public.gbp_recent_content FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'concierge'::app_role)
    AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "Concierges can insert gbp_recent_content" ON public.gbp_recent_content;
CREATE POLICY "Concierges can insert gbp_recent_content"
  ON public.gbp_recent_content FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'concierge'::app_role)
    AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  );
