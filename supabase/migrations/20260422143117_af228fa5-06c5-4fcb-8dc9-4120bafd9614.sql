-- Recreate the function to UPDATE the ticket directly when there's a sole pool member.
-- Trigger remains AFTER INSERT (required because ticket_assignees has FK to department_tickets).
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
  sole_member uuid;
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
    WHEN 'social_media' THEN ARRAY['Social & Concierge']
    ELSE ARRAY[]::text[]
  END;

  IF array_length(allowed_roles, 1) IS NULL THEN
    RETURN NEW;
  END IF;

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

  IF pool_count = 1 THEN
    SELECT user_id INTO sole_member
    FROM public.ticket_assignees
    WHERE ticket_id = NEW.id
    LIMIT 1;

    -- AFTER INSERT: must UPDATE the row instead of mutating NEW
    UPDATE public.department_tickets
    SET assigned_to = sole_member
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Backfill: any unassigned ticket in last 7 days with exactly 1 pool member
UPDATE public.department_tickets t
SET assigned_to = ta.user_id
FROM public.ticket_assignees ta
WHERE t.id = ta.ticket_id
  AND t.assigned_to IS NULL
  AND t.created_at > now() - interval '7 days'
  AND (SELECT COUNT(*) FROM public.ticket_assignees WHERE ticket_id = t.id) = 1;