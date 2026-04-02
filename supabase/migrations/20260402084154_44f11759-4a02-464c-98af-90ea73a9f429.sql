
-- ============================================
-- GBP Posts Feature: 7 Tables + RLS + Triggers
-- ============================================

-- 1. geo_clusters
CREATE TABLE public.geo_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id TEXT UNIQUE NOT NULL,
  region TEXT NOT NULL,
  clinics UUID[] NOT NULL DEFAULT '{}',
  is_solo BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.geo_clusters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on geo_clusters" ON public.geo_clusters FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Concierges can view geo_clusters" ON public.geo_clusters FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'concierge'));
CREATE POLICY "Clients can view geo_clusters" ON public.geo_clusters FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'client'));

CREATE TRIGGER update_geo_clusters_updated_at BEFORE UPDATE ON public.geo_clusters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. clinic_gbp_config
CREATE TABLE public.clinic_gbp_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  cluster_id TEXT REFERENCES public.geo_clusters(cluster_id),
  cluster_position TEXT CHECK (cluster_position IN ('A','B','C','D')),
  hospital_type INT CHECK (hospital_type IN (1,2,3)),
  local_landmarks TEXT[] DEFAULT '{}',
  topic_variant_current TEXT CHECK (topic_variant_current IN ('A','B','C','D')),
  hook_style_current TEXT CHECK (hook_style_current IN ('STAT','QUESTION','URGENCY','MYTH-BUST')),
  last_variant_used TEXT,
  geo_radius_km INT DEFAULT 7,
  jurisdiction TEXT CHECK (jurisdiction IN ('BC','CA-OTHER','US')),
  phone_number TEXT,
  neighbourhood TEXT,
  top_services TEXT[] DEFAULT '{}',
  website_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(clinic_id)
);

ALTER TABLE public.clinic_gbp_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on clinic_gbp_config" ON public.clinic_gbp_config FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Concierges can view clinic_gbp_config" ON public.clinic_gbp_config FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'concierge') AND clinic_id IN (SELECT id FROM clinics WHERE assigned_concierge_id = auth.uid()));
CREATE POLICY "Concierges can insert clinic_gbp_config" ON public.clinic_gbp_config FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'concierge') AND clinic_id IN (SELECT id FROM clinics WHERE assigned_concierge_id = auth.uid()));
CREATE POLICY "Concierges can update clinic_gbp_config" ON public.clinic_gbp_config FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'concierge') AND clinic_id IN (SELECT id FROM clinics WHERE assigned_concierge_id = auth.uid()));
CREATE POLICY "Clients can view own clinic_gbp_config" ON public.clinic_gbp_config FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'client') AND clinic_id IN (SELECT id FROM clinics WHERE owner_user_id = auth.uid()));

CREATE TRIGGER update_clinic_gbp_config_updated_at BEFORE UPDATE ON public.clinic_gbp_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. gbp_batches (created before gbp_post_history since it's referenced)
CREATE TABLE public.gbp_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month INT NOT NULL,
  year INT NOT NULL,
  batch_number INT NOT NULL,
  cluster_id TEXT REFERENCES public.geo_clusters(cluster_id),
  clinics UUID[] NOT NULL DEFAULT '{}',
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued','in_progress','qa','complete')),
  collision_check JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(month, year, batch_number)
);

ALTER TABLE public.gbp_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on gbp_batches" ON public.gbp_batches FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Concierges can view gbp_batches" ON public.gbp_batches FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'concierge'));
CREATE POLICY "Clients can view gbp_batches" ON public.gbp_batches FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'client'));

CREATE TRIGGER update_gbp_batches_updated_at BEFORE UPDATE ON public.gbp_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. gbp_post_history
CREATE TABLE public.gbp_post_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  month INT NOT NULL,
  year INT NOT NULL,
  week_number INT NOT NULL CHECK (week_number IN (1,2,3,4)),
  post_type TEXT NOT NULL CHECK (post_type IN ('WHATS_NEW','PRODUCTS_SERVICES')),
  topic TEXT NOT NULL,
  hook_style TEXT CHECK (hook_style IN ('STAT','QUESTION','URGENCY','MYTH-BUST')),
  primary_keyword TEXT NOT NULL,
  secondary_keywords TEXT[] DEFAULT '{}',
  post_content TEXT NOT NULL,
  cta_text TEXT,
  cta_url TEXT,
  word_count INT,
  topic_variant TEXT CHECK (topic_variant IN ('A','B','C','D')),
  local_landmark_used TEXT,
  status TEXT DEFAULT 'generated' CHECK (status IN ('generated','reviewed','approved','published','rejected')),
  compliance_scan JSONB,
  batch_id UUID REFERENCES public.gbp_batches(id),
  generated_by UUID,
  reviewed_by UUID,
  approved_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.gbp_post_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on gbp_post_history" ON public.gbp_post_history FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Concierges can view gbp_post_history" ON public.gbp_post_history FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'concierge') AND clinic_id IN (SELECT id FROM clinics WHERE assigned_concierge_id = auth.uid()));
