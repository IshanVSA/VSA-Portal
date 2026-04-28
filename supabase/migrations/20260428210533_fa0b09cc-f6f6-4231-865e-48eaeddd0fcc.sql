
-- gbp_batches: clients only see batches whose clinics array intersects with theirs
DROP POLICY IF EXISTS "Clients can view gbp_batches" ON public.gbp_batches;
CREATE POLICY "Clients can view own gbp_batches"
ON public.gbp_batches
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'client'::app_role)
  AND clinics && ARRAY(SELECT public.get_accessible_clinic_ids(auth.uid()))::uuid[]
);

-- geo_clusters: clinics array must intersect with the client's accessible clinics
DROP POLICY IF EXISTS "Clients can view geo_clusters" ON public.geo_clusters;
CREATE POLICY "Clients can view own geo_clusters"
ON public.geo_clusters
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'client'::app_role)
  AND clinics && ARRAY(SELECT public.get_accessible_clinic_ids(auth.uid()))::uuid[]
);

-- gbp_topic_library: internal planning table, not for clients
DROP POLICY IF EXISTS "Clients can view gbp_topic_library" ON public.gbp_topic_library;

-- post_comments: clients only see public comments on posts belonging to their clinics
DROP POLICY IF EXISTS "Clients can view public comments" ON public.post_comments;
CREATE POLICY "Clients can view public comments on own posts"
ON public.post_comments
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'client'::app_role)
  AND visibility = 'all'::text
  AND post_id IN (
    SELECT cp.id FROM public.content_posts cp
    WHERE cp.clinic_id IN (SELECT public.get_accessible_clinic_ids(auth.uid()))
  )
);
