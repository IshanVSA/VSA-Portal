
-- Content Request workflow extensions on department_tickets
ALTER TABLE public.department_tickets
  ADD COLUMN IF NOT EXISTS content_preview jsonb,
  ADD COLUMN IF NOT EXISTS content_deliverable_files text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS content_change_notes text,
  ADD COLUMN IF NOT EXISTS content_approval_status text,
  ADD COLUMN IF NOT EXISTS content_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS content_ready_for_review_at timestamptz;

-- SECURITY DEFINER helper for client-side approve / request-changes
CREATE OR REPLACE FUNCTION public.client_set_content_approval(
  _ticket_id uuid,
  _status text,
  _notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ticket public.department_tickets%ROWTYPE;
  _can boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Auth required'; END IF;
  IF _status NOT IN ('approved','changes_requested') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  SELECT * INTO _ticket FROM public.department_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket not found'; END IF;
  IF _ticket.ticket_type <> 'Content Request' THEN
    RAISE EXCEPTION 'Not a content request ticket';
  END IF;

  -- Caller must be the clinic owner, a sub-account with access, or admin
  SELECT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.clinics c WHERE c.id = _ticket.clinic_id AND c.owner_user_id = auth.uid())
    OR _ticket.clinic_id = ANY (ARRAY(SELECT public.get_sub_account_clinic_ids(auth.uid())))
  ) INTO _can;

  IF NOT _can THEN RAISE EXCEPTION 'Not authorized'; END IF;

  IF _status = 'approved' THEN
    UPDATE public.department_tickets
      SET content_approval_status = 'approved',
          content_approved_at = now(),
          updated_at = now()
      WHERE id = _ticket_id;
  ELSE
    UPDATE public.department_tickets
      SET content_approval_status = 'changes_requested',
          content_change_notes = COALESCE(_notes, ''),
          status = 'in_progress'::public.ticket_status,
          content_ready_for_review_at = NULL,
          updated_at = now()
      WHERE id = _ticket_id;
    -- Re-open all dept assignments for this ticket
    UPDATE public.department_ticket_assignments
      SET status = 'in_progress'::public.ticket_status,
          completed_at = NULL,
          updated_at = now()
      WHERE ticket_id = _ticket_id
        AND status = 'completed'::public.ticket_status;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.client_set_content_approval(uuid, text, text) TO authenticated;

-- pg_cron + pg_net for auto-approval
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
