
CREATE POLICY "Clients can insert own clinic_monthly_signals"
ON public.clinic_monthly_signals
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'client'::app_role)
  AND clinic_id IN (SELECT id FROM public.clinics WHERE owner_user_id = auth.uid())
);

CREATE POLICY "Clients can update own clinic_monthly_signals"
ON public.clinic_monthly_signals
FOR UPDATE
USING (
  has_role(auth.uid(), 'client'::app_role)
  AND clinic_id IN (SELECT id FROM public.clinics WHERE owner_user_id = auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'client'::app_role)
  AND clinic_id IN (SELECT id FROM public.clinics WHERE owner_user_id = auth.uid())
);
