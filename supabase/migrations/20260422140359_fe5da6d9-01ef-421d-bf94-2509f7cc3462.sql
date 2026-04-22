
CREATE OR REPLACE FUNCTION public.auto_assign_ticket_pool()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  allowed_roles text[];
  has_clinic_match boolean := false;
BEGIN
  -- If an assignee was explicitly provided, seed the pool with that user and exit.
  IF NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.ticket_assignees (ticket_id, user_id)
    VALUES (NEW.id, NEW.assigned_to)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
  END IF;

  -- Resolve allowed team_roles for this department (mirrors useDepartmentTeam.ts)
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

  -- Try clinic-scoped staff first
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

  -- Fallback: all department-eligible staff
  IF NOT has_clinic_match THEN
    INSERT INTO public.ticket_assignees (ticket_id, user_id)
    SELECT NEW.id, p.id
    FROM public.profiles p
    WHERE p.team_role = ANY(allowed_roles)
      AND NOT public.has_role(p.id, 'client'::app_role)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Leave assigned_to NULL (pool state)
  RETURN NEW;
END;
$function$;

-- Backfill: populate pools for unassigned tickets from the last 7 days
DO $$
DECLARE
  t RECORD;
  allowed_roles text[];
  has_clinic_match boolean;
BEGIN
  FOR t IN
    SELECT dt.id, dt.department, dt.clinic_id
    FROM public.department_tickets dt
    WHERE dt.assigned_to IS NULL
      AND dt.created_at >= now() - interval '7 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.ticket_assignees ta WHERE ta.ticket_id = dt.id
      )
  LOOP
    allowed_roles := CASE t.department::text
      WHEN 'website'      THEN ARRAY['Developer', 'Maintenance']
      WHEN 'seo'          THEN ARRAY['SEO Lead']
      WHEN 'google_ads'   THEN ARRAY['Ads Strategist', 'Ads Analyst']
      WHEN 'social_media' THEN ARRAY['Social & Concierge']
      ELSE ARRAY[]::text[]
    END;

    IF array_length(allowed_roles, 1) IS NULL THEN
      CONTINUE;
    END IF;

    has_clinic_match := false;

    IF t.clinic_id IS NOT NULL THEN
      INSERT INTO public.ticket_assignees (ticket_id, user_id)
      SELECT t.id, p.id
      FROM public.profiles p
      WHERE p.team_role = ANY(allowed_roles)
        AND EXISTS (
          SELECT 1 FROM public.clinic_team_members ctm
          WHERE ctm.user_id = p.id AND ctm.clinic_id = t.clinic_id
        )
        AND NOT public.has_role(p.id, 'client'::app_role)
      ON CONFLICT DO NOTHING;

      SELECT EXISTS (SELECT 1 FROM public.ticket_assignees WHERE ticket_id = t.id)
      INTO has_clinic_match;
    END IF;

    IF NOT has_clinic_match THEN
      INSERT INTO public.ticket_assignees (ticket_id, user_id)
      SELECT t.id, p.id
      FROM public.profiles p
      WHERE p.team_role = ANY(allowed_roles)
        AND NOT public.has_role(p.id, 'client'::app_role)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;
