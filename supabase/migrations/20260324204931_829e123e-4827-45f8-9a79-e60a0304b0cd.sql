
-- Add attachments column to department_chats (array of file metadata objects)
ALTER TABLE public.department_chats
ADD COLUMN attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
