-- 1) Update pick_assignee_for_dept to fall back to any role-matching profile
-- (mirroring auto_assign_ticket_pool fallback) and prefer sole-match.
CREATE OR REPLACE FUNCTION public.pick_assignee_for_dept(_clinic_id uuid, _department department_type)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  allowed_roles text[];
  picked uuid;
  match_count integer;
BEGIN
  allowed_roles := CASE _department::text
    WHEN 'website'      THEN ARRAY['Developer','Maintenance']
    WHEN 'seo'          THEN ARRAY['SEO Lead']
    WHEN 'google_ads'   THEN ARRAY['Ads Strategist','Ads Analyst']
    WHEN 'social_media' THEN ARRAY['Social & Concierge','Meta Ads Specialist']
    ELSE ARRAY[]::text[]
  END;
  IF array_length(allowed_roles,1) IS NULL THEN RETURN NULL; END IF;

  -- 1) Prefer clinic team members with matching role
  IF _clinic_id IS NOT NULL THEN
    SELECT COUNT(*) INTO match_count
    FROM public.profiles p
    WHERE p.team_role = ANY(allowed_roles)
      AND EXISTS (SELECT 1 FROM public.clinic_team_members ctm WHERE ctm.user_id = p.id AND ctm.clinic_id = _clinic_id)
      AND NOT public.has_role(p.id, 'client'::app_role);

    IF match_count >= 1 THEN
      SELECT p.id INTO picked
      FROM public.profiles p
      WHERE p.team_role = ANY(allowed_roles)
        AND EXISTS (SELECT 1 FROM public.clinic_team_members ctm WHERE ctm.user_id = p.id AND ctm.clinic_id = _clinic_id)
        AND NOT public.has_role(p.id, 'client'::app_role)
      ORDER BY p.created_at ASC
      LIMIT 1;
      -- Auto-assign only if exactly one match (avoid arbitrary picks when multiple)
      IF match_count = 1 THEN
        RETURN picked;
      END IF;
      RETURN NULL;
    END IF;
  END IF;

  -- 2) Fallback: any profile with matching role; auto-assign only if exactly one
  SELECT COUNT(*) INTO match_count
  FROM public.profiles p
  WHERE p.team_role = ANY(allowed_roles)
    AND NOT public.has_role(p.id, 'client'::app_role);

  IF match_count = 1 THEN
    SELECT p.id INTO picked
    FROM public.profiles p
    WHERE p.team_role = ANY(allowed_roles)
      AND NOT public.has_role(p.id, 'client'::app_role)
    LIMIT 1;
    RETURN picked;
  END IF;

  RETURN NULL;
END;
$function$;

-- 2) Backfill existing department_ticket_assignments where assignee is NULL
-- but the pool has exactly one eligible member.
UPDATE public.department_ticket_assignments dta
SET assigned_to = sub.sole_user
FROM (
  SELECT dta2.id AS dta_id,
         (SELECT ta.user_id FROM public.ticket_assignees ta WHERE ta.ticket_id = dta2.ticket_id LIMIT 1) AS sole_user,
         (SELECT COUNT(*) FROM public.ticket_assignees ta WHERE ta.ticket_id = dta2.ticket_id) AS pool_size
  FROM public.department_ticket_assignments dta2
  WHERE dta2.assigned_to IS NULL
) sub
WHERE dta.id = sub.dta_id
  AND sub.pool_size = 1
  AND sub.sole_user IS NOT NULL;

-- 3) Also backfill where the parent ticket has an assignee but the dept row doesn't,
-- and the parent assignee has the right role for this department.
UPDATE public.department_ticket_assignments dta
SET assigned_to = dt.assigned_to
FROM public.department_tickets dt, public.profiles p
WHERE dta.ticket_id = dt.id
  AND dta.assigned_to IS NULL
  AND dt.assigned_to IS NOT NULL
  AND p.id = dt.assigned_to
  AND (
    (dta.department::text = 'website'      AND p.team_role IN ('Developer','Maintenance')) OR
    (dta.department::text = 'seo'          AND p.team_role IN ('SEO Lead')) OR
    (dta.department::text = 'google_ads'   AND p.team_role IN ('Ads Strategist','Ads Analyst')) OR
    (dta.department::text = 'social_media' AND p.team_role IN ('Social & Concierge','Meta Ads Specialist'))
  );