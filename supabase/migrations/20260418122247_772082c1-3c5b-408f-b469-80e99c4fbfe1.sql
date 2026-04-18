ALTER TABLE public.sm2_posts
  ADD COLUMN IF NOT EXISTS post_number int,
  ADD COLUMN IF NOT EXISTS topic text,
  ADD COLUMN IF NOT EXISTS hook_b text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS art_direction jsonb,
  ADD COLUMN IF NOT EXISTS stories jsonb,
  ADD COLUMN IF NOT EXISTS concierge_brief jsonb;