ALTER TABLE public.user_login_activity REPLICA IDENTITY FULL;
ALTER TABLE public.ticket_audit_log REPLICA IDENTITY FULL;
ALTER TABLE public.post_comments REPLICA IDENTITY FULL;
ALTER TABLE public.post_activity_log REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_login_activity;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_audit_log;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_activity_log;