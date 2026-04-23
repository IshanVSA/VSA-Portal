
-- 1. Create the table
CREATE TABLE public.department_ticket_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.department_tickets(id) ON DELETE CASCADE,
  department public.department_type NOT NULL,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status public.ticket_status NOT NULL DEFAULT 'open',
  completed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticket_id, department)
);

CREATE INDEX idx_dta_ticket ON public.department_ticket_assignments(ticket_id);
CREATE INDEX idx_dta_assigned_to ON public.department_ticket_assignments(assigned_to);
CREATE INDEX idx_dta_dept_status ON public.department_ticket_assignments(department, status);

ALTER TABLE public.department_ticket_assignments ENABLE ROW LEVEL SECURITY;

-- 2. updated_at trigger
CREATE TRIGGER trg_dta_updated_at
BEFORE UPDATE ON public.department_ticket_assignments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Visibility map (mirrors src/lib/ticket-department-map.ts)
CREATE OR REPLACE FUNCTION public.get_ticket_visibility_departments(_ticket_type text, _description text)
RETURNS public.department_type[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  depts public.department_type[];
BEGIN
  depts := CASE _ticket_type
    WHEN 'Time Changes'              THEN ARRAY['website','seo','google_ads','social_media']::public.department_type[]
    WHEN 'Pop-up Offers'             THEN ARRAY['website','social_media']::public.department_type[]
    WHEN 'Third Party Integrations'  THEN ARRAY['website']::public.department_type[]
    WHEN 'Payment Options'           THEN ARRAY['website']::public.department_type[]
    WHEN 'Add/Remove Team Members'   THEN ARRAY['website']::public.department_type[]
    WHEN 'New Forms'                 THEN ARRAY['website']::public.department_type[]
    WHEN 'Price List Updates'        THEN ARRAY['website','seo','social_media']::public.department_type[]
    WHEN 'Emergency'                 THEN ARRAY['website']::public.department_type[]
    WHEN 'Dashboard Access'          THEN ARRAY['google_ads']::public.department_type[]
    WHEN 'Analytics Review'          THEN ARRAY['google_ads']::public.department_type[]
    WHEN 'Monthly Performance Report' THEN ARRAY['google_ads']::public.department_type[]
    WHEN 'Call Volume Issues'        THEN ARRAY['google_ads']::public.department_type[]
    WHEN 'Wrong Call Tracking'       THEN ARRAY['google_ads']::public.department_type[]
    WHEN 'Campaign Adjustments'      THEN ARRAY['google_ads']::public.department_type[]
    WHEN 'Content Request'           THEN ARRAY['social_media']::public.department_type[]
    WHEN 'Client Visit'              THEN ARRAY['social_media']::public.department_type[]
    WHEN 'Bulk Uploads'              THEN ARRAY['social_media']::public.department_type[]
    WHEN 'Special Promotion'         THEN ARRAY['social_media']::public.department_type[]
    WHEN 'Boost'                     THEN ARRAY['social_media']::public.department_type[]
    ELSE ARRAY[]::public.department_type[]
  END;

  -- Conditional: Add/Remove Team Members also fans out to social_media
  IF _ticket_type = 'Add/Remove Team Members'
     AND _description IS NOT NULL
     AND position('Promote on Social Media: Yes' in _description) > 0 THEN
    depts := depts || ARRAY['social_media']::public.department_type[];
  END IF;

  RETURN depts;
END;
$$;

-- 4. Pick best assignee for a given (clinic, department)
CREATE OR REPLACE FUNCTION public.pick_assignee_for_dept(_clinic_id uuid, _department public.department_type)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed_roles text[];
  picked uuid;
BEGIN
  allowed_roles := CASE _department::text
    WHEN 'website'      THEN ARRAY['Developer','Maintenance']
    WHEN 'seo'          THEN ARRAY['SEO Lead']
    WHEN 'google_ads'   THEN ARRAY['Ads Strategist','Ads Analyst']
    WHEN 'social_media' THEN ARRAY['Social & Concierge']
    ELSE ARRAY[]::text[]
  END;
  IF array_length(allowed_roles,1) IS NULL THEN RETURN NULL; END IF;

  IF _clinic_id IS NOT NULL THEN
    SELECT p.id INTO picked
    FROM public.profiles p
    WHERE p.team_role = ANY(allowed_roles)
      AND EXISTS (SELECT 1 FROM public.clinic_team_members ctm WHERE ctm.user_id = p.id AND ctm.clinic_id = _clinic_id)
      AND NOT public.has_role(p.id, 'client'::app_role)
    LIMIT 1;
  END IF;

  RETURN picked;
END;
$$;

-- 5. Fan-out trigger on ticket insert
CREATE OR REPLACE FUNCTION public.fanout_ticket_assignments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  depts public.department_type[];
  d public.department_type;
  assignee uuid;
  init_status public.ticket_status;
BEGIN
  depts := public.get_ticket_visibility_departments(NEW.ticket_type, NEW.description);
  IF array_length(depts,1) IS NULL OR array_length(depts,1) = 0 THEN
    -- still create one row for the originating department so rollup logic stays consistent
    depts := ARRAY[NEW.department]::public.department_type[];
  END IF;

  FOREACH d IN ARRAY depts LOOP
    -- For the originating department, copy current assignee/status from the parent
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

CREATE TRIGGER trg_fanout_ticket_assignments
AFTER INSERT ON public.department_tickets
FOR EACH ROW EXECUTE FUNCTION public.fanout_ticket_assignments();

-- 6. Rollup function + trigger
CREATE OR REPLACE FUNCTION public.compute_ticket_rollup_status(_ticket_id uuid)
RETURNS public.ticket_status
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total int;
  completed int;
  any_void int;
  any_emergency int;
  any_in_progress int;
BEGIN
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE status = 'completed'::public.ticket_status),
         COUNT(*) FILTER (WHERE status = 'void'::public.ticket_status),
         COUNT(*) FILTER (WHERE status = 'emergency'::public.ticket_status),
         COUNT(*) FILTER (WHERE status = 'in_progress'::public.ticket_status)
  INTO total, completed, any_void, any_emergency, any_in_progress
  FROM public.department_ticket_assignments
  WHERE ticket_id = _ticket_id;

  IF total = 0 THEN RETURN 'open'::public.ticket_status; END IF;
  IF any_void > 0 THEN RETURN 'void'::public.ticket_status; END IF;
  IF completed = total THEN RETURN 'completed'::public.ticket_status; END IF;
  IF any_emergency > 0 THEN RETURN 'emergency'::public.ticket_status; END IF;
  IF any_in_progress > 0 THEN RETURN 'in_progress'::public.ticket_status; END IF;
  RETURN 'open'::public.ticket_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_parent_ticket_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rollup public.ticket_status;
  tid uuid;
