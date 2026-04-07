
CREATE TABLE public.clinic_brand_dna (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id uuid NOT NULL UNIQUE REFERENCES public.clinics(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft',
  call_notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  additional_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  synthesized_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  completeness_score integer NOT NULL DEFAULT 0,
  confidence_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  submitted_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.clinic_brand_dna ENABLE ROW LEVEL SECURITY;

-- Admins full access
CREATE POLICY "Admins full access on clinic_brand_dna"
  ON public.clinic_brand_dna FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Concierges can view assigned clinics
CREATE POLICY "Concierges can view clinic_brand_dna"
  ON public.clinic_brand_dna FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'concierge') AND
    clinic_id IN (SELECT id FROM public.clinics WHERE assigned_concierge_id = auth.uid())
  );

-- Concierges can insert for assigned clinics
CREATE POLICY "Concierges can insert clinic_brand_dna"
  ON public.clinic_brand_dna FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'concierge') AND
    clinic_id IN (SELECT id FROM public.clinics WHERE assigned_concierge_id = auth.uid())
  );

-- Concierges can update assigned clinics
CREATE POLICY "Concierges can update clinic_brand_dna"
  ON public.clinic_brand_dna FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'concierge') AND
    clinic_id IN (SELECT id FROM public.clinics WHERE assigned_concierge_id = auth.uid())
  );

-- Clients can view own clinic
CREATE POLICY "Clients can view own clinic_brand_dna"
  ON public.clinic_brand_dna FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'client') AND
    clinic_id IN (SELECT id FROM public.clinics WHERE owner_user_id = auth.uid())
  );

-- Clients can insert for own clinic
CREATE POLICY "Clients can insert own clinic_brand_dna"
  ON public.clinic_brand_dna FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'client') AND
    clinic_id IN (SELECT id FROM public.clinics WHERE owner_user_id = auth.uid()) AND
    submitted_by = auth.uid()
  );

-- Clients can update own clinic
CREATE POLICY "Clients can update own clinic_brand_dna"
  ON public.clinic_brand_dna FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'client') AND
    clinic_id IN (SELECT id FROM public.clinics WHERE owner_user_id = auth.uid())
  );

-- Auto-update updated_at
CREATE TRIGGER update_clinic_brand_dna_updated_at
  BEFORE UPDATE ON public.clinic_brand_dna
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
