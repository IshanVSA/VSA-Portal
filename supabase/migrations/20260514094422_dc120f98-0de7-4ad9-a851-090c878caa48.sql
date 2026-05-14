CREATE OR REPLACE FUNCTION public.fanout_ticket_assignments()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  depts public.department_type[];
  filtered public.department_type[];
  d public.department_type;
  init_status public.ticket_status;
  assignee uuid;
  has_origin boolean := false;
BEGIN
  depts := public.get_ticket_visibility_departments(NEW.ticket_type, NEW.description);
  IF array_length(depts,1) IS NULL OR array_length(depts,1) = 0 THEN
    depts := ARRAY[NEW.department]::public.department_type[];
  END IF;

  -- Always include the originating department so the ticket is visible in
  -- its own department's Tickets tab, regardless of fan-out opt-ins.
  FOREACH d IN ARRAY depts LOOP
    IF d = NEW.department THEN has_origin := true; END IF;
  END LOOP;
  IF NOT has_origin THEN
    depts := ARRAY[NEW.department]::public.department_type[] || depts;
  END IF;

  filtered := ARRAY[]::public.department_type[];
  FOREACH d IN ARRAY depts LOOP
    IF d = NEW.department OR public.is_department_enabled_for_clinic(NEW.clinic_id, d) THEN
      filtered := filtered || d;
    END IF;
  END LOOP;
  IF array_length(filtered,1) IS NULL OR array_length(filtered,1) = 0 THEN
    filtered := ARRAY[NEW.department]::public.department_type[];
  END IF;

  FOREACH d IN ARRAY filtered LOOP
    IF d = NEW.department AND NEW.assigned_to IS NOT NULL THEN
      assignee := NEW.assigned_to;
      init_status := NEW.status;
    ELSE
      assignee := NULL;
      init_status := 'open'::public.ticket_status;
    END IF;

    INSERT INTO public.department_ticket_assignments (ticket_id, department, assigned_to, status, completed_at)
    VALUES (
      NEW.id, d, assignee, init_status,
      CASE WHEN init_status = 'completed'::public.ticket_status THEN now() ELSE NULL END
    )
    ON CONFLICT (ticket_id, department) DO NOTHING;

    IF assignee IS NULL THEN
      INSERT INTO public.department_ticket_candidates (ticket_id, department, user_id)
      SELECT NEW.id, d, u FROM public.list_assignees_for_dept(NEW.clinic_id, d) AS u
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- Backfill: any ticket missing an assignment row for its originating department
INSERT INTO public.department_ticket_assignments (ticket_id, department, assigned_to, status)
SELECT t.id, t.department, t.assigned_to,
       CASE WHEN t.status = 'void' THEN 'open'::public.ticket_status ELSE t.status END
FROM public.department_tickets t
LEFT JOIN public.department_ticket_assignments a
  ON a.ticket_id = t.id AND a.department = t.department
WHERE a.id IS NULL
ON CONFLICT (ticket_id, department) DO NOTHING;