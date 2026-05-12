
-- 1) Rewrite auto_assign_ticket_pool: populate pool with ALL matching team members, do NOT auto-pick
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

  -- Prefer clinic team members with matching role
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

  -- Fallback: any role-matched profile if no clinic team member matched
  IF NOT has_clinic_match THEN
    INSERT INTO public.ticket_assignees (ticket_id, user_id)
    SELECT NEW.id, p.id
    FROM public.profiles p
    WHERE p.team_role = ANY(allowed_roles)
      AND NOT public.has_role(p.id, 'client'::app_role)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Intentionally do NOT set NEW.assigned_to: ticket stays multi-assigned until someone acts
  RETURN NEW;
END;
$function$;

-- 2) Claim trigger on department_tickets: when status moves off 'open' and assigned_to is NULL,
--    claim for the actor (if they're in the pool, or admin)
CREATE OR REPLACE FUNCTION public.claim_ticket_on_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status <> 'open'::ticket_status
     AND NEW.assigned_to IS NULL
     AND auth.uid() IS NOT NULL
  THEN
    IF EXISTS (
      SELECT 1 FROM public.ticket_assignees
      WHERE ticket_id = NEW.id AND user_id = auth.uid()
    ) OR public.has_role(auth.uid(), 'admin'::app_role) THEN
      NEW.assigned_to := auth.uid();
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS claim_ticket_on_status_change_trg ON public.department_tickets;
CREATE TRIGGER claim_ticket_on_status_change_trg
BEFORE UPDATE ON public.department_tickets
FOR EACH ROW
EXECUTE FUNCTION public.claim_ticket_on_status_change();

-- 3) Same logic for per-department assignment row (kanban driver)
CREATE OR REPLACE FUNCTION public.claim_dept_assignment_on_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status <> 'open'::ticket_status
     AND NEW.assigned_to IS NULL
     AND auth.uid() IS NOT NULL
  THEN
    IF EXISTS (
      SELECT 1 FROM public.ticket_assignees
      WHERE ticket_id = NEW.ticket_id AND user_id = auth.uid()
    ) OR public.has_role(auth.uid(), 'admin'::app_role) THEN
      NEW.assigned_to := auth.uid();
      -- Also collapse the parent ticket to this actor
      UPDATE public.department_tickets
      SET assigned_to = auth.uid()
      WHERE id = NEW.ticket_id AND assigned_to IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS claim_dept_assignment_on_status_change_trg ON public.department_ticket_assignments;
CREATE TRIGGER claim_dept_assignment_on_status_change_trg
BEFORE UPDATE ON public.department_ticket_assignments
FOR EACH ROW
EXECUTE FUNCTION public.claim_dept_assignment_on_status_change();

-- 4) Backfill: for currently OPEN tickets with no assigned_to, ensure pool is populated
DO $$
DECLARE
  t RECORD;
  allowed_roles text[];
  has_clinic_match boolean;
BEGIN
  FOR t IN
    SELECT id, department, clinic_id
    FROM public.department_tickets
    WHERE status = 'open'::ticket_status
      AND assigned_to IS NULL
  LOOP
    allowed_roles := CASE t.department::text
      WHEN 'website'      THEN ARRAY['Developer','Maintenance']
      WHEN 'seo'          THEN ARRAY['SEO Lead']
      WHEN 'google_ads'   THEN ARRAY['Ads Strategist','Ads Analyst']
      WHEN 'social_media' THEN ARRAY['Social & Concierge','Meta Ads Specialist']
      ELSE ARRAY[]::text[]
    END;
    IF array_length(allowed_roles,1) IS NULL THEN CONTINUE; END IF;

    has_clinic_match := false;
    IF t.clinic_id IS NOT NULL THEN
      INSERT INTO public.ticket_assignees (ticket_id, user_id)
      SELECT t.id, p.id
      FROM public.profiles p
      WHERE p.team_role = ANY(allowed_roles)
        AND EXISTS (SELECT 1 FROM public.clinic_team_members ctm WHERE ctm.user_id = p.id AND ctm.clinic_id = t.clinic_id)
        AND NOT public.has_role(p.id, 'client'::app_role)
      ON CONFLICT DO NOTHING;

      SELECT EXISTS (SELECT 1 FROM public.ticket_assignees WHERE ticket_id = t.id) INTO has_clinic_match;
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
