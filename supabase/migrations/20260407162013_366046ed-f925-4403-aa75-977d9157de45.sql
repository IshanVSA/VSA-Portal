
-- 1. Monthly Signal Layer table
CREATE TABLE public.clinic_monthly_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  month_year TEXT NOT NULL, -- format: "2026-04"
  campaign_month_number INTEGER DEFAULT 0,
  monthly_budget NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'CAD',
  seasonal_topics JSONB DEFAULT '[]'::jsonb,
  community_events JSONB DEFAULT '[]'::jsonb,
  statutory_holidays JSONB DEFAULT '[]'::jsonb,
  local_alerts JSONB DEFAULT '[]'::jsonb,
  local_news JSONB DEFAULT '[]'::jsonb,
  top_performer_last_month JSONB DEFAULT '{}'::jsonb,
  active_promotions JSONB DEFAULT '[]'::jsonb,
  client_content_preference JSONB DEFAULT '{"service_awareness":25,"clinical_education":30,"seasonal_safety":20,"community":15,"promotions":10}'::jsonb,
  clinic_news_this_month TEXT DEFAULT '',
  facebook_specific_this_month TEXT DEFAULT '',
  stock_post_count INTEGER DEFAULT 0,
  client_asset_post_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(clinic_id, month_year)
);

ALTER TABLE public.clinic_monthly_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on clinic_monthly_signals" ON public.clinic_monthly_signals FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Concierges can view clinic_monthly_signals" ON public.clinic_monthly_signals FOR SELECT TO authenticated USING (has_role(auth.uid(), 'concierge'::app_role) AND clinic_id IN (SELECT id FROM clinics WHERE assigned_concierge_id = auth.uid()));
CREATE POLICY "Concierges can insert clinic_monthly_signals" ON public.clinic_monthly_signals FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'concierge'::app_role) AND clinic_id IN (SELECT id FROM clinics WHERE assigned_concierge_id = auth.uid()));
CREATE POLICY "Concierges can update clinic_monthly_signals" ON public.clinic_monthly_signals FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'concierge'::app_role) AND clinic_id IN (SELECT id FROM clinics WHERE assigned_concierge_id = auth.uid()));
CREATE POLICY "Clients can view own clinic_monthly_signals" ON public.clinic_monthly_signals FOR SELECT TO authenticated USING (has_role(auth.uid(), 'client'::app_role) AND clinic_id IN (SELECT id FROM clinics WHERE owner_user_id = auth.uid()));

CREATE TRIGGER update_clinic_monthly_signals_updated_at BEFORE UPDATE ON public.clinic_monthly_signals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Promotions table
CREATE TABLE public.clinic_promotions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  offer_name TEXT NOT NULL,
  inclusions TEXT NOT NULL DEFAULT '',
  exclusions TEXT NOT NULL DEFAULT '',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- draft, active, expired
  governing_body_confirmed BOOLEAN DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.clinic_promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on clinic_promotions" ON public.clinic_promotions FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Concierges can view clinic_promotions" ON public.clinic_promotions FOR SELECT TO authenticated USING (has_role(auth.uid(), 'concierge'::app_role) AND clinic_id IN (SELECT id FROM clinics WHERE assigned_concierge_id = auth.uid()));
CREATE POLICY "Concierges can manage clinic_promotions" ON public.clinic_promotions FOR ALL TO authenticated USING (has_role(auth.uid(), 'concierge'::app_role) AND clinic_id IN (SELECT id FROM clinics WHERE assigned_concierge_id = auth.uid())) WITH CHECK (has_role(auth.uid(), 'concierge'::app_role) AND clinic_id IN (SELECT id FROM clinics WHERE assigned_concierge_id = auth.uid()));
CREATE POLICY "Clients can view own clinic_promotions" ON public.clinic_promotions FOR SELECT TO authenticated USING (has_role(auth.uid(), 'client'::app_role) AND clinic_id IN (SELECT id FROM clinics WHERE owner_user_id = auth.uid()));
CREATE POLICY "Clients can insert own clinic_promotions" ON public.clinic_promotions FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'client'::app_role) AND clinic_id IN (SELECT id FROM clinics WHERE owner_user_id = auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Clients can update own clinic_promotions" ON public.clinic_promotions FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'client'::app_role) AND clinic_id IN (SELECT id FROM clinics WHERE owner_user_id = auth.uid()));

CREATE TRIGGER update_clinic_promotions_updated_at BEFORE UPDATE ON public.clinic_promotions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. SM2 Generations table
CREATE TABLE public.sm2_generations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  month_year TEXT NOT NULL, -- "2026-04"
  html_file_path TEXT, -- path in department-files bucket
  generation_confidence_score INTEGER DEFAULT 0,
  dna_completeness_score INTEGER DEFAULT 0,
  model_used TEXT DEFAULT 'claude-sonnet-4-6',
  token_count INTEGER DEFAULT 0,
  triggered_by UUID,
  approval_status TEXT NOT NULL DEFAULT 'pending', -- pending, approved_client, approved_auto, rejected
  approved_at TIMESTAMPTZ,
  client_feedback TEXT,
  sent_to_client_at TIMESTAMPTZ,
  auto_approved_at TIMESTAMPTZ,
  email_day0_sent BOOLEAN DEFAULT false,
  email_day3_sent BOOLEAN DEFAULT false,
  email_day5_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sm2_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on sm2_generations" ON public.sm2_generations FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Concierges can view sm2_generations" ON public.sm2_generations FOR SELECT TO authenticated USING (has_role(auth.uid(), 'concierge'::app_role) AND clinic_id IN (SELECT id FROM clinics WHERE assigned_concierge_id = auth.uid()));
CREATE POLICY "Concierges can insert sm2_generations" ON public.sm2_generations FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'concierge'::app_role) AND clinic_id IN (SELECT id FROM clinics WHERE assigned_concierge_id = auth.uid()));
CREATE POLICY "Concierges can update sm2_generations" ON public.sm2_generations FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'concierge'::app_role) AND clinic_id IN (SELECT id FROM clinics WHERE assigned_concierge_id = auth.uid()));
CREATE POLICY "Clients can view own sm2_generations" ON public.sm2_generations FOR SELECT TO authenticated USING (has_role(auth.uid(), 'client'::app_role) AND clinic_id IN (SELECT id FROM clinics WHERE owner_user_id = auth.uid()));
CREATE POLICY "Clients can update own sm2_generations" ON public.sm2_generations FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'client'::app_role) AND clinic_id IN (SELECT id FROM clinics WHERE owner_user_id = auth.uid()));

CREATE TRIGGER update_sm2_generations_updated_at BEFORE UPDATE ON public.sm2_generations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. SM2 System Prompts (versioned)
CREATE TABLE public.sm2_system_prompts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  prompt_text TEXT NOT NULL,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

ALTER TABLE public.sm2_system_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access on sm2_system_prompts" ON public.sm2_system_prompts FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Concierges can view sm2_system_prompts" ON public.sm2_system_prompts FOR SELECT TO authenticated USING (has_role(auth.uid(), 'concierge'::app_role));

-- 5. Add profile_status and campaign_start_date to clinics
ALTER TABLE public.clinics 
  ADD COLUMN IF NOT EXISTS profile_status TEXT DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS campaign_start_date DATE;
