CREATE OR REPLACE FUNCTION public.get_ticket_visibility_departments(_ticket_type text, _description text)
 RETURNS department_type[]
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  depts public.department_type[] := ARRAY[]::public.department_type[];
BEGIN
  -- Visibility is intentionally left empty here. The fanout trigger always
  -- includes the originating department, so returning an empty array means
  -- "only the originating department". The social_media opt-in below is the
  -- single exception clients can trigger from the ticket form.
  IF _description IS NOT NULL
     AND position('Promote on Social Media: Yes' in _description) > 0 THEN
    depts := depts || ARRAY['social_media']::public.department_type[];
  END IF;

  RETURN depts;
END;
$function$;