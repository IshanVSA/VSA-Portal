
-- Replace pool auto-assignment to always pick lightest-workload member from the pool
CREATE OR REPLACE FUNCTION public.auto_assign_ticket_pool()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  allowed_roles text[];
  has_clinic_match boolean := false;
  pool_count integer;
  picked_user uuid;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.ticket_assignees (ticket_id, user_id)
    VALUES (NEW.id, NEW.assigned_to)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
  END IF;

  allowed_roles := CASE NEW.department::text
    WHEN 'website'      THEN ARRAY['Developer', 'Maintenance']
    WHEN 'seo'          THEN ARRAY['SEO Lead']
    WHEN 'google_ads'   THEN ARRAY['Ads Strategist', 'Ads Analyst']
    WHEN 'social_media' THEN ARRAY['Social & Concierge', 'Meta Ads Specialist']
    ELSE ARRAY[]::text[]
  END;

  IF array_length(allowed_roles, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  -- Build the pool: prefer clinic team members with matching role
  IF NEW.clinic_id IS NOT NULL THEN
    INSERT INTO public.ticket_assignees (ticket_id, user_id)
    SELECT NEW.id, p.id
    FROM public.profiles p
    WHERE p.team_role = ANY(allowed_roles)
      AND EXISTS (
        SELECT 1 FROM public.clinic_team_members ctm
        WHERE ctm.user_id = p.id AND ctm.clinic_id = NEW.clinic_id
      )
      AND NOT public.has_role(p.id, 'client'::app_role)
    ON CONFLICT DO NOTHING;

    SELECT EXISTS (SELECT 1 FROM public.ticket_assignees WHERE ticket_id = NEW.id)
    INTO has_clinic_match;
  END IF;

  IF NOT has_clinic_match THEN
    INSERT INTO public.ticket_assignees (ticket_id, user_id)
    SELECT NEW.id, p.id
    FROM public.profiles p
    WHERE p.team_role = ANY(allowed_roles)
      AND NOT public.has_role(p.id, 'client'::app_role)
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT COUNT(*) INTO pool_count
  FROM public.ticket_assignees
  WHERE ticket_id = NEW.id;

  -- Always assign to the pool member with the lightest active workload
  IF pool_count >= 1 THEN
    SELECT ta.user_id INTO picked_user
    FROM public.ticket_assignees ta
    WHERE ta.ticket_id = NEW.id
    ORDER BY (
      SELECT COUNT(*) FROM public.department_tickets t
      WHERE t.assigned_to = ta.user_id
        AND t.status IN ('open'::ticket_status, 'in_progress'::ticket_status, 'emergency'::ticket_status)
    ) ASC, ta.created_at ASC
    LIMIT 1;

    IF picked_user IS NOT NULL THEN
      UPDATE public.department_tickets
      SET assigned_to = picked_user
      WHERE id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Backfill: assign currently unassigned open/in_progress tickets to the lightest-workload pool member
DO $$
DECLARE
  t RECORD;
  picked uuid;
BEGIN
  FOR t IN
    SELECT id FROM public.department_tickets
    WHERE assigned_to IS NULL
      AND status IN ('open'::ticket_status, 'in_progress'::ticket_status, 'emergency'::ticket_status)
  LOOP
    SELECT ta.user_id INTO picked
    FROM public.ticket_assignees ta
    WHERE ta.ticket_id = t.id
    ORDER BY (
      SELECT COUNT(*) FROM public.department_tickets dt
      WHERE dt.assigned_to = ta.user_id
        AND dt.status IN ('open'::ticket_status, 'in_progress'::ticket_status, 'emergency'::ticket_status)
    ) ASC, ta.created_at ASC
    LIMIT 1;

    IF picked IS NOT NULL THEN
      UPDATE public.department_tickets SET assigned_to = picked WHERE id = t.id;
    END IF;
  END LOOP;
END $$;
