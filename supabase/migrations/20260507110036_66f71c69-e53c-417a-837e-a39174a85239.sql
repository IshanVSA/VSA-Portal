
CREATE OR REPLACE FUNCTION public.get_team_member_timeline(_user_id uuid, _limit int DEFAULT 100, _offset int DEFAULT 0)
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
        CASE WHEN t.void_reason IS NOT NULL THEN ' — ' || t.void_reason ELSE '' END)::text,
      t.id, t.clinic_id,
      jsonb_build_object('reason', t.void_reason)
    FROM public.department_tickets t WHERE t.voided_by = _user_id AND t.voided_at IS NOT NULL
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
      ('Post action: ' || pal.action)::text,
      pal.post_id, cp.clinic_id, pal.metadata
    FROM public.post_activity_log pal
    LEFT JOIN public.content_posts cp ON cp.id = pal.post_id
    WHERE pal.actor_id = _user_id
    UNION ALL
    SELECT cr.created_at, 'calendar_created'::text,
      ('Created content calendar (' || COALESCE(cr.intake_data->>'month','—') || ')')::text,
      cr.id, cr.clinic_id,
      jsonb_build_object('status', cr.status)
    FROM public.content_requests cr WHERE cr.created_by_concierge_id = _user_id
  )
  SELECT * FROM events
  ORDER BY event_at DESC NULLS LAST
  LIMIT _limit OFFSET _offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_team_member_timeline(uuid, int, int) TO authenticated;
