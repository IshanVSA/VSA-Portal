
-- Create client_journey_steps table
CREATE TABLE public.client_journey_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  step_number integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, step_number)
);

-- Enable RLS
ALTER TABLE public.client_journey_steps ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admins full access on client_journey_steps"
  ON public.client_journey_steps FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Concierge can view all
CREATE POLICY "Concierges can view client_journey_steps"
  ON public.client_journey_steps FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'concierge'));

-- Concierge can update
CREATE POLICY "Concierges can update client_journey_steps"
  ON public.client_journey_steps FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'concierge'));

-- Concierge can insert (for initialization)
CREATE POLICY "Concierges can insert client_journey_steps"
  ON public.client_journey_steps FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'concierge'));

-- Clients can view their own clinic's journey
CREATE POLICY "Clients can view own clinic journey"
  ON public.client_journey_steps FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'client') AND
    clinic_id IN (SELECT id FROM public.clinics WHERE owner_user_id = auth.uid())
  );

-- Updated_at trigger
CREATE TRIGGER update_client_journey_steps_updated_at
  BEFORE UPDATE ON public.client_journey_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
