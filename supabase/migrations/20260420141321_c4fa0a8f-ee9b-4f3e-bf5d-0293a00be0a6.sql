-- Add void tracking columns
ALTER TABLE public.department_tickets
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS voided_by uuid,
  ADD COLUMN IF NOT EXISTS voided_at timestamptz;

-- Auto-assign trigger function: round-robin by lightest workload
CREATE OR REPLACE FUNCTION public.auto_assign_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  picked_user uuid;
BEGIN
  -- Only auto-assign if no assignee was provided at insert
  IF NEW.assigned_to IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Prefer department members who are also on the clinic team (if clinic_id present)
  IF NEW.clinic_id IS NOT NULL THEN
    SELECT dm.user_id INTO picked_user
    FROM public.department_members dm
    WHERE dm.department = NEW.department
      AND EXISTS (
        SELECT 1 FROM public.clinic_team_members ctm
        WHERE ctm.user_id = dm.user_id AND ctm.clinic_id = NEW.clinic_id
      )
    ORDER BY (
      SELECT COUNT(*) FROM public.department_tickets t
      WHERE t.assigned_to = dm.user_id
        AND t.status IN ('open'::ticket_status, 'in_progress'::ticket_status)
    ) ASC, dm.created_at ASC
    LIMIT 1;
  END IF;

  -- Fallback: any department member with lightest workload
  IF picked_user IS NULL THEN
    SELECT dm.user_id INTO picked_user
    FROM public.department_members dm
    WHERE dm.department = NEW.department
    ORDER BY (
      SELECT COUNT(*) FROM public.department_tickets t
      WHERE t.assigned_to = dm.user_id
        AND t.status IN ('open'::ticket_status, 'in_progress'::ticket_status)
    ) ASC, dm.created_at ASC
    LIMIT 1;
  END IF;

  IF picked_user IS NOT NULL THEN
    NEW.assigned_to := picked_user;
    IF NEW.status = 'open'::ticket_status THEN
      NEW.status := 'in_progress'::ticket_status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_assign_ticket ON public.department_tickets;
CREATE TRIGGER trg_auto_assign_ticket
  BEFORE INSERT ON public.department_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_ticket();
