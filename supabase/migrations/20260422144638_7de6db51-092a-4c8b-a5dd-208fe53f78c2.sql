CREATE OR REPLACE FUNCTION public.get_ticket_user_directory(_ticket_id uuid)
RETURNS TABLE (
  user_id uuid,
  full_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'concierge'::app_role)
      AND EXISTS (
        SELECT 1
        FROM public.department_tickets t
        WHERE t.id = _ticket_id
          AND t.clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
      )
    )
    OR (
      public.has_role(auth.uid(), 'client'::app_role)
      AND EXISTS (
        SELECT 1
        FROM public.department_tickets t
        JOIN public.clinics c ON c.id = t.clinic_id
        WHERE t.id = _ticket_id
          AND c.owner_user_id = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.department_tickets t
      WHERE t.id = _ticket_id
        AND public.is_department_member(auth.uid(), t.department)
    )
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH related_users AS (
    SELECT t.created_by AS user_id
    FROM public.department_tickets t
    WHERE t.id = _ticket_id

    UNION

    SELECT t.assigned_to AS user_id
    FROM public.department_tickets t
    WHERE t.id = _ticket_id

    UNION

    SELECT ta.user_id
    FROM public.ticket_assignees ta
    WHERE ta.ticket_id = _ticket_id

    UNION

    SELECT al.actor_id AS user_id
    FROM public.ticket_audit_log al
    WHERE al.ticket_id = _ticket_id
  )
  SELECT p.id, COALESCE(NULLIF(p.full_name, ''), 'Unknown user') AS full_name
  FROM related_users ru
  JOIN public.profiles p ON p.id = ru.user_id
  WHERE ru.user_id IS NOT NULL;
END;
$$;