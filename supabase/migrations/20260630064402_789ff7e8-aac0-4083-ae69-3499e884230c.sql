CREATE OR REPLACE FUNCTION public.get_ticket_visibility_departments(_ticket_type text, _description text)
 RETURNS department_type[]
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  depts public.department_type[] := ARRAY[]::public.department_type[];
BEGIN
  -- Time Changes always fan out to Website + Google Ads (where call tracking / hours matter).
  IF _ticket_type = 'Time Changes' THEN
    depts := depts || ARRAY['website','google_ads']::public.department_type[];
  END IF;

  -- Opt-in fan-out to Social Media when the request flags it.
  IF _description IS NOT NULL
     AND position('Promote on Social Media: Yes' in _description) > 0 THEN
    depts := depts || ARRAY['social_media']::public.department_type[];
  END IF;

  RETURN depts;
END;
$function$;

-- Backfill existing Time Change tickets so they show up in google_ads (and website) too.
DO $$
DECLARE
  rec RECORD;
  d public.department_type;
  depts public.department_type[];
  assignee uuid;
BEGIN
  FOR rec IN
    SELECT id, ticket_type, description, department, clinic_id
    FROM public.department_tickets
    WHERE ticket_type = 'Time Changes'
  LOOP
    depts := public.get_ticket_visibility_departments(rec.ticket_type, rec.description);
    depts := depts || ARRAY[rec.department]::public.department_type[];
    FOREACH d IN ARRAY depts LOOP
      assignee := public.pick_assignee_for_dept(rec.clinic_id, d);
      INSERT INTO public.department_ticket_assignments (ticket_id, department, assigned_to, status)
      VALUES (rec.id, d, assignee, 'open'::public.ticket_status)
      ON CONFLICT (ticket_id, department) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;