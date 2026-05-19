
-- Enums
DO $$ BEGIN
  CREATE TYPE public.task_priority AS ENUM ('low','medium','high','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.task_status AS ENUM ('todo','in_progress','done','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Helper: who can access a task in (clinic, department)
CREATE OR REPLACE FUNCTION public.can_access_clinic_department(_user_id uuid, _clinic_id uuid, _department public.department_type)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::public.app_role)
    OR public.is_clinic_dept_team_member(_user_id, _clinic_id, _department);
$$;

-- Main tasks table
CREATE TABLE public.department_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  department public.department_type NOT NULL,
  title text NOT NULL,
  description text,
  priority public.task_priority NOT NULL DEFAULT 'medium',
  status public.task_status NOT NULL DEFAULT 'todo',
  due_date date,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dept_tasks_clinic_dept ON public.department_tasks(clinic_id, department);
CREATE INDEX idx_dept_tasks_assignee ON public.department_tasks(assigned_to);
CREATE INDEX idx_dept_tasks_status ON public.department_tasks(status);

ALTER TABLE public.department_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_select" ON public.department_tasks
  FOR SELECT TO authenticated
  USING (public.can_access_clinic_department(auth.uid(), clinic_id, department));

CREATE POLICY "tasks_insert_admin" ON public.department_tasks
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) AND created_by = auth.uid());

CREATE POLICY "tasks_update" ON public.department_tasks
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (assigned_to = auth.uid() AND public.is_clinic_dept_team_member(auth.uid(), clinic_id, department))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (assigned_to = auth.uid() AND public.is_clinic_dept_team_member(auth.uid(), clinic_id, department))
  );

CREATE POLICY "tasks_delete_admin" ON public.department_tasks
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- updated_at + completed_at triggers
CREATE OR REPLACE FUNCTION public.dept_tasks_touch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'done'::public.task_status AND (OLD.status IS DISTINCT FROM 'done'::public.task_status OR NEW.completed_at IS NULL) THEN
    NEW.completed_at := now();
  ELSIF NEW.status <> 'done'::public.task_status THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_dept_tasks_touch BEFORE UPDATE ON public.department_tasks
FOR EACH ROW EXECUTE FUNCTION public.dept_tasks_touch();

CREATE OR REPLACE FUNCTION public.dept_tasks_touch_ins()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'done'::public.task_status AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_dept_tasks_touch_ins BEFORE INSERT ON public.department_tasks
FOR EACH ROW EXECUTE FUNCTION public.dept_tasks_touch_ins();

-- Attachments
CREATE TABLE public.department_task_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.department_tasks(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('file','voice')),
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  duration_seconds numeric,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dept_task_attachments_task ON public.department_task_attachments(task_id);

ALTER TABLE public.department_task_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_att_select" ON public.department_task_attachments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.department_tasks t
    WHERE t.id = task_id
      AND public.can_access_clinic_department(auth.uid(), t.clinic_id, t.department)
  ));

CREATE POLICY "task_att_insert" ON public.department_task_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.department_tasks t
      WHERE t.id = task_id
        AND public.can_access_clinic_department(auth.uid(), t.clinic_id, t.department)
    )
  );

CREATE POLICY "task_att_delete" ON public.department_task_attachments
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR uploaded_by = auth.uid()
  );

-- Comments
CREATE TABLE public.department_task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.department_tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dept_task_comments_task ON public.department_task_comments(task_id);

ALTER TABLE public.department_task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_cmt_select" ON public.department_task_comments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.department_tasks t
    WHERE t.id = task_id
      AND public.can_access_clinic_department(auth.uid(), t.clinic_id, t.department)
  ));

CREATE POLICY "task_cmt_insert" ON public.department_task_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.department_tasks t
      WHERE t.id = task_id
        AND public.can_access_clinic_department(auth.uid(), t.clinic_id, t.department)
    )
  );

CREATE POLICY "task_cmt_delete" ON public.department_task_comments
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR user_id = auth.uid()
  );
