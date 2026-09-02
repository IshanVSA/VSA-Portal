CREATE OR REPLACE FUNCTION public.fanout_task_candidates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.assigned_to IS NULL THEN
    INSERT INTO public.department_task_candidates (task_id, user_id)
    SELECT NEW.id, p.id
    FROM public.profiles p
    WHERE p.team_role = ANY (
      CASE NEW.department::text
        WHEN 'website'      THEN ARRAY['Developer','Maintenance']
        WHEN 'seo'          THEN ARRAY['SEO Lead']
        WHEN 'google_ads'   THEN ARRAY['Ads Strategist','Ads Analyst']
        WHEN 'social_media' THEN ARRAY['Social & Concierge','Meta Ads Specialist']
        ELSE ARRAY[]::text[]
      END
    )
    AND EXISTS (
      SELECT 1 FROM public.clinic_team_members ctm
      WHERE ctm.user_id = p.id AND ctm.clinic_id = NEW.clinic_id
    )
    AND NOT public.has_role(p.id, 'client'::public.app_role)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

DELETE FROM public.department_task_candidates dc
USING public.department_tasks t
WHERE t.id = dc.task_id
  AND NOT public.is_clinic_dept_team_member(dc.user_id, t.clinic_id, t.department);