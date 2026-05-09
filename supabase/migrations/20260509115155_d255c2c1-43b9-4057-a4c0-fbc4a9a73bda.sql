
-- Helper: authorize a realtime topic for the current user based on a naming convention
CREATE OR REPLACE FUNCTION public.realtime_topic_authorized(_topic text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  parts text[];
  scope text;
  scope_id uuid;
BEGIN
  IF uid IS NULL OR _topic IS NULL OR _topic = '' THEN
    RETURN false;
  END IF;

  parts := string_to_array(_topic, ':');
  scope := parts[1];

  -- admin scope
  IF scope = 'admin' THEN
    RETURN public.has_role(uid, 'admin'::app_role);
  END IF;

  -- staff scope: admin, concierge, or any department member
  IF scope = 'staff' THEN
    RETURN public.has_role(uid, 'admin'::app_role)
        OR public.has_role(uid, 'concierge'::app_role)
        OR EXISTS (SELECT 1 FROM public.department_members WHERE user_id = uid)
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND team_role IS NOT NULL);
  END IF;

  -- user:<uuid>:...
  IF scope = 'user' AND array_length(parts,1) >= 2 THEN
    BEGIN
      scope_id := parts[2]::uuid;
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
    RETURN scope_id = uid;
  END IF;

  -- clinic:<uuid>:...
  IF scope = 'clinic' AND array_length(parts,1) >= 2 THEN
    BEGIN
      scope_id := parts[2]::uuid;
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
    RETURN public.has_role(uid, 'admin'::app_role)
        OR EXISTS (
          SELECT 1 FROM public.clinics c
          WHERE c.id = scope_id
            AND (c.owner_user_id = uid OR c.assigned_concierge_id = uid)
        )
        OR public.is_clinic_team_member(uid, scope_id)
        OR scope_id IN (SELECT public.get_concierge_clinic_ids(uid))
        OR scope_id IN (SELECT public.get_sub_account_clinic_ids(uid));
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.realtime_topic_authorized(text) TO authenticated;

-- Ensure RLS is enabled on realtime.messages (Supabase enables it by default; no-op if already on)
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- Drop any prior policies we manage
DROP POLICY IF EXISTS "Authorized users can read realtime topics" ON realtime.messages;
DROP POLICY IF EXISTS "Authorized users can write realtime topics" ON realtime.messages;

-- Read (subscribe / receive)
CREATE POLICY "Authorized users can read realtime topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (public.realtime_topic_authorized((SELECT realtime.topic())));

-- Write (broadcast / presence)
CREATE POLICY "Authorized users can write realtime topics"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (public.realtime_topic_authorized((SELECT realtime.topic())));
