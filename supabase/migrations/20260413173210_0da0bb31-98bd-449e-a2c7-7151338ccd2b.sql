
-- blog_prompt_versions: versioned system prompt storage
CREATE TABLE public.blog_prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_label text NOT NULL,
  prompt_text text NOT NULL,
  is_current boolean NOT NULL DEFAULT false,
  approved_by uuid,
  approved_date timestamptz,
  change_notes text,
  generation_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.blog_prompt_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on blog_prompt_versions"
  ON public.blog_prompt_versions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can view blog_prompt_versions"
  ON public.blog_prompt_versions FOR SELECT TO authenticated
  USING (true);

-- blog_posts: one record per monthly generation run per clinic
CREATE TABLE public.blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  generation_type text NOT NULL DEFAULT 'SCHEDULED',
  generation_date timestamptz NOT NULL DEFAULT now(),
  blog_month_count integer NOT NULL DEFAULT 1,
  prompt_version_id uuid REFERENCES public.blog_prompt_versions(id),
  token_count_input integer,
  token_count_output integer,
  hospital_type_detected text,
  jurisdiction_detected text,
  governing_body_applied text,
  spelling_mode text DEFAULT 'US',
  -- Blog 1
  blog_1_type text,
  blog_1_slot text,
  blog_1_topic text,
  blog_1_slug text,
  blog_1_url text,
  blog_1_status text NOT NULL DEFAULT 'PENDING',
  blog_1_confirmed boolean NOT NULL DEFAULT false,
  -- Blog 2
  blog_2_type text,
  blog_2_slot text,
  blog_2_topic text,
  blog_2_slug text,
  blog_2_url text,
  blog_2_status text NOT NULL DEFAULT 'PENDING',
  blog_2_confirmed boolean NOT NULL DEFAULT false,
  -- Blog 3
  blog_3_type text,
  blog_3_slot text,
  blog_3_topic text,
  blog_3_slug text,
  blog_3_url text,
  blog_3_status text NOT NULL DEFAULT 'PENDING',
  blog_3_confirmed boolean NOT NULL DEFAULT false,
  -- QA
  qa_status text NOT NULL DEFAULT 'PENDING',
  qa_issues jsonb DEFAULT '[]'::jsonb,
  type_mismatch_flagged boolean NOT NULL DEFAULT false,
  duplicate_risk_flagged boolean NOT NULL DEFAULT false,
  active_hazards jsonb DEFAULT '[]'::jsonb,
  high_alert_hazards jsonb DEFAULT '[]'::jsonb,
  unverified_fields jsonb DEFAULT '[]'::jsonb,
  -- Generation
  generation_status text NOT NULL DEFAULT 'pending',
  remark_round integer NOT NULL DEFAULT 0,
  approval_type text,
  approval_timestamp timestamptz,
  verification_complete boolean NOT NULL DEFAULT false,
  -- Image/publish
  image_filename_1 text,
  image_filename_2 text,
  image_filename_3 text,
  publish_date_1 date,
  publish_date_2 date,
  publish_date_3 date,
  raw_output_text text,
  marked_published_by uuid,
  marked_published_at timestamptz,
  sitemap_ping_sent boolean NOT NULL DEFAULT false,
  emergency_topic text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on blog_posts"
  ON public.blog_posts FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Concierges can view blog_posts"
  ON public.blog_posts FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'concierge'::app_role) AND clinic_id IN (SELECT get_concierge_clinic_ids(auth.uid())));

CREATE POLICY "Concierges can insert blog_posts"
  ON public.blog_posts FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'concierge'::app_role) AND clinic_id IN (SELECT get_concierge_clinic_ids(auth.uid())));

CREATE POLICY "Concierges can update blog_posts"
  ON public.blog_posts FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'concierge'::app_role) AND clinic_id IN (SELECT get_concierge_clinic_ids(auth.uid())));

CREATE POLICY "Clients can view own blog_posts"
  ON public.blog_posts FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'client'::app_role) AND clinic_id IN (SELECT id FROM public.clinics WHERE owner_user_id = auth.uid()));

-- blog_tracker: running history per clinic
CREATE TABLE public.blog_tracker (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL UNIQUE REFERENCES public.clinics(id) ON DELETE CASCADE,
  month_count integer NOT NULL DEFAULT 0,
  published_slugs jsonb NOT NULL DEFAULT '[]'::jsonb,
  cluster_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_updated timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.blog_tracker ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on blog_tracker"
  ON public.blog_tracker FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Concierges can view blog_tracker"
  ON public.blog_tracker FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'concierge'::app_role) AND clinic_id IN (SELECT get_concierge_clinic_ids(auth.uid())));

CREATE POLICY "Concierges can insert blog_tracker"
  ON public.blog_tracker FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'concierge'::app_role) AND clinic_id IN (SELECT get_concierge_clinic_ids(auth.uid())));

CREATE POLICY "Concierges can update blog_tracker"
  ON public.blog_tracker FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'concierge'::app_role) AND clinic_id IN (SELECT get_concierge_clinic_ids(auth.uid())));

CREATE POLICY "Clients can view own blog_tracker"
  ON public.blog_tracker FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'client'::app_role) AND clinic_id IN (SELECT id FROM public.clinics WHERE owner_user_id = auth.uid()));

-- blog_client_submissions: client topic/content submissions
CREATE TABLE public.blog_client_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  submission_type text NOT NULL DEFAULT 'topic',
  submission_month integer,
  submission_year integer,
  content_text text NOT NULL,
  compliance_scan_result jsonb,
  approved_by uuid,
  approved_date timestamptz,
  fed_into_generation boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.blog_client_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on blog_client_submissions"
  ON public.blog_client_submissions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Concierges can manage blog_client_submissions"
  ON public.blog_client_submissions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'concierge'::app_role) AND clinic_id IN (SELECT get_concierge_clinic_ids(auth.uid())))
  WITH CHECK (has_role(auth.uid(), 'concierge'::app_role) AND clinic_id IN (SELECT get_concierge_clinic_ids(auth.uid())));

CREATE POLICY "Clients can view own blog_client_submissions"
  ON public.blog_client_submissions FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'client'::app_role) AND clinic_id IN (SELECT id FROM public.clinics WHERE owner_user_id = auth.uid()));

CREATE POLICY "Clients can insert own blog_client_submissions"
  ON public.blog_client_submissions FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'client'::app_role) AND clinic_id IN (SELECT id FROM public.clinics WHERE owner_user_id = auth.uid()));

-- Add blog_package_active to clinics
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS blog_package_active boolean NOT NULL DEFAULT false;

-- Trigger for updated_at on blog_posts
CREATE TRIGGER update_blog_posts_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on blog_client_submissions
CREATE TRIGGER update_blog_client_submissions_updated_at
  BEFORE UPDATE ON public.blog_client_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on blog_prompt_versions
CREATE TRIGGER update_blog_prompt_versions_updated_at
  BEFORE UPDATE ON public.blog_prompt_versions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