BEGIN
  tid := COALESCE(NEW.ticket_id, OLD.ticket_id);
  rollup := public.compute_ticket_rollup_status(tid);

  -- auto-set completed_at on assignment when it transitions to completed
  IF TG_OP IN ('INSERT','UPDATE') THEN
    IF NEW.status = 'completed'::public.ticket_status AND NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    ELSIF NEW.status <> 'completed'::public.ticket_status AND NEW.completed_at IS NOT NULL THEN
      NEW.completed_at := NULL;
    END IF;
  END IF;

  UPDATE public.department_tickets
  SET status = rollup,
      updated_at = now()
  WHERE id = tid AND status IS DISTINCT FROM rollup;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_dta_sync_parent_status_biu
BEFORE INSERT OR UPDATE ON public.department_ticket_assignments
FOR EACH ROW EXECUTE FUNCTION public.sync_parent_ticket_status();

CREATE TRIGGER trg_dta_sync_parent_status_aiud
AFTER INSERT OR UPDATE OR DELETE ON public.department_ticket_assignments
FOR EACH ROW EXECUTE FUNCTION public.sync_parent_ticket_status();

-- 7. RLS policies
CREATE POLICY "Admins full access on dta"
ON public.department_ticket_assignments
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Dept members can view their dept assignments"
ON public.department_ticket_assignments
FOR SELECT
TO authenticated
USING (public.is_department_member(auth.uid(), department));

CREATE POLICY "Dept members can update their dept assignments"
ON public.department_ticket_assignments
FOR UPDATE
TO authenticated
USING (public.is_department_member(auth.uid(), department))
WITH CHECK (public.is_department_member(auth.uid(), department));

CREATE POLICY "Concierges can view assignments for their clinics"
ON public.department_ticket_assignments
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'concierge'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.department_tickets t
    WHERE t.id = ticket_id
      AND t.clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  )
);

CREATE POLICY "Concierges can update assignments for their clinics"
ON public.department_ticket_assignments
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'concierge'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.department_tickets t
    WHERE t.id = ticket_id
      AND t.clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'concierge'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.department_tickets t
    WHERE t.id = ticket_id
      AND t.clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  )
);

CREATE POLICY "Clients can view assignments for own clinic tickets"
ON public.department_ticket_assignments
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'client'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.department_tickets t
    JOIN public.clinics c ON c.id = t.clinic_id
    WHERE t.id = ticket_id AND c.owner_user_id = auth.uid()
  )
);

-- 8. Backfill for existing tickets
DO $$
DECLARE
  rec RECORD;
  depts public.department_type[];
  d public.department_type;
  assignee uuid;
  init_status public.ticket_status;
BEGIN
  FOR rec IN SELECT id, ticket_type, description, department, assigned_to, status, clinic_id FROM public.department_tickets LOOP
    depts := public.get_ticket_visibility_departments(rec.ticket_type, rec.description);
    IF array_length(depts,1) IS NULL OR array_length(depts,1) = 0 THEN
      depts := ARRAY[rec.department]::public.department_type[];
    END IF;

    FOREACH d IN ARRAY depts LOOP
      IF d = rec.department THEN
        assignee := rec.assigned_to;
        init_status := rec.status;
      ELSE
        assignee := public.pick_assignee_for_dept(rec.clinic_id, d);
        init_status := 'open'::public.ticket_status;
      END IF;

      INSERT INTO public.department_ticket_assignments (ticket_id, department, assigned_to, status, completed_at)
      VALUES (
        rec.id, d, assignee, init_status,
        CASE WHEN init_status = 'completed'::public.ticket_status THEN now() ELSE NULL END
      )
      ON CONFLICT (ticket_id, department) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;
