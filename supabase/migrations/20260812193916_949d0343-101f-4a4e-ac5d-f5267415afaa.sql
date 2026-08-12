
-- Departments a staff member belongs to (team_role driven, plus explicit department_members rows)
CREATE OR REPLACE FUNCTION public.get_staff_departments(_user_id uuid)
RETURNS department_type[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (
      SELECT ARRAY(
        SELECT DISTINCT d FROM (
          SELECT unnest(
            CASE p.team_role
              WHEN 'Developer'            THEN ARRAY['website']
              WHEN 'Maintenance'          THEN ARRAY['website']
              WHEN 'SEO Lead'             THEN ARRAY['seo']
              WHEN 'Ads Strategist'       THEN ARRAY['google_ads']
              WHEN 'Ads Analyst'          THEN ARRAY['google_ads']
              WHEN 'Social & Concierge'   THEN ARRAY['social_media']
              WHEN 'Meta Ads Specialist'  THEN ARRAY['social_media']
              ELSE ARRAY[]::text[]
            END
          )::public.department_type AS d
          FROM public.profiles p WHERE p.id = _user_id
          UNION
          SELECT dm.department FROM public.department_members dm WHERE dm.user_id = _user_id
        ) s
      )
    ),
    ARRAY[]::public.department_type[]
  );
$$;

-- Can a staff member see this ticket? Department-scoped, with personal overrides.
CREATE OR REPLACE FUNCTION public.can_staff_view_ticket(_user_id uuid, _ticket_id uuid, _department department_type)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    -- Legacy safety: staff with no resolvable department keep prior behaviour
    COALESCE(array_length(public.get_staff_departments(_user_id), 1), 0) = 0
    OR _department = ANY (public.get_staff_departments(_user_id))
    OR EXISTS (
      SELECT 1 FROM public.department_ticket_assignments dta
      WHERE dta.ticket_id = _ticket_id
        AND (dta.department = ANY (public.get_staff_departments(_user_id))
             OR dta.assigned_to = _user_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.department_ticket_candidates dtc
      WHERE dtc.ticket_id = _ticket_id AND dtc.user_id = _user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.ticket_assignees ta
      WHERE ta.ticket_id = _ticket_id AND ta.user_id = _user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.department_tickets t
      WHERE t.id = _ticket_id
        AND (t.created_by = _user_id OR t.assigned_to = _user_id)
    );
$$;

DROP POLICY IF EXISTS "Concierges can view tickets for their clinics" ON public.department_tickets;
CREATE POLICY "Concierges can view tickets for their clinics"
ON public.department_tickets
FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'concierge'::app_role)
  AND clinic_id IN (SELECT get_concierge_clinic_ids((SELECT auth.uid())))
  AND public.can_staff_view_ticket((SELECT auth.uid()), id, department)
);

-- Team chats: department-scoped for staff
DROP POLICY IF EXISTS "Staff can view dept chats" ON public.department_chats;
CREATE POLICY "Staff can view dept chats"
ON public.department_chats
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    has_role(auth.uid(), 'concierge'::app_role)
    AND (
      department = ANY (public.get_staff_departments(auth.uid()))
      OR is_clinic_dept_team_member(auth.uid(), clinic_id, department)
    )
  )
);
