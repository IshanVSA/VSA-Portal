-- Allow sub-accounts to insert and update Brand DNA for their assigned clinics.
-- Read access already exists via the same row visibility (parent + sub-account share the per-clinic record),
-- so whichever side fills first persists; the other side simply sees the existing row.

CREATE POLICY "Sub-accounts can insert clinic_brand_dna"
ON public.clinic_brand_dna
FOR INSERT
TO authenticated
WITH CHECK (
  clinic_id IN (SELECT public.get_sub_account_clinic_ids(auth.uid()))
  AND submitted_by = auth.uid()
);

CREATE POLICY "Sub-accounts can update clinic_brand_dna"
ON public.clinic_brand_dna
FOR UPDATE
TO authenticated
USING (
  clinic_id IN (SELECT public.get_sub_account_clinic_ids(auth.uid()))
);

CREATE POLICY "Sub-accounts can view clinic_brand_dna"
ON public.clinic_brand_dna
FOR SELECT
TO authenticated
USING (
  clinic_id IN (SELECT public.get_sub_account_clinic_ids(auth.uid()))
);