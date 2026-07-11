
-- ============================================================
-- Blog engine pipeline schema
-- ============================================================

-- 1. blog_clusters ------------------------------------------------
CREATE TABLE public.blog_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  cluster_slug text NOT NULL,
  cluster_name text NOT NULL,
  rationale text,
  generated_by text NOT NULL DEFAULT 'ai' CHECK (generated_by IN ('ai','admin')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, cluster_slug)
);
CREATE INDEX idx_blog_clusters_clinic ON public.blog_clusters(clinic_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_clusters TO authenticated;
GRANT ALL ON public.blog_clusters TO service_role;
ALTER TABLE public.blog_clusters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access blog_clusters"
  ON public.blog_clusters FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Concierge access blog_clusters"
  ON public.blog_clusters FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'concierge'::app_role) AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid())))
  WITH CHECK (public.has_role(auth.uid(),'concierge'::app_role) AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid())));

CREATE POLICY "Client read blog_clusters"
  ON public.blog_clusters FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT public.get_accessible_clinic_ids(auth.uid())));

-- 2. blog_spokes --------------------------------------------------
CREATE TABLE public.blog_spokes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id uuid NOT NULL REFERENCES public.blog_clusters(id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  title text NOT NULL,
  angle text,
  target_keyword text,
  priority integer NOT NULL DEFAULT 100,
  status text NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog','in_progress','published','retired')),
  assigned_month text,
  published_post_id uuid REFERENCES public.blog_posts(id) ON DELETE SET NULL,
  notes text,
  generated_by text NOT NULL DEFAULT 'ai' CHECK (generated_by IN ('ai','admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_blog_spokes_clinic ON public.blog_spokes(clinic_id);
CREATE INDEX idx_blog_spokes_cluster ON public.blog_spokes(cluster_id);
CREATE INDEX idx_blog_spokes_status ON public.blog_spokes(clinic_id, status, priority);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_spokes TO authenticated;
GRANT ALL ON public.blog_spokes TO service_role;
ALTER TABLE public.blog_spokes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access blog_spokes"
  ON public.blog_spokes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Concierge access blog_spokes"
  ON public.blog_spokes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'concierge'::app_role) AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid())))
  WITH CHECK (public.has_role(auth.uid(),'concierge'::app_role) AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid())));

CREATE POLICY "Client read blog_spokes"
  ON public.blog_spokes FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT public.get_accessible_clinic_ids(auth.uid())));

-- 3. blog_pipeline_runs ------------------------------------------
CREATE TABLE public.blog_pipeline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  spoke_id uuid REFERENCES public.blog_spokes(id) ON DELETE SET NULL,
  blog_post_id uuid REFERENCES public.blog_posts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','awaiting_gate','completed','failed','cancelled')),
  current_stage text,
  stages jsonb NOT NULL DEFAULT '{}'::jsonb,
  injection jsonb NOT NULL DEFAULT '{}'::jsonb,
  site_signal jsonb,
  serp_scan jsonb,
  compliance_resolution jsonb,
  hazards jsonb,
  draft jsonb,
  schema_blocks jsonb,
  checker_report jsonb,
  human_gate jsonb NOT NULL DEFAULT '{"checks":[],"notes":""}'::jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_blog_pipeline_runs_clinic ON public.blog_pipeline_runs(clinic_id, created_at DESC);
CREATE INDEX idx_blog_pipeline_runs_status ON public.blog_pipeline_runs(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.blog_pipeline_runs TO authenticated;
GRANT ALL ON public.blog_pipeline_runs TO service_role;
ALTER TABLE public.blog_pipeline_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access pipeline_runs"
  ON public.blog_pipeline_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Concierge access pipeline_runs"
  ON public.blog_pipeline_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'concierge'::app_role) AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid())))
  WITH CHECK (public.has_role(auth.uid(),'concierge'::app_role) AND clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid())));

CREATE POLICY "Client read pipeline_runs"
  ON public.blog_pipeline_runs FOR SELECT TO authenticated
  USING (clinic_id IN (SELECT public.get_accessible_clinic_ids(auth.uid())));

-- 4. blog_compliance_rules ---------------------------------------
CREATE TABLE public.blog_compliance_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_code text NOT NULL UNIQUE,
  governing_body text NOT NULL,
  spelling_mode text NOT NULL DEFAULT 'CAD' CHECK (spelling_mode IN ('CAD','US','UK')),
  tier text NOT NULL DEFAULT 'standard',
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.blog_compliance_rules TO authenticated;
GRANT ALL ON public.blog_compliance_rules TO service_role;
ALTER TABLE public.blog_compliance_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in read compliance_rules"
  ON public.blog_compliance_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin write compliance_rules"
  ON public.blog_compliance_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

