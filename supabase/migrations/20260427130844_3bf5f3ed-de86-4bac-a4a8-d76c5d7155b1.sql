ALTER TABLE public.department_chats REPLICA IDENTITY FULL;
ALTER TABLE public.department_chat_reads REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='department_chat_reads'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.department_chat_reads';
  END IF;
END $$;