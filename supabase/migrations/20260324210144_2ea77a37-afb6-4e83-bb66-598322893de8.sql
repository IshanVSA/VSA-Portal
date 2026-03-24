
-- Add reactions column to department_chats
ALTER TABLE public.department_chats ADD COLUMN reactions jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Allow admins and department members to update reactions on chats
CREATE POLICY "Admins and dept members can update chat reactions"
ON public.department_chats
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR (has_role(auth.uid(), 'concierge'::app_role) AND is_department_member(auth.uid(), department))
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR (has_role(auth.uid(), 'concierge'::app_role) AND is_department_member(auth.uid(), department))
);
