-- 1) ticket_assignees join table
CREATE TABLE IF NOT EXISTS public.ticket_assignees (
  ticket_id uuid NOT NULL REFERENCES public.department_tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ticket_assignees_user ON public.ticket_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_assignees_ticket ON public.ticket_assignees(ticket_id);

ALTER TABLE public.ticket_assignees ENABLE ROW LEVEL SECURITY;

-- RLS: admins full access
CREATE POLICY "Admins full access on ticket_assignees"
ON public.ticket_assignees FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Concierges/staff can view assignees for tickets in their scope
CREATE POLICY "Staff can view ticket_assignees"
ON public.ticket_assignees FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'concierge'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.department_tickets t
    WHERE t.id = ticket_assignees.ticket_id
      AND public.is_department_member(auth.uid(), t.department)
  )
);

-- Clients can view assignees for their clinic's tickets (read-only)
CREATE POLICY "Clients can view assignees for own clinic tickets"
ON public.ticket_assignees FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'client'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.department_tickets t
    JOIN public.clinics c ON c.id = t.clinic_id
    WHERE t.id = ticket_assignees.ticket_id
      AND c.owner_user_id = auth.uid()
  )
);

-- 2) Replace auto_assign trigger to populate the pool instead
CREATE OR REPLACE FUNCTION public.auto_assign_ticket_pool()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  has_clinic_match boolean := false;
BEGIN
  -- If an assignee was explicitly provided, keep behavior simple: also seed the pool with that user.
  IF NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.ticket_assignees (ticket_id, user_id)
    VALUES (NEW.id, NEW.assigned_to)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
  END IF;

  -- Try clinic-scoped department members first
  IF NEW.clinic_id IS NOT NULL THEN
    INSERT INTO public.ticket_assignees (ticket_id, user_id)
    SELECT NEW.id, dm.user_id
    FROM public.department_members dm
    WHERE dm.department = NEW.department
      AND EXISTS (
        SELECT 1 FROM public.clinic_team_members ctm
        WHERE ctm.user_id = dm.user_id AND ctm.clinic_id = NEW.clinic_id
      )
    ON CONFLICT DO NOTHING;

    SELECT EXISTS (SELECT 1 FROM public.ticket_assignees WHERE ticket_id = NEW.id)
    INTO has_clinic_match;
  END IF;

  -- Fallback: all department members
  IF NOT has_clinic_match THEN
    INSERT INTO public.ticket_assignees (ticket_id, user_id)
    SELECT NEW.id, dm.user_id
    FROM public.department_members dm
    WHERE dm.department = NEW.department
    ON CONFLICT DO NOTHING;
  END IF;

  -- Leave assigned_to NULL (pool state)
  RETURN NEW;
END;
$function$;

-- Drop old trigger if present, attach the new one (AFTER INSERT so NEW.id exists)
DROP TRIGGER IF EXISTS trg_auto_assign_ticket ON public.department_tickets;
DROP TRIGGER IF EXISTS auto_assign_ticket ON public.department_tickets;
DROP TRIGGER IF EXISTS trg_auto_assign_ticket_pool ON public.department_tickets;

CREATE TRIGGER trg_auto_assign_ticket_pool
AFTER INSERT ON public.department_tickets
FOR EACH ROW
EXECUTE FUNCTION public.auto_assign_ticket_pool();

-- 3) Claim-on-in-progress trigger
CREATE OR REPLACE FUNCTION public.claim_ticket_on_in_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Auto-claim when moving to in_progress while in the pool
  IF NEW.status = 'in_progress'::ticket_status
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.assigned_to IS NULL
     AND auth.uid() IS NOT NULL
  THEN
    -- Only auto-claim if the actor is one of the pool members (or admin)
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

DROP TRIGGER IF EXISTS trg_claim_ticket_on_in_progress ON public.department_tickets;
CREATE TRIGGER trg_claim_ticket_on_in_progress
BEFORE UPDATE ON public.department_tickets
FOR EACH ROW
EXECUTE FUNCTION public.claim_ticket_on_in_progress();

-- 4) When assigned_to flips from NULL to a uuid, prune the pool to only that user
CREATE OR REPLACE FUNCTION public.prune_pool_on_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.assigned_to IS NOT NULL
     AND (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to)
  THEN
    -- Ensure the claimer is in the pool, then delete everyone else
    INSERT INTO public.ticket_assignees (ticket_id, user_id)
    VALUES (NEW.id, NEW.assigned_to)
    ON CONFLICT DO NOTHING;

    DELETE FROM public.ticket_assignees
    WHERE ticket_id = NEW.id
      AND user_id <> NEW.assigned_to;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_prune_pool_on_claim ON public.department_tickets;
CREATE TRIGGER trg_prune_pool_on_claim
AFTER UPDATE OF assigned_to ON public.department_tickets
FOR EACH ROW
EXECUTE FUNCTION public.prune_pool_on_claim();