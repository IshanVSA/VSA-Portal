CREATE POLICY "Admins can delete chats"
ON public.department_chats FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));