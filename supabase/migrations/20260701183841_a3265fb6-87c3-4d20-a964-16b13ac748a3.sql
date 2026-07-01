DROP POLICY IF EXISTS "Staff can update visible task status" ON public.department_tasks;

CREATE POLICY "Staff can update accessible task status"
ON public.department_tasks
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.is_clinic_dept_team_member(auth.uid(), clinic_id, department)
  OR EXISTS (
    SELECT 1
    FROM public.department_task_candidates c
    WHERE c.task_id = department_tasks.id
      AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.is_clinic_dept_team_member(auth.uid(), clinic_id, department)
  OR EXISTS (
    SELECT 1
    FROM public.department_task_candidates c
    WHERE c.task_id = department_tasks.id
      AND c.user_id = auth.uid()
  )
);