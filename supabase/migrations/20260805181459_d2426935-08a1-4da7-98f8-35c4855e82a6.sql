ALTER TABLE public.sm2_posts
  ADD COLUMN IF NOT EXISTS is_posted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS posted_by uuid;