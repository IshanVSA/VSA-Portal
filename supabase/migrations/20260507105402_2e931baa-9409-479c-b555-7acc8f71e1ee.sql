
-- Team activity tracking RPCs (admin-only)

CREATE OR REPLACE FUNCTION public.get_team_activity_summary()
RETURNS TABLE(
  user_id uuid,
  full_name text,
  email text,
  role text,
  team_role text,
  first_login_at timestamptz,
  last_seen_at timestamptz,
  login_count integer,
  is_online boolean,
  tickets_assigned integer,
  tickets_in_progress integer,
  tickets_completed integer,
  tickets_voided integer,
  comments_posted integer,
  chat_messages integer,
  posts_acted_on integer,
  calendars_created integer,
  last_activity_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
      COALESCE((SELECT MAX(created_at) FROM public.ticket_audit_log WHERE actor_id = p.id), 'epoch'::timestamptz),
      COALESCE((SELECT MAX(created_at) FROM public.post_comments WHERE user_id = p.id), 'epoch'::timestamptz),
      COALESCE((SELECT MAX(created_at) FROM public.department_chats WHERE user_id = p.id), 'epoch'::timestamptz),
      COALESCE((SELECT MAX(created_at) FROM public.post_activity_log WHERE actor_id = p.id), 'epoch'::timestamptz)
    ) AS last_activity_at
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  LEFT JOIN public.user_login_activity a ON a.user_id = p.id
  WHERE ur.role IN ('admin'::public.app_role, 'concierge'::public.app_role)
  ORDER BY a.last_seen_at DESC NULLS LAST, p.full_name ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_team_member_timeline(_user_id uuid, _limit int DEFAULT 200)
RETURNS TABLE(
  event_at timestamptz,
  event_type text,
  description text,
  ref_id uuid,
  clinic_id uuid,
  metadata jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  RETURN QUERY
  (
    -- Ticket audit events
    SELECT
      tal.created_at AS event_at,
      ('ticket_' || tal.field)::text AS event_type,
      ('Ticket "' || COALESCE(t.title,'Untitled') || '": ' || tal.field || ' ' ||
        COALESCE(tal.old_value,'∅') || ' → ' || COALESCE(tal.new_value,'∅'))::text AS description,
      tal.ticket_id AS ref_id,
      t.clinic_id,
      jsonb_build_object('field', tal.field, 'old', tal.old_value, 'new', tal.new_value, 'ticket_type', t.ticket_type)
    FROM public.ticket_audit_log tal
    LEFT JOIN public.department_tickets t ON t.id = tal.ticket_id
    WHERE tal.actor_id = _user_id
  )
  UNION ALL
  (
    -- Tickets created by user
    SELECT
      t.created_at,
      'ticket_created'::text,
      ('Created ticket "' || COALESCE(t.title,'Untitled') || '" in ' || t.department::text)::text,
      t.id,
      t.clinic_id,
      jsonb_build_object('priority', t.priority, 'ticket_type', t.ticket_type)
    FROM public.department_tickets t
    WHERE t.created_by = _user_id
  )
  UNION ALL
  (
    -- Tickets voided by user
    SELECT
      t.voided_at,
      'ticket_voided'::text,
      ('Voided ticket "' || COALESCE(t.title,'Untitled') || '"' ||
        CASE WHEN t.void_reason IS NOT NULL THEN ' — ' || t.void_reason ELSE '' END)::text,
      t.id,
      t.clinic_id,
      jsonb_build_object('reason', t.void_reason)
    FROM public.department_tickets t
    WHERE t.voided_by = _user_id AND t.voided_at IS NOT NULL
  )
  UNION ALL
  (
    -- Comments posted
    SELECT
      pc.created_at,
      'comment_posted'::text,
      ('Posted ' || pc.visibility || ' comment: ' || left(pc.content, 120))::text,
      pc.post_id,
      cp.clinic_id,
      jsonb_build_object('visibility', pc.visibility)
    FROM public.post_comments pc
    LEFT JOIN public.content_posts cp ON cp.id = pc.post_id
    WHERE pc.user_id = _user_id
  )
  UNION ALL
  (
    -- Chat messages
    SELECT
      dc.created_at,
      'chat_message'::text,
      ('Chat in ' || dc.department::text || ': ' || left(dc.message, 120))::text,
      dc.id,
      dc.clinic_id,
      jsonb_build_object('department', dc.department)
    FROM public.department_chats dc
    WHERE dc.user_id = _user_id
  )
  UNION ALL
  (
    -- Post lifecycle actions
    SELECT
      pal.created_at,
      ('post_' || pal.action)::text,
      ('Post action: ' || pal.action)::text,
      pal.post_id,
      cp.clinic_id,
      pal.metadata
    FROM public.post_activity_log pal
    LEFT JOIN public.content_posts cp ON cp.id = pal.post_id
    WHERE pal.actor_id = _user_id
  )
  UNION ALL
  (
    -- Calendars created
    SELECT
      cr.created_at,
      'calendar_created'::text,
      ('Created content calendar (' || COALESCE(cr.intake_data->>'month','—') || ')')::text,
      cr.id,
      cr.clinic_id,
      jsonb_build_object('status', cr.status)
    FROM public.content_requests cr
    WHERE cr.created_by_concierge_id = _user_id
  )
  ORDER BY event_at DESC NULLS LAST
  LIMIT _limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_team_activity_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_member_timeline(uuid, int) TO authenticated;
