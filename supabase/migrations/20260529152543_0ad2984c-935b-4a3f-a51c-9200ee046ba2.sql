ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS search_atlas_otto_uuid text,
  ADD COLUMN IF NOT EXISTS search_atlas_rank_tracker_id text,
  ADD COLUMN IF NOT EXISTS search_atlas_backlink_project_id text,
  ADD COLUMN IF NOT EXISTS search_atlas_llm_project_id text,
  ADD COLUMN IF NOT EXISTS search_atlas_domain text;