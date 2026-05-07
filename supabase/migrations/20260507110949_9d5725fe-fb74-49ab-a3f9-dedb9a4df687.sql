CREATE OR REPLACE FUNCTION public.get_team_activity_summary()
 RETURNS TABLE(user_id uuid, full_name text, email text, role text, team_role text, first_login_at timestamp with time zone, last_seen_at timestamp with time zone, login_count integer, is_online boolean, tickets_assigned integer, tickets_in_progress integer, tickets_completed integer, tickets_voided integer, comments_posted integer, chat_messages integer, posts_acted_on integer, calendars_created integer, last_activity_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS user_id,
    p.full_name,
    p.email,
    ur.role::text AS role,
    p.team_role,
    a.first_login_at,
    a.last_seen_at,
    COALESCE(a.login_count, 0)::int AS login_count,
    (a.last_seen_at IS NOT NULL AND a.last_seen_at > now() - interval '10 minutes') AS is_online,
    COALESCE((SELECT COUNT(*) FROM public.department_ticket_assignments dta WHERE dta.assigned_to = p.id), 0)::int,
    COALESCE((SELECT COUNT(*) FROM public.department_ticket_assignments dta WHERE dta.assigned_to = p.id AND dta.status = 'in_progress'::public.ticket_status), 0)::int,
    COALESCE((SELECT COUNT(*) FROM public.department_ticket_assignments dta WHERE dta.assigned_to = p.id AND dta.status = 'completed'::public.ticket_status), 0)::int,
    COALESCE((SELECT COUNT(*) FROM public.department_tickets t WHERE t.voided_by = p.id), 0)::int,
    COALESCE((SELECT COUNT(*) FROM public.post_comments pc WHERE pc.user_id = p.id), 0)::int,
    COALESCE((SELECT COUNT(*) FROM public.department_chats dc WHERE dc.user_id = p.id), 0)::int,
    COALESCE((SELECT COUNT(*) FROM public.post_activity_log pal WHERE pal.actor_id = p.id), 0)::int,
    COALESCE((SELECT COUNT(*) FROM public.content_requests cr WHERE cr.created_by_concierge_id = p.id), 0)::int,
    GREATEST(
      COALESCE(a.last_seen_at, 'epoch'::timestamptz),
      COALESCE((SELECT MAX(tal.created_at) FROM public.ticket_audit_log tal WHERE tal.actor_id = p.id), 'epoch'::timestamptz),
      COALESCE((SELECT MAX(pc.created_at) FROM public.post_comments pc WHERE pc.user_id = p.id), 'epoch'::timestamptz),
      COALESCE((SELECT MAX(dc.created_at) FROM public.department_chats dc WHERE dc.user_id = p.id), 'epoch'::timestamptz),
      COALESCE((SELECT MAX(pal.created_at) FROM public.post_activity_log pal WHERE pal.actor_id = p.id), 'epoch'::timestamptz)
    ) AS last_activity_at
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  LEFT JOIN public.user_login_activity a ON a.user_id = p.id
  WHERE ur.role IN ('admin'::public.app_role, 'concierge'::public.app_role)
  ORDER BY a.last_seen_at DESC NULLS LAST, p.full_name ASC;
END;
$function$;