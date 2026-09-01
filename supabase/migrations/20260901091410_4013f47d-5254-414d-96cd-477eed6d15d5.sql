CREATE OR REPLACE FUNCTION public.create_clinic_onboarding_tasks(_clinic_id uuid, _clinic_name text, _department department_type, _creator uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t record;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.department_tasks
    WHERE clinic_id = _clinic_id AND department = _department
      AND description LIKE '[New clinic onboarding]%'
  ) THEN
    RETURN;
  END IF;

  FOR t IN
    SELECT * FROM (
      VALUES
        ('website'::department_type, 'Set up website for ' || _clinic_name, 'Kick off website setup: confirm hosting/domain access, review current site, and create the delivery checklist.', 'high'::task_priority),
        ('website'::department_type, 'Install tracking script on ' || _clinic_name || ' website', 'Add the portal tracking script to the site and verify pageviews are being recorded.', 'high'::task_priority),
        ('website'::department_type, 'Run first website health check for ' || _clinic_name, 'Run PageSpeed / health scan and log baseline scores.', 'medium'::task_priority),

        ('seo'::department_type, 'Configure Google Analytics for ' || _clinic_name, 'Link the GA4 property for this clinic in Clinic Detail > Connections.', 'high'::task_priority),
        ('seo'::department_type, 'Configure Google Search Console for ' || _clinic_name, 'Link the Search Console property and verify keyword/impression data syncs.', 'high'::task_priority),
        ('seo'::department_type, 'Configure Google Business Profile for ' || _clinic_name, 'Connect GBP so local performance and posts can be managed from the portal.', 'medium'::task_priority),
        ('seo'::department_type, 'Set up SEO baseline for ' || _clinic_name, 'Record baseline rankings, target keywords, and geo cluster assignment.', 'medium'::task_priority),

        ('google_ads'::department_type, 'Configure Google Ads for ' || _clinic_name, 'Link the Google Ads account via the MCC connection and confirm the account name matches this clinic.', 'high'::task_priority),
        ('google_ads'::department_type, 'Configure conversion tracking for ' || _clinic_name, 'Verify calls, forms, and booking conversions are tracked correctly.', 'high'::task_priority),
        ('google_ads'::department_type, 'Review campaign structure for ' || _clinic_name, 'Audit existing campaigns, budgets, and geo targeting; document recommendations.', 'medium'::task_priority),

        ('social_media'::department_type, 'Configure social media accounts for ' || _clinic_name, 'Connect Meta (Facebook/Instagram) and confirm page/asset access.', 'high'::task_priority),
        ('social_media'::department_type, 'Add bio and profile details for ' || _clinic_name, 'Update bios, profile/cover images, contact details, and links across social profiles.', 'high'::task_priority),
        ('social_media'::department_type, 'Collect Brand DNA for ' || _clinic_name, 'Run website extraction, review mining, and schedule the client discovery call.', 'high'::task_priority),
        ('social_media'::department_type, 'Set monthly signals for ' || _clinic_name, 'Fill in the first month of preferences, promotions, and local context.', 'medium'::task_priority)
    ) AS v(dept, title, descr, prio)
    WHERE v.dept = _department
  LOOP
    INSERT INTO public.department_tasks (clinic_id, department, title, description, priority, status, created_by)
    VALUES (_clinic_id, _department, t.title, '[New clinic onboarding] ' || t.descr, t.prio, 'todo', _creator);
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public.create_clinic_onboarding_tasks(uuid, text, department_type, uuid) FROM PUBLIC, anon, authenticated;