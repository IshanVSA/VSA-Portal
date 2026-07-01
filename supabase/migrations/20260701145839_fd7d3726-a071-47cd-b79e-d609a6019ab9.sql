CREATE OR REPLACE FUNCTION public.get_ticket_visibility_departments(_ticket_type text, _description text)
 RETURNS department_type[]
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  depts public.department_type[] := ARRAY[]::public.department_type[];
BEGIN
  -- Time Changes always fan out to Website + Google Ads.
  IF _ticket_type = 'Time Changes' THEN
    depts := depts || ARRAY['website','google_ads']::public.department_type[];
  END IF;

  -- Opt-in fan-out to Social Media when the request flags it.
  IF _description IS NOT NULL
     AND position('Promote on Social Media: Yes' in _description) > 0 THEN
    depts := depts || ARRAY['social_media']::public.department_type[];
  END IF;

  -- Opt-in fan-out to Google Ads when the request flags it
  -- (e.g. Add/Remove Team Members that need staff bios reflected in ads).
  IF _description IS NOT NULL
     AND position('Promote on Google Ads: Yes' in _description) > 0 THEN
    depts := depts || ARRAY['google_ads']::public.department_type[];
  END IF;

  RETURN depts;
END;
$function$;