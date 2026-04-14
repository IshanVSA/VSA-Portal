
-- Terms versions table
CREATE TABLE public.terms_versions (
  version text PRIMARY KEY,
  effective_at date NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  amendment_type text NOT NULL DEFAULT 'material',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.terms_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view terms_versions"
  ON public.terms_versions FOR SELECT
  TO authenticated
  USING (true);

-- Terms acceptance log (append-only)
CREATE TABLE public.terms_acceptance_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  terms_version text NOT NULL REFERENCES public.terms_versions(version),
  accepted_at timestamp with time zone NOT NULL DEFAULT now(),
  acceptance_type text NOT NULL DEFAULT 'client',
  ip_address text,
  user_agent text,
  casl_consent_given boolean NOT NULL DEFAULT false
);

ALTER TABLE public.terms_acceptance_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own acceptance"
  ON public.terms_acceptance_log FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all acceptance logs"
  ON public.terms_acceptance_log FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own acceptance"
  ON public.terms_acceptance_log FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Terms decline log
CREATE TABLE public.terms_decline_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  terms_version text NOT NULL REFERENCES public.terms_versions(version),
  declined_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone,
  resolution text
);

ALTER TABLE public.terms_decline_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own decline"
  ON public.terms_decline_log FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all decline logs"
  ON public.terms_decline_log FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update decline logs"
  ON public.terms_decline_log FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Security definer function to check acceptance
CREATE OR REPLACE FUNCTION public.has_accepted_current_terms(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.terms_acceptance_log tal
    JOIN public.terms_versions tv ON tal.terms_version = tv.version
    WHERE tal.user_id = p_user_id
      AND tv.is_active = true
  )
$$;

-- Seed version 1.0
INSERT INTO public.terms_versions (version, effective_at, is_active, amendment_type)
VALUES ('1.0', '2026-04-13', true, 'material');
