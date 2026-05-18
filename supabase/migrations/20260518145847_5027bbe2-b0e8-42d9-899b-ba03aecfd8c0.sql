
-- Helper: is this user a clinic team member whose team_role maps to the given department?
CREATE OR REPLACE FUNCTION public.is_clinic_dept_team_member(_user_id uuid, _clinic_id uuid, _department public.department_type)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clinic_team_members ctm
    JOIN public.profiles p ON p.id = ctm.user_id
    WHERE ctm.user_id = _user_id
      AND ctm.clinic_id = _clinic_id
      AND p.team_role = ANY (
        CASE _department::text
          WHEN 'website'      THEN ARRAY['Developer','Maintenance']
          WHEN 'seo'          THEN ARRAY['SEO Lead']
          WHEN 'google_ads'   THEN ARRAY['Ads Strategist','Ads Analyst']
          WHEN 'social_media' THEN ARRAY['Social & Concierge','Meta Ads Specialist']
          ELSE ARRAY[]::text[]
        END
      )
  )
$$;

-- Rebuild department_chats policies to include clinic-team members of the dept
DROP POLICY IF EXISTS "Admins and dept members can view chats" ON public.department_chats;
DROP POLICY IF EXISTS "Admins and dept members can insert chats" ON public.department_chats;
DROP POLICY IF EXISTS "Admins and dept members can update chat reactions" ON public.department_chats;

CREATE POLICY "Staff can view dept chats"
ON public.department_chats
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.has_role(auth.uid(), 'concierge'::app_role)
    AND (
      public.is_department_member(auth.uid(), department)
      OR public.is_clinic_dept_team_member(auth.uid(), clinic_id, department)
    )
  )
);

CREATE POLICY "Staff can insert dept chats"
ON public.department_chats
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'concierge'::app_role)
      AND (
        public.is_department_member(auth.uid(), department)
        OR public.is_clinic_dept_team_member(auth.uid(), clinic_id, department)
      )
    )
  )
);

CREATE POLICY "Staff can update dept chat reactions"
ON public.department_chats
FOR UPDATE
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.has_role(auth.uid(), 'concierge'::app_role)
    AND (
      public.is_department_member(auth.uid(), department)
      OR public.is_clinic_dept_team_member(auth.uid(), clinic_id, department)
    )
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.has_role(auth.uid(), 'concierge'::app_role)
    AND (
      public.is_department_member(auth.uid(), department)
      OR public.is_clinic_dept_team_member(auth.uid(), clinic_id, department)
    )
  )
);

-- Also update department_chat_reads so team members can persist read receipts
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'department_chat_reads' AND schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.department_chat_reads', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users manage own read receipts - select"
ON public.department_chat_reads FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users manage own read receipts - insert"
ON public.department_chat_reads FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users manage own read receipts - update"
ON public.department_chat_reads FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users manage own read receipts - delete"
ON public.department_chat_reads FOR DELETE
USING (user_id = auth.uid());