-- Seed known bodies (CAN provinces + broad US)
INSERT INTO public.blog_compliance_rules (jurisdiction_code, governing_body, spelling_mode, tier, rules) VALUES
  ('BC', 'CVBC', 'CAD', 'strictest', '{"no_pricing":true,"no_comparative_claims":true,"emergency_language_limits":true,"preferred_terms":{"preventive_not_preventative":true}}'),
  ('AB', 'ABVMA', 'CAD', 'strict', '{"no_pricing":true,"no_comparative_claims":true,"emergency_language_limits":true}'),
  ('ON', 'CVO', 'CAD', 'strict', '{"no_pricing":true,"no_comparative_claims":true}'),
  ('QC', 'OMVQ', 'CAD', 'strict', '{"no_pricing":true,"no_comparative_claims":true,"french_available":true}'),
  ('MB', 'MVMA', 'CAD', 'standard', '{"no_pricing":true}'),
  ('SK', 'SVMA', 'CAD', 'standard', '{"no_pricing":true}'),
  ('NS', 'NSVMA', 'CAD', 'standard', '{"no_pricing":true}'),
  ('NB', 'NBVMA', 'CAD', 'standard', '{"no_pricing":true}'),
  ('US', 'AVMA', 'US', 'standard', '{"no_pricing":false,"no_comparative_claims":true}')
ON CONFLICT (jurisdiction_code) DO NOTHING;

-- 5. blog_seasonal_hazards ---------------------------------------
CREATE TABLE public.blog_seasonal_hazards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_code text NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  hazard text NOT NULL,
  severity text NOT NULL DEFAULT 'required' CHECK (severity IN ('required','recommended','optional')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (region_code, month, hazard)
);
CREATE INDEX idx_hazards_region_month ON public.blog_seasonal_hazards(region_code, month);

GRANT SELECT ON public.blog_seasonal_hazards TO authenticated;
GRANT ALL ON public.blog_seasonal_hazards TO service_role;
ALTER TABLE public.blog_seasonal_hazards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in read hazards"
  ON public.blog_seasonal_hazards FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin write hazards"
  ON public.blog_seasonal_hazards FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

-- Seed common Canadian pairs
INSERT INTO public.blog_seasonal_hazards (region_code, month, hazard, severity) VALUES
  ('BC', 6, 'heatstroke', 'required'),
  ('BC', 6, 'blue-green algae', 'required'),
  ('BC', 7, 'heatstroke', 'required'),
  ('BC', 7, 'blue-green algae', 'required'),
  ('BC', 7, 'pavement burns', 'recommended'),
  ('BC', 8, 'heatstroke', 'required'),
  ('BC', 8, 'wildfire smoke', 'required'),
  ('BC', 11, 'rat bait exposure', 'recommended'),
  ('BC', 12, 'holiday food toxicity', 'required'),
  ('AB', 1, 'frostbite', 'required'),
  ('AB', 2, 'frostbite', 'required'),
  ('AB', 7, 'heatstroke', 'required'),
  ('ON', 5, 'ticks and lyme', 'required'),
  ('ON', 6, 'ticks and lyme', 'required'),
  ('ON', 7, 'heatstroke', 'required'),
  ('ON', 12, 'holiday food toxicity', 'required')
ON CONFLICT DO NOTHING;

-- 6. Extend blog_posts -------------------------------------------
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS run_id uuid REFERENCES public.blog_pipeline_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS spoke_id uuid REFERENCES public.blog_spokes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stage_progress jsonb,
  ADD COLUMN IF NOT EXISTS checker_report jsonb,
  ADD COLUMN IF NOT EXISTS human_gate_status text CHECK (human_gate_status IN ('pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS human_gate_notes text;

-- 7. updated_at triggers ------------------------------------------
DROP TRIGGER IF EXISTS trg_touch_blog_clusters ON public.blog_clusters;
CREATE TRIGGER trg_touch_blog_clusters BEFORE UPDATE ON public.blog_clusters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_touch_blog_spokes ON public.blog_spokes;
CREATE TRIGGER trg_touch_blog_spokes BEFORE UPDATE ON public.blog_spokes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_touch_blog_pipeline_runs ON public.blog_pipeline_runs;
CREATE TRIGGER trg_touch_blog_pipeline_runs BEFORE UPDATE ON public.blog_pipeline_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_touch_blog_compliance_rules ON public.blog_compliance_rules;
CREATE TRIGGER trg_touch_blog_compliance_rules BEFORE UPDATE ON public.blog_compliance_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_touch_blog_seasonal_hazards ON public.blog_seasonal_hazards;
CREATE TRIGGER trg_touch_blog_seasonal_hazards BEFORE UPDATE ON public.blog_seasonal_hazards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
