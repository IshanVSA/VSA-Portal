
DROP POLICY IF EXISTS "Admin insert checklist items" ON public.website_checklist_items;
DROP POLICY IF EXISTS "Admin update checklist items" ON public.website_checklist_items;
DROP POLICY IF EXISTS "Admin delete checklist items" ON public.website_checklist_items;

CREATE POLICY "Staff insert checklist items" ON public.website_checklist_items
FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'concierge'::app_role));

CREATE POLICY "Staff update checklist items" ON public.website_checklist_items
FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'concierge'::app_role));

CREATE POLICY "Staff delete checklist items" ON public.website_checklist_items
FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'concierge'::app_role));
