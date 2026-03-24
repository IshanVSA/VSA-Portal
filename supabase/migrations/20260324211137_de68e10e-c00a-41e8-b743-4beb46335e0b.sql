
-- Add pinned column to department_chats
ALTER TABLE public.department_chats ADD COLUMN pinned boolean NOT NULL DEFAULT false;

-- Create read receipts table
CREATE TABLE public.department_chat_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department department_type NOT NULL,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  last_read_message_id uuid REFERENCES public.department_chats(id) ON DELETE SET NULL,
  UNIQUE(user_id, department, clinic_id)
);

-- RLS for read receipts
ALTER TABLE public.department_chat_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own read receipts"
ON public.department_chat_reads FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can upsert own read receipts"
ON public.department_chat_reads FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid() AND (
    has_role(auth.uid(), 'admin'::app_role) OR 
    (has_role(auth.uid(), 'concierge'::app_role) AND is_department_member(auth.uid(), department))
  )
);

CREATE POLICY "Users can update own read receipts"
ON public.department_chat_reads FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Allow all staff to see read receipts for awareness
CREATE POLICY "Staff can view all read receipts"
ON public.department_chat_reads FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  (has_role(auth.uid(), 'concierge'::app_role) AND is_department_member(auth.uid(), department))
);
