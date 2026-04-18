-- Create sm2_posts table
CREATE TABLE public.sm2_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  generation_id UUID NOT NULL REFERENCES public.sm2_generations(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL,
  scheduled_date DATE NOT NULL,
  platform TEXT NOT NULL,
  post_type TEXT,
  theme TEXT,
  caption TEXT,
  hashtags TEXT[] DEFAULT '{}',
  cta TEXT,
  hook TEXT,
  compliance_notes TEXT,
  image_path TEXT,
  image_uploaded_at TIMESTAMPTZ,
  image_uploaded_by UUID,
  client_feedback TEXT,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sm2_posts_generation ON public.sm2_posts(generation_id);
CREATE INDEX idx_sm2_posts_clinic_date ON public.sm2_posts(clinic_id, scheduled_date);

ALTER TABLE public.sm2_posts ENABLE ROW LEVEL SECURITY;

-- Admins: full access
CREATE POLICY "Admins full access on sm2_posts"
ON public.sm2_posts
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Concierges: full access for clinics they manage
CREATE POLICY "Concierges manage sm2_posts"
ON public.sm2_posts
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'concierge'::app_role)
  AND clinic_id IN (SELECT get_concierge_clinic_ids(auth.uid()))
)
WITH CHECK (
  has_role(auth.uid(), 'concierge'::app_role)
  AND clinic_id IN (SELECT get_concierge_clinic_ids(auth.uid()))
);

-- Clients: SELECT only when parent generation has been shared
CREATE POLICY "Clients view shared sm2_posts"
ON public.sm2_posts
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'client'::app_role)
  AND clinic_id IN (SELECT id FROM public.clinics WHERE owner_user_id = auth.uid())
  AND generation_id IN (
    SELECT id FROM public.sm2_generations
    WHERE approval_status IN ('sent_to_client', 'approved_client', 'feedback_submitted')
  )
);

-- Clients: UPDATE only client_feedback on their shared posts
CREATE POLICY "Clients update feedback on sm2_posts"
ON public.sm2_posts
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'client'::app_role)
  AND clinic_id IN (SELECT id FROM public.clinics WHERE owner_user_id = auth.uid())
  AND generation_id IN (
    SELECT id FROM public.sm2_generations
    WHERE approval_status IN ('sent_to_client', 'approved_client', 'feedback_submitted')
  )
)
WITH CHECK (
  has_role(auth.uid(), 'client'::app_role)
  AND clinic_id IN (SELECT id FROM public.clinics WHERE owner_user_id = auth.uid())
);

-- updated_at trigger
CREATE TRIGGER update_sm2_posts_updated_at
BEFORE UPDATE ON public.sm2_posts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();