-- Create ticket_audit_log table to track changes to status, assignee, and department
CREATE TABLE public.ticket_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.department_tickets(id) ON DELETE CASCADE,
  actor_id UUID,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_ticket_audit_log_ticket_id ON public.ticket_audit_log(ticket_id);
CREATE INDEX idx_ticket_audit_log_created_at ON public.ticket_audit_log(created_at DESC);

ALTER TABLE public.ticket_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins: full access
CREATE POLICY "Admins full access on ticket_audit_log"
ON public.ticket_audit_log
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Concierges: view + insert for tickets in their clinics
CREATE POLICY "Concierges can view audit log for assigned clinics"
ON public.ticket_audit_log
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'concierge'::app_role)
  AND ticket_id IN (
    SELECT id FROM public.department_tickets
    WHERE clinic_id IN (SELECT public.get_concierge_clinic_ids(auth.uid()))
  )
);

CREATE POLICY "Concierges can insert audit log entries"
ON public.ticket_audit_log
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'concierge'::app_role)
  AND actor_id = auth.uid()
);

-- Clients: view only for tickets belonging to their clinic
CREATE POLICY "Clients can view audit log for own clinic tickets"
ON public.ticket_audit_log
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'client'::app_role)
  AND ticket_id IN (
    SELECT id FROM public.department_tickets
    WHERE clinic_id IN (SELECT id FROM public.clinics WHERE owner_user_id = auth.uid())
  )
);

-- Trigger to log changes automatically
CREATE OR REPLACE FUNCTION public.log_ticket_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.ticket_audit_log (ticket_id, actor_id, field, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'status', OLD.status::text, NEW.status::text);
  END IF;
  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    INSERT INTO public.ticket_audit_log (ticket_id, actor_id, field, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'assigned_to', OLD.assigned_to::text, NEW.assigned_to::text);
  END IF;
  IF NEW.department IS DISTINCT FROM OLD.department THEN
    INSERT INTO public.ticket_audit_log (ticket_id, actor_id, field, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'department', OLD.department::text, NEW.department::text);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ticket_changes_audit
AFTER UPDATE ON public.department_tickets
FOR EACH ROW
EXECUTE FUNCTION public.log_ticket_changes();