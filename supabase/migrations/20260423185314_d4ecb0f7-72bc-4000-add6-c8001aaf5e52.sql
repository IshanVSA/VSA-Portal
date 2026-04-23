CREATE TABLE public.compliance_override_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
  context TEXT NOT NULL,
  offer_name TEXT,
  compliance_body TEXT,
  issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  override_reason TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_compliance_override_user ON public.compliance_override_log(user_id);
CREATE INDEX idx_compliance_override_clinic ON public.compliance_override_log(clinic_id);
CREATE INDEX idx_compliance_override_created_at ON public.compliance_override_log(created_at DESC);

ALTER TABLE public.compliance_override_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all override logs"
ON public.compliance_override_log
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view their own override logs"
ON public.compliance_override_log
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can insert their own override logs"
ON public.compliance_override_log
FOR INSERT
WITH CHECK (auth.uid() = user_id);
