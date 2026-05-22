
-- Candidate pool for shared/auto tasks
CREATE TABLE IF NOT EXISTS public.department_task_candidates (
  task_id uuid NOT NULL REFERENCES public.department_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);

ALTER TABLE public.department_task_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_candidates_select_self_or_admin"
  ON public.department_task_candidates
  FOR SELECT
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "task_candidates_admin_all_write"
  ON public.department_task_candidates
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_task_candidates_user ON public.department_task_candidates(user_id);

-- Extend UPDATE policy: candidates can update unclaimed (assigned_to IS NULL) pool tasks
DROP POLICY IF EXISTS tasks_update ON public.department_tasks;
CREATE POLICY tasks_update
  ON public.department_tasks
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR ((assigned_to = auth.uid()) AND public.is_clinic_dept_team_member(auth.uid(), clinic_id, department))
    OR (
      assigned_to IS NULL
      AND EXISTS (
        SELECT 1 FROM public.department_task_candidates c
        WHERE c.task_id = department_tasks.id AND c.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR ((assigned_to = auth.uid()) AND public.is_clinic_dept_team_member(auth.uid(), clinic_id, department))
    OR (
      EXISTS (
        SELECT 1 FROM public.department_task_candidates c
        WHERE c.task_id = department_tasks.id AND c.user_id = auth.uid()
      )
    )
  );

-- Extend SELECT policy: candidates can see their pool tasks even if they aren't on the clinic team
DROP POLICY IF EXISTS tasks_select ON public.department_tasks;
CREATE POLICY tasks_select
  ON public.department_tasks
  FOR SELECT
  USING (
    public.can_access_clinic_department(auth.uid(), clinic_id, department)
    OR EXISTS (
      SELECT 1 FROM public.department_task_candidates c
      WHERE c.task_id = department_tasks.id AND c.user_id = auth.uid()
    )
  );

-- Claim trigger: first candidate to change status from todo claims the task
CREATE OR REPLACE FUNCTION public.claim_task_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND OLD.status = 'todo'::public.task_status
     AND NEW.assigned_to IS NULL
     AND auth.uid() IS NOT NULL
  THEN
    IF EXISTS (
      SELECT 1 FROM public.department_task_candidates
      WHERE task_id = NEW.id AND user_id = auth.uid()
    ) OR public.has_role(auth.uid(), 'admin'::public.app_role) THEN
      NEW.assigned_to := auth.uid();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_claim_task_on_status_change ON public.department_tasks;
CREATE TRIGGER trg_claim_task_on_status_change
  BEFORE UPDATE ON public.department_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.claim_task_on_status_change();

-- Prune candidates once someone claims
CREATE OR REPLACE FUNCTION public.prune_task_pool_on_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL
     AND OLD.assigned_to IS DISTINCT FROM NEW.assigned_to
  THEN
    DELETE FROM public.department_task_candidates
    WHERE task_id = NEW.id AND user_id <> NEW.assigned_to;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prune_task_pool_on_claim ON public.department_tasks;
CREATE TRIGGER trg_prune_task_pool_on_claim
  AFTER UPDATE ON public.department_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.prune_task_pool_on_claim();
