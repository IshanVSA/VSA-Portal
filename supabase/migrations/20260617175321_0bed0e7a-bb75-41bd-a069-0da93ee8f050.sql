DROP POLICY IF EXISTS "Owners can delete their sm2_generations" ON public.sm2_generations;
DROP POLICY IF EXISTS "Admins full access on sm2_generations" ON public.sm2_generations;

-- Re-create admin access but block deletes of approved generations
CREATE POLICY "Admins can view sm2_generations" ON public.sm2_generations
  FOR SELECT USING (has_role((SELECT auth.uid()), 'admin'::app_role));
CREATE POLICY "Admins can insert sm2_generations" ON public.sm2_generations
  FOR INSERT WITH CHECK (has_role((SELECT auth.uid()), 'admin'::app_role));
CREATE POLICY "Admins can update sm2_generations" ON public.sm2_generations
  FOR UPDATE USING (has_role((SELECT auth.uid()), 'admin'::app_role));
CREATE POLICY "Admins can delete unapproved sm2_generations" ON public.sm2_generations
  FOR DELETE USING (
    has_role((SELECT auth.uid()), 'admin'::app_role)
    AND approval_status NOT IN ('approved_client', 'approved_auto')
  );

CREATE POLICY "Owners can delete unapproved sm2_generations" ON public.sm2_generations
  FOR DELETE USING (
    triggered_by = (SELECT auth.uid())
    AND approval_status NOT IN ('approved_client', 'approved_auto')
  );