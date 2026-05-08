-- 1. Improve the per-member timeline: include assignment status changes, content posts, promotions, SM2, GBP, blogs.
CREATE OR REPLACE FUNCTION public.get_team_member_timeline(_user_id uuid, _limit integer DEFAULT 100, _offset integer DEFAULT 0)
RETURNS TABLE(event_at timestamp with time zone, event_type text, description text, ref_id uuid, clinic_id uuid, metadata jsonb)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  RETURN QUERY
  WITH events AS (
    SELECT tal.created_at AS event_at,
      ('ticket_' || tal.field)::text AS event_type,
      ('Ticket "' || COALESCE(t.title,'Untitled') || '": ' || tal.field || ' ' ||
        COALESCE(tal.old_value,'∅') || ' → ' || COALESCE(tal.new_value,'∅'))::text AS description,
      tal.ticket_id AS ref_id, t.clinic_id,
      jsonb_build_object('field', tal.field, 'old', tal.old_value, 'new', tal.new_value, 'ticket_type', t.ticket_type) AS metadata
    FROM public.ticket_audit_log tal
    LEFT JOIN public.department_tickets t ON t.id = tal.ticket_id
    WHERE tal.actor_id = _user_id

    UNION ALL
    SELECT t.created_at, 'ticket_created'::text,
      ('Created ticket "' || COALESCE(t.title,'Untitled') || '" in ' || t.department::text)::text,
      t.id, t.clinic_id,
      jsonb_build_object('priority', t.priority, 'ticket_type', t.ticket_type)
    FROM public.department_tickets t WHERE t.created_by = _user_id

    UNION ALL
    SELECT t.voided_at, 'ticket_voided'::text,
      ('Voided ticket "' || COALESCE(t.title,'Untitled') || '"' ||
        CASE WHEN t.void_reason IS NOT NULL THEN ': ' || t.void_reason ELSE '' END)::text,
      t.id, t.clinic_id,
      jsonb_build_object('reason', t.void_reason)
    FROM public.department_tickets t WHERE t.voided_by = _user_id AND t.voided_at IS NOT NULL

    UNION ALL
    SELECT dta.updated_at,
      ('ticket_assignment_' || dta.status::text)::text,
      ('Ticket "' || COALESCE(t.title,'Untitled') || '" is ' || replace(dta.status::text, '_', ' ') || ' (' || dta.department::text || ')')::text,
      dta.ticket_id, t.clinic_id,
      jsonb_build_object('status', dta.status, 'department', dta.department, 'ticket_type', t.ticket_type)
    FROM public.department_ticket_assignments dta
    LEFT JOIN public.department_tickets t ON t.id = dta.ticket_id
    WHERE dta.assigned_to = _user_id

    UNION ALL
    SELECT pc.created_at, 'comment_posted'::text,
      ('Posted ' || pc.visibility || ' comment: ' || left(pc.content, 120))::text,
      pc.post_id, cp.clinic_id,
      jsonb_build_object('visibility', pc.visibility)
    FROM public.post_comments pc
    LEFT JOIN public.content_posts cp ON cp.id = pc.post_id
    WHERE pc.user_id = _user_id

    UNION ALL
    SELECT dc.created_at, 'chat_message'::text,
      ('Chat in ' || dc.department::text || ': ' || left(dc.message, 120))::text,
      dc.id, dc.clinic_id,
      jsonb_build_object('department', dc.department)
    FROM public.department_chats dc WHERE dc.user_id = _user_id

    UNION ALL
    SELECT pal.created_at, ('post_' || pal.action)::text,
      ('Post action: ' || replace(pal.action, '_', ' '))::text,
      pal.post_id, cp.clinic_id, pal.metadata
    FROM public.post_activity_log pal
    LEFT JOIN public.content_posts cp ON cp.id = pal.post_id
    WHERE pal.actor_id = _user_id

    UNION ALL
    SELECT cp.created_at, 'post_created'::text,
      ('Created ' || COALESCE(cp.platform, 'content') || ' post: ' || COALESCE(cp.title, 'Untitled'))::text,
      cp.id, cp.clinic_id,
      jsonb_build_object('platform', cp.platform, 'status', cp.status)
    FROM public.content_posts cp WHERE cp.created_by = _user_id

    UNION ALL
    SELECT cr.created_at, 'calendar_created'::text,
      ('Created content calendar (' || COALESCE(cr.intake_data->>'month','—') || ')')::text,
      cr.id, cr.clinic_id,
      jsonb_build_object('status', cr.status)
    FROM public.content_requests cr WHERE cr.created_by_concierge_id = _user_id

    UNION ALL
    SELECT pr.created_at, 'promotion_created'::text,
      ('Created promotion: ' || COALESCE(pr.offer_name, 'Untitled'))::text,
      pr.id, pr.clinic_id,
      jsonb_build_object('status', pr.status)
    FROM public.clinic_promotions pr WHERE pr.created_by = _user_id

    UNION ALL
    SELECT g.created_at, 'sm2_generation_created'::text,
      ('Generated SM2 calendar (' || COALESCE(g.month_year, '—') || ')')::text,
      g.id, g.clinic_id,
      jsonb_build_object('approval_status', g.approval_status, 'pipeline_stage', g.pipeline_stage)
    FROM public.sm2_generations g WHERE g.triggered_by = _user_id

    UNION ALL
    SELECT gh.created_at,
      CASE WHEN gh.approved_by = _user_id THEN 'gbp_post_approved'
           WHEN gh.reviewed_by = _user_id THEN 'gbp_post_reviewed'
           ELSE 'gbp_post_generated' END::text,
      (CASE WHEN gh.approved_by = _user_id THEN 'Approved GBP post: '
            WHEN gh.reviewed_by = _user_id THEN 'Reviewed GBP post: '
            ELSE 'Generated GBP post: ' END || COALESCE(gh.topic, 'Untitled'))::text,
      gh.id, gh.clinic_id,
      jsonb_build_object('status', gh.status, 'post_type', gh.post_type)
    FROM public.gbp_post_history gh
    WHERE gh.generated_by = _user_id OR gh.reviewed_by = _user_id OR gh.approved_by = _user_id

    UNION ALL
    SELECT bp.marked_published_at, 'blog_published'::text,
      ('Marked blog batch published')::text,
      bp.id, bp.clinic_id,
      jsonb_build_object('generation_status', bp.generation_status)
    FROM public.blog_posts bp WHERE bp.marked_published_by = _user_id AND bp.marked_published_at IS NOT NULL
  )
  SELECT * FROM events
  WHERE event_at IS NOT NULL
  ORDER BY event_at DESC NULLS LAST
  LIMIT _limit OFFSET _offset;
