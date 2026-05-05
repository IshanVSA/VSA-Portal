-- Helper: returns true if the given department is enabled for the clinic.
-- For unknown clinics or unknown departments, defaults to true so existing
-- behavior is preserved (no clinic_id => no gating).
CREATE OR REPLACE FUNCTION public.is_department_enabled_for_clinic(_clinic_id uuid, _department public.department_type)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  c RECORD;
BEGIN
  IF _clinic_id IS NULL THEN
    RETURN true;
  END IF;

  SELECT website_enabled, seo_enabled, google_ads_enabled, social_media_enabled
    INTO c
  FROM public.clinics
  WHERE id = _clinic_id;

  IF NOT FOUND THEN
    RETURN true;
  END IF;

  RETURN CASE _department::text
    WHEN 'website'      THEN COALESCE(c.website_enabled, true)
    WHEN 'seo'          THEN COALESCE(c.seo_enabled, true)
    WHEN 'google_ads'   THEN COALESCE(c.google_ads_enabled, true)
    WHEN 'social_media' THEN COALESCE(c.social_media_enabled, true)
    ELSE true
  END;
END;
$$;

-- Replace fan-out trigger to skip locked departments for the ticket's clinic.
-- The originating department is always kept (creating a ticket inside a locked
-- department shouldn't normally be possible, but we don't drop the parent row).
CREATE OR REPLACE FUNCTION public.fanout_ticket_assignments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  depts public.department_type[];
  filtered public.department_type[];
  d public.department_type;
  assignee uuid;
  init_status public.ticket_status;
BEGIN
  depts := public.get_ticket_visibility_departments(NEW.ticket_type, NEW.description);
  IF array_length(depts,1) IS NULL OR array_length(depts,1) = 0 THEN
    depts := ARRAY[NEW.department]::public.department_type[];
  END IF;

  -- Filter out departments locked for this clinic, but always keep the
  -- originating department to preserve rollup integrity.
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
    IF d = NEW.department THEN
      assignee := NEW.assigned_to;
      init_status := NEW.status;
    ELSE
      assignee := public.pick_assignee_for_dept(NEW.clinic_id, d);
      init_status := 'open'::public.ticket_status;
    END IF;

    INSERT INTO public.department_ticket_assignments (ticket_id, department, assigned_to, status, completed_at)
    VALUES (
      NEW.id,
      d,
      assignee,
      init_status,
      CASE WHEN init_status = 'completed'::public.ticket_status THEN now() ELSE NULL END
    )
    ON CONFLICT (ticket_id, department) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;