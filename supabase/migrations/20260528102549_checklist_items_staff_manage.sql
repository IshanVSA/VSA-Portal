DROP POLICY IF EXISTS "Admin insert checklist items" ON public.website_checklist_items;
DROP POLICY IF EXISTS "Admin update checklist items" ON public.website_checklist_items;
DROP POLICY IF EXISTS "Admin delete checklist items" ON public.website_checklist_items;

CREATE POLICY "Staff insert checklist items" ON public.website_checklist_items
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'concierge'));
CREATE POLICY "Staff update checklist items" ON public.website_checklist_items
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'concierge'));
CREATE POLICY "Staff delete checklist items" ON public.website_checklist_items
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'concierge'));
