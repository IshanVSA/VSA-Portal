DELETE FROM public.department_ticket_assignments dta
USING public.department_tickets t
WHERE dta.ticket_id = t.id
  AND dta.department <> t.department
  AND NOT (
    dta.department = 'social_media'::public.department_type
    AND t.description IS NOT NULL
    AND position('Promote on Social Media: Yes' in t.description) > 0
  );