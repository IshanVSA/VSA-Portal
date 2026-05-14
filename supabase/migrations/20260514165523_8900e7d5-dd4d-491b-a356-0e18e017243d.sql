DROP POLICY IF EXISTS "Concierges can view tickets" ON public.department_tickets;

CREATE POLICY "Concierges can view tickets for their clinics"
ON public.department_tickets
FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'concierge'::app_role)
  AND clinic_id IN (SELECT public.get_concierge_clinic_ids((SELECT auth.uid())))
);