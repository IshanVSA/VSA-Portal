-- Fix calendar_submissions: require submitted_by = auth.uid()
DROP POLICY IF EXISTS "Authenticated users can insert submissions" ON public.calendar_submissions;

CREATE POLICY "Authenticated users can insert own submissions"
ON public.calendar_submissions
FOR INSERT
TO authenticated
WITH CHECK (submitted_by = auth.uid());

-- Fix website_pageviews: restrict to valid clinic_id instead of open WITH CHECK (true)
DROP POLICY IF EXISTS "Public can insert pageviews" ON public.website_pageviews;

CREATE POLICY "Public can insert pageviews with valid clinic"
ON public.website_pageviews
FOR INSERT
TO anon, authenticated
WITH CHECK (
  clinic_id IN (SELECT id FROM public.clinics WHERE status = 'active')
);