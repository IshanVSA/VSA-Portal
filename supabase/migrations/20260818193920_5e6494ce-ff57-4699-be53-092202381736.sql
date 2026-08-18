CREATE TABLE public.short_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  bucket text NOT NULL DEFAULT 'department-files',
  object_path text NOT NULL,
  created_by uuid,
  hits integer NOT NULL DEFAULT 0,
  last_accessed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT short_links_bucket_path_key UNIQUE (bucket, object_path)
);

GRANT SELECT ON public.short_links TO authenticated;
GRANT ALL ON public.short_links TO service_role;

ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read short links"
ON public.short_links FOR SELECT TO authenticated
USING (true);

CREATE TRIGGER update_short_links_updated_at
BEFORE UPDATE ON public.short_links
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_short_links_token ON public.short_links (token);

-- Mint (or reuse) short codes for a batch of storage paths.
CREATE OR REPLACE FUNCTION public.mint_short_links(_paths text[], _bucket text DEFAULT 'department-files')
RETURNS TABLE(object_path text, token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p text;
  new_token text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  FOREACH p IN ARRAY COALESCE(_paths, ARRAY[]::text[]) LOOP
    CONTINUE WHEN p IS NULL OR length(p) = 0;

    IF NOT EXISTS (
      SELECT 1 FROM public.short_links sl
      WHERE sl.bucket = _bucket AND sl.object_path = p
    ) THEN
      new_token := translate(encode(gen_random_bytes(9), 'base64'), '+/=', '-_');
      INSERT INTO public.short_links (token, bucket, object_path, created_by)
      VALUES (new_token, _bucket, p, auth.uid())
      ON CONFLICT (bucket, object_path) DO NOTHING;
    END IF;
  END LOOP;

  RETURN QUERY
    SELECT sl.object_path, sl.token
    FROM public.short_links sl
    WHERE sl.bucket = _bucket AND sl.object_path = ANY(_paths);
END;
$$;

REVOKE ALL ON FUNCTION public.mint_short_links(text[], text) FROM public;
GRANT EXECUTE ON FUNCTION public.mint_short_links(text[], text) TO authenticated;