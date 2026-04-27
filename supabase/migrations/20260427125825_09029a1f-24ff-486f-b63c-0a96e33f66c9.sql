CREATE POLICY "Concierges can view assigned clinic credentials"
ON public.clinic_api_credentials
FOR SELECT
USING (
  has_role(auth.uid(), 'concierge'::app_role)
  AND clinic_id IN (SELECT get_concierge_clinic_ids(auth.uid()))
);