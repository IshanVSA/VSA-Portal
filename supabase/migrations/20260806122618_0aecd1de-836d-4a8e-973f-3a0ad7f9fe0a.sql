CREATE INDEX IF NOT EXISTS idx_sm2_posts_client_feedback_updated
  ON public.sm2_posts (updated_at DESC)
  WHERE client_feedback IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_analytics_clinic_platform_type_recorded
  ON public.analytics (clinic_id, platform, metric_type, recorded_at DESC);

DROP INDEX IF EXISTS public.idx_ticket_audit_log_ticket_id;
DROP INDEX IF EXISTS public.idx_dta_ticket;
DROP INDEX IF EXISTS public.idx_dta_assigned_to;