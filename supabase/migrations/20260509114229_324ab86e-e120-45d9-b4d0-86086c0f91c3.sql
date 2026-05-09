
-- 1. blog_prompt_versions: restrict SELECT to admin/concierge
DROP POLICY IF EXISTS "Authenticated can view blog_prompt_versions" ON public.blog_prompt_versions;
CREATE POLICY "Staff can view blog_prompt_versions"
ON public.blog_prompt_versions FOR SELECT
TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'admin'::app_role)
  OR public.has_role((SELECT auth.uid()), 'concierge'::app_role)
);

-- 2. clinic_team_members: restrict SELECT to admin/concierge or self
DROP POLICY IF EXISTS "Authenticated can view clinic_team_members" ON public.clinic_team_members;
CREATE POLICY "Staff or self can view clinic_team_members"
ON public.clinic_team_members FOR SELECT
TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'admin'::app_role)
  OR public.has_role((SELECT auth.uid()), 'concierge'::app_role)
  OR user_id = (SELECT auth.uid())
);

-- 3. department_members: restrict SELECT to admin/concierge or self
DROP POLICY IF EXISTS "Authenticated can view department_members" ON public.department_members;
CREATE POLICY "Staff or self can view department_members"
ON public.department_members FOR SELECT
TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'admin'::app_role)
  OR public.has_role((SELECT auth.uid()), 'concierge'::app_role)
  OR user_id = (SELECT auth.uid())
);

-- 4. post_workflow: restrict SELECT to users who can see the parent post
DROP POLICY IF EXISTS "Authenticated can view workflow" ON public.post_workflow;
CREATE POLICY "Users can view workflow for accessible posts"
ON public.post_workflow FOR SELECT
TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.content_posts cp
    WHERE cp.id = post_workflow.post_id
      AND (
        (public.has_role((SELECT auth.uid()), 'concierge'::app_role)
          AND cp.clinic_id IN (SELECT public.get_concierge_clinic_ids((SELECT auth.uid()))))
        OR (public.has_role((SELECT auth.uid()), 'client'::app_role)
          AND cp.clinic_id IN (SELECT id FROM public.clinics WHERE owner_user_id = (SELECT auth.uid())))
        OR cp.clinic_id IN (SELECT public.get_sub_account_clinic_ids((SELECT auth.uid())))
      )
  )
);

-- 5. department-files storage: restrict generic INSERT to admin/concierge
-- (clinic-logos sub-folder still has its own permissive policy for clinic owners/team)
DROP POLICY IF EXISTS "Authenticated users can upload department files" ON storage.objects;
CREATE POLICY "Admin and concierge can upload department files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'department-files'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'concierge'::app_role)
  )
);

-- 6. oauth_temp_tokens: explicit deny-all client policy (service role bypasses RLS)
DROP POLICY IF EXISTS "Deny all client access to oauth_temp_tokens" ON public.oauth_temp_tokens;
CREATE POLICY "Deny all client access to oauth_temp_tokens"
ON public.oauth_temp_tokens FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);
