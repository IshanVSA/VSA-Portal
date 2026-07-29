ALTER TABLE public.sm2_posts
  ADD COLUMN IF NOT EXISTS edited_after_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edited_after_approval_at timestamptz;