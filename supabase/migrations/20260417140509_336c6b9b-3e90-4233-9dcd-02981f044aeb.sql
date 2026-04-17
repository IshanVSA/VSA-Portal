-- Add stage tracking fields for resumable SM2 pipeline
ALTER TABLE public.sm2_generations
  ADD COLUMN IF NOT EXISTS pipeline_stage text NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS pipeline_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS stage_started_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS stage_completed_at timestamp with time zone;

-- Index for worker to efficiently pick next due job
CREATE INDEX IF NOT EXISTS idx_sm2_generations_pipeline_stage
  ON public.sm2_generations (pipeline_stage, next_retry_at)
  WHERE approval_status IN ('queued', 'processing', 'retrying');

-- Reset Alma's stuck record so it can be retried fresh
UPDATE public.sm2_generations
SET approval_status = 'generation_failed',
    failure_reason = 'Pipeline interrupted before stage-based architecture deployed. Please retry.',
    pipeline_stage = 'failed',
    stage_completed_at = now()
WHERE approval_status IN ('queued', 'processing', 'retrying');