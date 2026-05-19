UPDATE public.department_tickets
SET completion_email_sent_at = COALESCE(updated_at, created_at),
    completion_email_recipients = COALESCE(completion_email_recipients, 0)
WHERE status = 'completed'
  AND completion_email_sent_at IS NULL;