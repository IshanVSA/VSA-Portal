
-- Add reply_to column for message threading
ALTER TABLE public.department_chats 
ADD COLUMN reply_to uuid REFERENCES public.department_chats(id) ON DELETE SET NULL;