CREATE POLICY "Concierges can insert gbp_post_history" ON public.gbp_post_history FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'concierge') AND clinic_id IN (SELECT id FROM clinics WHERE assigned_concierge_id = auth.uid()));
CREATE POLICY "Concierges can update gbp_post_history" ON public.gbp_post_history FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'concierge') AND clinic_id IN (SELECT id FROM clinics WHERE assigned_concierge_id = auth.uid()));
CREATE POLICY "Clients can view own gbp_post_history" ON public.gbp_post_history FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'client') AND clinic_id IN (SELECT id FROM clinics WHERE owner_user_id = auth.uid()));

CREATE TRIGGER update_gbp_post_history_updated_at BEFORE UPDATE ON public.gbp_post_history
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. gbp_topic_library
CREATE TABLE public.gbp_topic_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month INT NOT NULL,
  variant TEXT NOT NULL CHECK (variant IN ('A','B','C','D')),
  week_1_topic TEXT NOT NULL,
  week_2_topic TEXT NOT NULL,
  week_3_topic TEXT NOT NULL,
  week_4_topic TEXT NOT NULL,
  seasonal_theme TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(month, variant)
);

ALTER TABLE public.gbp_topic_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on gbp_topic_library" ON public.gbp_topic_library FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Concierges can view gbp_topic_library" ON public.gbp_topic_library FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'concierge'));
CREATE POLICY "Clients can view gbp_topic_library" ON public.gbp_topic_library FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'client'));

CREATE TRIGGER update_gbp_topic_library_updated_at BEFORE UPDATE ON public.gbp_topic_library
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. gbp_compliance_scans
CREATE TABLE public.gbp_compliance_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES public.gbp_batches(id),
  month INT NOT NULL,
  year INT NOT NULL,
  scan_result JSONB NOT NULL,
  overall_pass BOOLEAN NOT NULL,
  issues_count INT DEFAULT 0,
  scanned_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.gbp_compliance_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on gbp_compliance_scans" ON public.gbp_compliance_scans FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Concierges can view gbp_compliance_scans" ON public.gbp_compliance_scans FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'concierge') AND clinic_id IN (SELECT id FROM clinics WHERE assigned_concierge_id = auth.uid()));
CREATE POLICY "Concierges can insert gbp_compliance_scans" ON public.gbp_compliance_scans FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'concierge') AND clinic_id IN (SELECT id FROM clinics WHERE assigned_concierge_id = auth.uid()));
CREATE POLICY "Clients can view own gbp_compliance_scans" ON public.gbp_compliance_scans FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'client') AND clinic_id IN (SELECT id FROM clinics WHERE owner_user_id = auth.uid()));

-- 7. gbp_recent_content
CREATE TABLE public.gbp_recent_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('blog','p2_page','gbp_post')),
  title TEXT NOT NULL,
  primary_keyword TEXT,
  topic_cluster TEXT,
  publish_date DATE,
  source_month INT,
  source_year INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.gbp_recent_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on gbp_recent_content" ON public.gbp_recent_content FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Concierges can view gbp_recent_content" ON public.gbp_recent_content FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'concierge') AND clinic_id IN (SELECT id FROM clinics WHERE assigned_concierge_id = auth.uid()));
CREATE POLICY "Concierges can insert gbp_recent_content" ON public.gbp_recent_content FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'concierge') AND clinic_id IN (SELECT id FROM clinics WHERE assigned_concierge_id = auth.uid()));
CREATE POLICY "Clients can view own gbp_recent_content" ON public.gbp_recent_content FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'client') AND clinic_id IN (SELECT id FROM clinics WHERE owner_user_id = auth.uid()));

-- Indexes for performance
CREATE INDEX idx_gbp_post_history_clinic_month ON public.gbp_post_history(clinic_id, year, month);
CREATE INDEX idx_gbp_post_history_batch ON public.gbp_post_history(batch_id);
CREATE INDEX idx_gbp_batches_month_year ON public.gbp_batches(month, year);
CREATE INDEX idx_gbp_recent_content_clinic ON public.gbp_recent_content(clinic_id);
CREATE INDEX idx_gbp_compliance_scans_clinic ON public.gbp_compliance_scans(clinic_id, month, year);
CREATE INDEX idx_clinic_gbp_config_cluster ON public.clinic_gbp_config(cluster_id);
