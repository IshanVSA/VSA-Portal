ALTER TABLE public.blog_pipeline_runs DROP CONSTRAINT IF EXISTS blog_pipeline_runs_status_check;
ALTER TABLE public.blog_pipeline_runs ADD CONSTRAINT blog_pipeline_runs_status_check
  CHECK (status IN ('queued','running','awaiting_human_gate','approved','rejected','changes_requested','failed'));
UPDATE public.blog_pipeline_runs SET status='awaiting_human_gate', completed_at=COALESCE(completed_at, now())
  WHERE status='running' AND current_stage='human_gate';