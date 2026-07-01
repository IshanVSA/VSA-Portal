CREATE POLICY "Staff can update visible task status"
ON public.department_tasks
FOR UPDATE
TO authenticated
USING (
  status IN ('todo', 'in_progress', 'done', 'cancelled')
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'concierge'::public.app_role)
  )
)
WITH CHECK (
  status IN ('todo', 'in_progress', 'done', 'cancelled')
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'concierge'::public.app_role)
  )
);