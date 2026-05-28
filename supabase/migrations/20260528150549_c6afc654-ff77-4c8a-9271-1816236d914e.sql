
-- ============================================================
-- department_client_chats
-- ============================================================
CREATE TABLE public.department_client_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department public.department_type NOT NULL,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  message text NOT NULL DEFAULT '',
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  reactions jsonb NOT NULL DEFAULT '{}'::jsonb,
  reply_to uuid REFERENCES public.department_client_chats(id) ON DELETE SET NULL,
  pinned boolean NOT NULL DEFAULT false,
  edited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dcc_clinic_dept_created
  ON public.department_client_chats (clinic_id, department, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.department_client_chats TO authenticated;
GRANT ALL ON public.department_client_chats TO service_role;

ALTER TABLE public.department_client_chats ENABLE ROW LEVEL SECURITY;

-- Helper predicate: is the calling user a staff member with access to this dept+clinic
-- OR a client/sub-client/partner with access to this clinic.
-- Inlined into policies for clarity.

CREATE POLICY "Members can view client chats"
ON public.department_client_chats
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'concierge'::public.app_role)
    AND (
      public.is_department_member(auth.uid(), department)
      OR public.is_clinic_dept_team_member(auth.uid(), clinic_id, department)
    )
  )
  OR clinic_id IN (SELECT public.get_accessible_clinic_ids(auth.uid()))
);

CREATE POLICY "Members can insert client chats"
ON public.department_client_chats
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'concierge'::public.app_role)
      AND (
        public.is_department_member(auth.uid(), department)
        OR public.is_clinic_dept_team_member(auth.uid(), clinic_id, department)
      )
    )
    OR clinic_id IN (SELECT public.get_accessible_clinic_ids(auth.uid()))
  )
);

CREATE POLICY "Members can update client chats"
ON public.department_client_chats
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'concierge'::public.app_role)
    AND (
      public.is_department_member(auth.uid(), department)
      OR public.is_clinic_dept_team_member(auth.uid(), clinic_id, department)
    )
  )
  OR clinic_id IN (SELECT public.get_accessible_clinic_ids(auth.uid()))
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'concierge'::public.app_role)
    AND (
      public.is_department_member(auth.uid(), department)
      OR public.is_clinic_dept_team_member(auth.uid(), clinic_id, department)
    )
  )
  OR clinic_id IN (SELECT public.get_accessible_clinic_ids(auth.uid()))
);

CREATE POLICY "Admins can delete client chats"
ON public.department_client_chats
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ============================================================
-- department_client_chat_reads
-- ============================================================
CREATE TABLE public.department_client_chat_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  department public.department_type NOT NULL,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  last_read_message_id uuid,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, department, clinic_id)
);

CREATE INDEX idx_dccr_clinic_dept
  ON public.department_client_chat_reads (clinic_id, department);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.department_client_chat_reads TO authenticated;
GRANT ALL ON public.department_client_chat_reads TO service_role;

ALTER TABLE public.department_client_chat_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view client chat reads in their clinics"
ON public.department_client_chat_reads
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'concierge'::public.app_role)
  OR clinic_id IN (SELECT public.get_accessible_clinic_ids(auth.uid()))
);

CREATE POLICY "Users manage their own client chat read receipts (insert)"
ON public.department_client_chat_reads
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users manage their own client chat read receipts (update)"
ON public.department_client_chat_reads
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users manage their own client chat read receipts (delete)"
ON public.department_client_chat_reads
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- ============================================================
-- Realtime
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.department_client_chats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.department_client_chat_reads;
ALTER TABLE public.department_client_chats REPLICA IDENTITY FULL;
ALTER TABLE public.department_client_chat_reads REPLICA IDENTITY FULL;
