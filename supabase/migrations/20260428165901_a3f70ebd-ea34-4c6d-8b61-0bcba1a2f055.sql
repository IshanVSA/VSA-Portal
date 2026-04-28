
-- 1. Add new role enum value
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sub_client';

-- 2. Tables
CREATE TABLE IF NOT EXISTS public.client_sub_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id uuid NOT NULL,
  sub_user_id uuid NOT NULL UNIQUE,
  hide_financials boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_sub_accounts_parent ON public.client_sub_accounts(parent_user_id);

CREATE TABLE IF NOT EXISTS public.sub_account_clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_account_id uuid NOT NULL REFERENCES public.client_sub_accounts(id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sub_account_id, clinic_id)
);

CREATE INDEX IF NOT EXISTS idx_sub_account_clinics_sub ON public.sub_account_clinics(sub_account_id);
CREATE INDEX IF NOT EXISTS idx_sub_account_clinics_clinic ON public.sub_account_clinics(clinic_id);

-- 3. Updated-at trigger
CREATE TRIGGER trg_client_sub_accounts_updated_at
BEFORE UPDATE ON public.client_sub_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Helper functions
CREATE OR REPLACE FUNCTION public.is_sub_account(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.client_sub_accounts WHERE sub_user_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.get_sub_account_clinic_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sac.clinic_id
  FROM public.sub_account_clinics sac
  JOIN public.client_sub_accounts csa ON csa.id = sac.sub_account_id
  WHERE csa.sub_user_id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.sub_account_hides_financials(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT hide_financials FROM public.client_sub_accounts WHERE sub_user_id = _user_id LIMIT 1),
    false
  )
$$;

CREATE OR REPLACE FUNCTION public.get_accessible_clinic_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.clinics WHERE owner_user_id = _user_id
  UNION
  SELECT sac.clinic_id
  FROM public.sub_account_clinics sac
  JOIN public.client_sub_accounts csa ON csa.id = sac.sub_account_id
  WHERE csa.sub_user_id = _user_id
$$;

-- 5. RLS on new tables
ALTER TABLE public.client_sub_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_account_clinics ENABLE ROW LEVEL SECURITY;

-- Parent client manages their own sub-accounts; sub-account can view its own row; admins see all.
CREATE POLICY "Parent or admin can view sub-accounts"
ON public.client_sub_accounts FOR SELECT TO authenticated
USING (
  parent_user_id = auth.uid()
  OR sub_user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Parent can create sub-accounts"
ON public.client_sub_accounts FOR INSERT TO authenticated
WITH CHECK (parent_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Parent can update sub-accounts"
ON public.client_sub_accounts FOR UPDATE TO authenticated
USING (parent_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Parent can delete sub-accounts"
ON public.client_sub_accounts FOR DELETE TO authenticated
USING (parent_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

-- sub_account_clinics policies
CREATE POLICY "Parent or sub or admin can view assignments"
ON public.sub_account_clinics FOR SELECT TO authenticated
USING (
  sub_account_id IN (
    SELECT id FROM public.client_sub_accounts
    WHERE parent_user_id = auth.uid() OR sub_user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Parent can manage assignments insert"
ON public.sub_account_clinics FOR INSERT TO authenticated
WITH CHECK (
  sub_account_id IN (SELECT id FROM public.client_sub_accounts WHERE parent_user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Parent can manage assignments delete"
ON public.sub_account_clinics FOR DELETE TO authenticated
USING (
  sub_account_id IN (SELECT id FROM public.client_sub_accounts WHERE parent_user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- 6. Extend client-scoped RLS policies on key tables to also accept sub-account access
-- clinics
DROP POLICY IF EXISTS "Sub-accounts can view assigned clinics" ON public.clinics;
CREATE POLICY "Sub-accounts can view assigned clinics"
ON public.clinics FOR SELECT TO authenticated
USING (id IN (SELECT public.get_sub_account_clinic_ids(auth.uid())));

-- analytics
DROP POLICY IF EXISTS "Sub-accounts can view analytics for assigned clinics" ON public.analytics;
CREATE POLICY "Sub-accounts can view analytics for assigned clinics"
ON public.analytics FOR SELECT TO authenticated
USING (clinic_id IN (SELECT public.get_sub_account_clinic_ids(auth.uid())));

-- content_posts
DROP POLICY IF EXISTS "Sub-accounts can view content posts for assigned clinics" ON public.content_posts;
CREATE POLICY "Sub-accounts can view content posts for assigned clinics"
ON public.content_posts FOR SELECT TO authenticated
USING (clinic_id IN (SELECT public.get_sub_account_clinic_ids(auth.uid())));

-- department_tickets
DROP POLICY IF EXISTS "Sub-accounts can view tickets for assigned clinics" ON public.department_tickets;
CREATE POLICY "Sub-accounts can view tickets for assigned clinics"
ON public.department_tickets FOR SELECT TO authenticated
USING (clinic_id IN (SELECT public.get_sub_account_clinic_ids(auth.uid())));

DROP POLICY IF EXISTS "Sub-accounts can create tickets for assigned clinics" ON public.department_tickets;
CREATE POLICY "Sub-accounts can create tickets for assigned clinics"
ON public.department_tickets FOR INSERT TO authenticated
WITH CHECK (
  clinic_id IN (SELECT public.get_sub_account_clinic_ids(auth.uid()))
  AND created_by = auth.uid()
);

-- sm2_posts
DROP POLICY IF EXISTS "Sub-accounts can view sm2 posts for assigned clinics" ON public.sm2_posts;
CREATE POLICY "Sub-accounts can view sm2 posts for assigned clinics"
ON public.sm2_posts FOR SELECT TO authenticated
USING (clinic_id IN (SELECT public.get_sub_account_clinic_ids(auth.uid())));

-- sm2_generations
DROP POLICY IF EXISTS "Sub-accounts can view sm2 generations for assigned clinics" ON public.sm2_generations;
CREATE POLICY "Sub-accounts can view sm2 generations for assigned clinics"
ON public.sm2_generations FOR SELECT TO authenticated
USING (clinic_id IN (SELECT public.get_sub_account_clinic_ids(auth.uid())));

-- blog_posts
DROP POLICY IF EXISTS "Sub-accounts can view blog posts for assigned clinics" ON public.blog_posts;
CREATE POLICY "Sub-accounts can view blog posts for assigned clinics"
ON public.blog_posts FOR SELECT TO authenticated
USING (clinic_id IN (SELECT public.get_sub_account_clinic_ids(auth.uid())));

-- seo_analytics
DROP POLICY IF EXISTS "Sub-accounts can view seo analytics for assigned clinics" ON public.seo_analytics;
CREATE POLICY "Sub-accounts can view seo analytics for assigned clinics"
ON public.seo_analytics FOR SELECT TO authenticated
USING (clinic_id IN (SELECT public.get_sub_account_clinic_ids(auth.uid())));

-- pagespeed_scores
DROP POLICY IF EXISTS "Sub-accounts can view pagespeed for assigned clinics" ON public.pagespeed_scores;
CREATE POLICY "Sub-accounts can view pagespeed for assigned clinics"
ON public.pagespeed_scores FOR SELECT TO authenticated
USING (clinic_id IN (SELECT public.get_sub_account_clinic_ids(auth.uid())));
