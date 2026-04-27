ALTER TABLE public.department_chats
ADD COLUMN IF NOT EXISTS edited_at timestamp with time zone;