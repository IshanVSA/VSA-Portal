
-- 1. Candidates table
CREATE TABLE IF NOT EXISTS public.department_ticket_candidates (
  ticket_id uuid NOT NULL REFERENCES public.department_tickets(id) ON DELETE CASCADE,
  department public.department_type NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, department, user_id)
);
CREATE INDEX IF NOT EXISTS idx_dtc_user ON public.department_ticket_candidates(user_id);
CREATE INDEX IF NOT EXISTS idx_dtc_ticket_dept ON public.department_ticket_candidates(ticket_id, department);

ALTER TABLE public.department_ticket_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dtc_admin_all" ON public.department_ticket_candidates;
CREATE POLICY "dtc_admin_all" ON public.department_ticket_candidates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "dtc_self_read" ON public.department_ticket_candidates;
CREATE POLICY "dtc_self_read" ON public.department_ticket_candidates
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 2. Helper: list all matching team members for a clinic + department
CREATE OR REPLACE FUNCTION public.list_assignees_for_dept(_clinic_id uuid, _department public.department_type)
RETURNS SETOF uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  allowed_roles text[];
  has_clinic_match boolean := false;
BEGIN
  allowed_roles := CASE _department::text
    WHEN 'website'      THEN ARRAY['Developer','Maintenance']
    WHEN 'seo'          THEN ARRAY['SEO Lead']
    WHEN 'google_ads'   THEN ARRAY['Ads Strategist','Ads Analyst']
    WHEN 'social_media' THEN ARRAY['Social & Concierge','Meta Ads Specialist']
    ELSE ARRAY[]::text[]
  END;
  IF array_length(allowed_roles,1) IS NULL THEN RETURN; END IF;

  IF _clinic_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.team_role = ANY(allowed_roles)
        AND EXISTS (SELECT 1 FROM public.clinic_team_members ctm WHERE ctm.user_id = p.id AND ctm.clinic_id = _clinic_id)
        AND NOT public.has_role(p.id, 'client'::public.app_role)
    ) INTO has_clinic_match;

    IF has_clinic_match THEN
      RETURN QUERY
        SELECT p.id FROM public.profiles p
        WHERE p.team_role = ANY(allowed_roles)
          AND EXISTS (SELECT 1 FROM public.clinic_team_members ctm WHERE ctm.user_id = p.id AND ctm.clinic_id = _clinic_id)
          AND NOT public.has_role(p.id, 'client'::public.app_role);
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
    SELECT p.id FROM public.profiles p
    WHERE p.team_role = ANY(allowed_roles)
      AND NOT public.has_role(p.id, 'client'::public.app_role);
END;
$$;

-- 3. Replace fanout to broadcast (no auto-pick of single assignee)
CREATE OR REPLACE FUNCTION public.fanout_ticket_assignments()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  depts public.department_type[];
  filtered public.department_type[];
  d public.department_type;
  init_status public.ticket_status;
  assignee uuid;
BEGIN
  depts := public.get_ticket_visibility_departments(NEW.ticket_type, NEW.description);
  IF array_length(depts,1) IS NULL OR array_length(depts,1) = 0 THEN
    depts := ARRAY[NEW.department]::public.department_type[];
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

    -- Broadcast: insert candidate rows for every matching team member when unassigned
    IF assignee IS NULL THEN
      INSERT INTO public.department_ticket_candidates (ticket_id, department, user_id)
      SELECT NEW.id, d, u FROM public.list_assignees_for_dept(NEW.clinic_id, d) AS u
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- 4. Claim trigger on DTA: first person to change status (or assignment set) wins
CREATE OR REPLACE FUNCTION public.claim_dta_on_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  -- If status changes while no one is assigned, claim for the actor (if eligible)
  IF NEW.assigned_to IS NULL
     AND NEW.status IS DISTINCT FROM OLD.status
     AND uid IS NOT NULL
  THEN
    IF public.has_role(uid, 'admin'::public.app_role) OR EXISTS (
      SELECT 1 FROM public.department_ticket_candidates
      WHERE ticket_id = NEW.ticket_id AND department = NEW.department AND user_id = uid
    ) THEN
      NEW.assigned_to := uid;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_claim_dta_on_change ON public.department_ticket_assignments;
CREATE TRIGGER trg_claim_dta_on_change
BEFORE UPDATE ON public.department_ticket_assignments
FOR EACH ROW EXECUTE FUNCTION public.claim_dta_on_change();

-- 5. Cleanup candidates after someone claims (or admin assigns)
CREATE OR REPLACE FUNCTION public.prune_dta_candidates()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to)
  THEN
    DELETE FROM public.department_ticket_candidates
    WHERE ticket_id = NEW.ticket_id AND department = NEW.department;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prune_dta_candidates ON public.department_ticket_assignments;
CREATE TRIGGER trg_prune_dta_candidates
AFTER INSERT OR UPDATE OF assigned_to ON public.department_ticket_assignments
FOR EACH ROW EXECUTE FUNCTION public.prune_dta_candidates();

-- 6. Backfill candidates for all currently unassigned DTA rows
INSERT INTO public.department_ticket_candidates (ticket_id, department, user_id)
SELECT dta.ticket_id, dta.department, u
FROM public.department_ticket_assignments dta
JOIN public.department_tickets t ON t.id = dta.ticket_id
CROSS JOIN LATERAL public.list_assignees_for_dept(t.clinic_id, dta.department) AS u
WHERE dta.assigned_to IS NULL
  AND dta.status IN ('open'::public.ticket_status, 'in_progress'::public.ticket_status, 'emergency'::public.ticket_status)
ON CONFLICT DO NOTHING;
