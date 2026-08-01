DROP POLICY IF EXISTS "portal users can read" ON public.tracking_events;

CREATE POLICY "Clinic-scoped read of tracking events"
ON public.tracking_events
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR clinic_id IN (SELECT c::text FROM public.get_concierge_clinic_ids(auth.uid()) AS c)
  OR clinic_id IN (SELECT c::text FROM public.get_accessible_clinic_ids(auth.uid()) AS c)
);