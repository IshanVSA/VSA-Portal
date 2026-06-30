DROP POLICY IF EXISTS "tasks_update" ON public.department_tasks;
CREATE POLICY "tasks_update" ON public.department_tasks
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_clinic_dept_team_member(auth.uid(), clinic_id, department)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_clinic_dept_team_member(auth.uid(), clinic_id, department)
  );