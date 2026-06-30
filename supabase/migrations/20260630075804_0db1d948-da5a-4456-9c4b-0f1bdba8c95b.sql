-- Allow task candidates (broadcast pool) to update task status,
-- matching how department_ticket_assignments lets dept members update.
DROP POLICY IF EXISTS tasks_update ON public.department_tasks;

CREATE POLICY tasks_update ON public.department_tasks
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR is_clinic_dept_team_member(auth.uid(), clinic_id, department)
  OR EXISTS (
    SELECT 1 FROM public.department_task_candidates c
    WHERE c.task_id = department_tasks.id AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR is_clinic_dept_team_member(auth.uid(), clinic_id, department)
  OR EXISTS (
    SELECT 1 FROM public.department_task_candidates c
    WHERE c.task_id = department_tasks.id AND c.user_id = auth.uid()
  )
);