END;
$function$;

-- 2. Update the summary to add post_created activity into "posts_acted_on" and use a richer last_activity_at.
CREATE OR REPLACE FUNCTION public.get_team_activity_summary()
RETURNS TABLE(
  user_id uuid, full_name text, email text, role text, team_role text,
  first_login_at timestamp with time zone, last_seen_at timestamp with time zone,
  login_count integer, is_online boolean,
  tickets_assigned integer, tickets_in_progress integer, tickets_completed integer, tickets_voided integer,
  comments_posted integer, chat_messages integer, posts_acted_on integer, calendars_created integer,
  last_activity_at timestamp with time zone
)
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
    p.id, p.full_name, p.email, ur.role::text, p.team_role,
    a.first_login_at, a.last_seen_at,
    COALESCE(a.login_count, 0)::int,
    (a.last_seen_at IS NOT NULL AND a.last_seen_at > now() - interval '2 minutes'),
    COALESCE((SELECT COUNT(*) FROM public.department_ticket_assignments dta WHERE dta.assigned_to = p.id), 0)::int,
    COALESCE((SELECT COUNT(*) FROM public.department_ticket_assignments dta WHERE dta.assigned_to = p.id AND dta.status = 'in_progress'::public.ticket_status), 0)::int,
    COALESCE((SELECT COUNT(*) FROM public.department_ticket_assignments dta WHERE dta.assigned_to = p.id AND dta.status = 'completed'::public.ticket_status), 0)::int,
    COALESCE((SELECT COUNT(*) FROM public.department_tickets t WHERE t.voided_by = p.id), 0)::int,
    COALESCE((SELECT COUNT(*) FROM public.post_comments pc WHERE pc.user_id = p.id), 0)::int,
    COALESCE((SELECT COUNT(*) FROM public.department_chats dc WHERE dc.user_id = p.id), 0)::int,
    (COALESCE((SELECT COUNT(*) FROM public.post_activity_log pal WHERE pal.actor_id = p.id), 0)
     + COALESCE((SELECT COUNT(*) FROM public.content_posts cp WHERE cp.created_by = p.id), 0))::int,
    COALESCE((SELECT COUNT(*) FROM public.content_requests cr WHERE cr.created_by_concierge_id = p.id), 0)::int,
    GREATEST(
      COALESCE(a.last_seen_at, 'epoch'::timestamptz),
      COALESCE((SELECT MAX(tal.created_at) FROM public.ticket_audit_log tal WHERE tal.actor_id = p.id), 'epoch'::timestamptz),
      COALESCE((SELECT MAX(dta.updated_at) FROM public.department_ticket_assignments dta WHERE dta.assigned_to = p.id), 'epoch'::timestamptz),
      COALESCE((SELECT MAX(pc.created_at) FROM public.post_comments pc WHERE pc.user_id = p.id), 'epoch'::timestamptz),
      COALESCE((SELECT MAX(dc.created_at) FROM public.department_chats dc WHERE dc.user_id = p.id), 'epoch'::timestamptz),
      COALESCE((SELECT MAX(pal.created_at) FROM public.post_activity_log pal WHERE pal.actor_id = p.id), 'epoch'::timestamptz),
      COALESCE((SELECT MAX(cp.created_at) FROM public.content_posts cp WHERE cp.created_by = p.id), 'epoch'::timestamptz),
      COALESCE((SELECT MAX(t.created_at) FROM public.department_tickets t WHERE t.created_by = p.id), 'epoch'::timestamptz),
      COALESCE((SELECT MAX(t.voided_at) FROM public.department_tickets t WHERE t.voided_by = p.id), 'epoch'::timestamptz),
      COALESCE((SELECT MAX(cr.created_at) FROM public.content_requests cr WHERE cr.created_by_concierge_id = p.id), 'epoch'::timestamptz),
      COALESCE((SELECT MAX(pr.created_at) FROM public.clinic_promotions pr WHERE pr.created_by = p.id), 'epoch'::timestamptz),
      COALESCE((SELECT MAX(g.created_at) FROM public.sm2_generations g WHERE g.triggered_by = p.id), 'epoch'::timestamptz),
      COALESCE((SELECT MAX(gh.created_at) FROM public.gbp_post_history gh WHERE gh.generated_by = p.id OR gh.reviewed_by = p.id OR gh.approved_by = p.id), 'epoch'::timestamptz),
      COALESCE((SELECT MAX(bp.marked_published_at) FROM public.blog_posts bp WHERE bp.marked_published_by = p.id), 'epoch'::timestamptz)
    )
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  LEFT JOIN public.user_login_activity a ON a.user_id = p.id
  WHERE ur.role IN ('admin'::public.app_role, 'concierge'::public.app_role)
  ORDER BY (a.last_seen_at IS NOT NULL AND a.last_seen_at > now() - interval '2 minutes') DESC,
           a.last_seen_at DESC NULLS LAST,
           p.full_name ASC;
END;
$function$;

-- 3. Enable realtime for the additional activity-driving tables.
DO $$
DECLARE
  tbl text;
  tbls text[] := ARRAY[
    'department_tickets',
    'department_ticket_assignments',
    'content_requests',
    'content_posts',
    'clinic_promotions',
    'sm2_generations',
    'gbp_post_history',
    'blog_posts'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', tbl);
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    END IF;
  END LOOP;
END $$;