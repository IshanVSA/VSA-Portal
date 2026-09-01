
CREATE OR REPLACE FUNCTION public.create_clinic_onboarding_tasks(_clinic_id uuid, _clinic_name text, _department department_type, _creator uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t record;
BEGIN
  -- Skip if onboarding tasks already exist for this clinic/department
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
        ('website'::department_type, 'Connect analytics for ' || _clinic_name, 'Connect Google Analytics (GA4) and confirm data flows into the portal.', 'high'::task_priority),
        ('website'::department_type, 'Run first website health check for ' || _clinic_name, 'Run PageSpeed / health scan and log baseline scores.', 'medium'::task_priority),

        ('seo'::department_type, 'Connect Google Analytics for ' || _clinic_name, 'Link the GA4 property for this clinic in Clinic Detail > Connections.', 'high'::task_priority),
        ('seo'::department_type, 'Connect Google Search Console for ' || _clinic_name, 'Link the Search Console property and verify keyword/impression data syncs.', 'high'::task_priority),
        ('seo'::department_type, 'Connect Google Business Profile for ' || _clinic_name, 'Connect GBP so local performance and posts can be managed from the portal.', 'medium'::task_priority),
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
$$;

CREATE OR REPLACE FUNCTION public.trg_clinic_onboarding_tasks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  creator uuid;
BEGIN
  creator := COALESCE(
    auth.uid(),
    NEW.assigned_concierge_id,
    NEW.owner_user_id,
    (SELECT user_id FROM public.user_roles WHERE role = 'admin' ORDER BY user_id LIMIT 1)
  );
  IF creator IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.website_enabled, false) THEN
      PERFORM public.create_clinic_onboarding_tasks(NEW.id, NEW.clinic_name, 'website', creator);
    END IF;
    IF COALESCE(NEW.seo_enabled, false) THEN
      PERFORM public.create_clinic_onboarding_tasks(NEW.id, NEW.clinic_name, 'seo', creator);
    END IF;
    IF COALESCE(NEW.google_ads_enabled, false) THEN
      PERFORM public.create_clinic_onboarding_tasks(NEW.id, NEW.clinic_name, 'google_ads', creator);
    END IF;
    IF COALESCE(NEW.social_media_enabled, false) THEN
      PERFORM public.create_clinic_onboarding_tasks(NEW.id, NEW.clinic_name, 'social_media', creator);
    END IF;
  ELSE
    IF COALESCE(NEW.website_enabled, false) AND NOT COALESCE(OLD.website_enabled, false) THEN
      PERFORM public.create_clinic_onboarding_tasks(NEW.id, NEW.clinic_name, 'website', creator);
    END IF;
    IF COALESCE(NEW.seo_enabled, false) AND NOT COALESCE(OLD.seo_enabled, false) THEN
      PERFORM public.create_clinic_onboarding_tasks(NEW.id, NEW.clinic_name, 'seo', creator);
    END IF;
    IF COALESCE(NEW.google_ads_enabled, false) AND NOT COALESCE(OLD.google_ads_enabled, false) THEN
      PERFORM public.create_clinic_onboarding_tasks(NEW.id, NEW.clinic_name, 'google_ads', creator);
    END IF;
    IF COALESCE(NEW.social_media_enabled, false) AND NOT COALESCE(OLD.social_media_enabled, false) THEN
      PERFORM public.create_clinic_onboarding_tasks(NEW.id, NEW.clinic_name, 'social_media', creator);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clinics_onboarding_tasks_ins ON public.clinics;
CREATE TRIGGER clinics_onboarding_tasks_ins
AFTER INSERT ON public.clinics
FOR EACH ROW EXECUTE FUNCTION public.trg_clinic_onboarding_tasks();

DROP TRIGGER IF EXISTS clinics_onboarding_tasks_upd ON public.clinics;
CREATE TRIGGER clinics_onboarding_tasks_upd
AFTER UPDATE OF website_enabled, seo_enabled, google_ads_enabled, social_media_enabled ON public.clinics
FOR EACH ROW EXECUTE FUNCTION public.trg_clinic_onboarding_tasks();
