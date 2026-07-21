CREATE TABLE public.search_atlas_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  tool TEXT NOT NULL,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_search_atlas_cache_expires ON public.search_atlas_cache (expires_at);

GRANT ALL ON public.search_atlas_cache TO service_role;

ALTER TABLE public.search_atlas_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role only" ON public.search_atlas_cache
  FOR ALL USING (false) WITH CHECK (false);