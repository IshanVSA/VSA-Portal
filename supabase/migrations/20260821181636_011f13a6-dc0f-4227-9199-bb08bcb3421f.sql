CREATE OR REPLACE FUNCTION public.mint_short_links(_paths text[], _bucket text DEFAULT 'department-files')
RETURNS TABLE(object_path text, token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  p text;
  new_token text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  FOREACH p IN ARRAY COALESCE(_paths, ARRAY[]::text[]) LOOP
    CONTINUE WHEN p IS NULL OR length(p) = 0;

    IF NOT EXISTS (
      SELECT 1
      FROM public.short_links sl
      WHERE sl.bucket = _bucket AND sl.object_path = p
    ) THEN
      new_token := replace(gen_random_uuid()::text, '-', '');
      INSERT INTO public.short_links (token, bucket, object_path, created_by)
      VALUES (new_token, _bucket, p, (SELECT auth.uid()))
      ON CONFLICT ON CONSTRAINT short_links_bucket_path_key DO NOTHING;
    END IF;
  END LOOP;

  RETURN QUERY
    SELECT sl.object_path, sl.token
    FROM public.short_links sl
    WHERE sl.bucket = _bucket
      AND sl.object_path = ANY(COALESCE(_paths, ARRAY[]::text[]));
END;
$$;

REVOKE ALL ON FUNCTION public.mint_short_links(text[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mint_short_links(text[], text) FROM anon;
GRANT EXECUTE ON FUNCTION public.mint_short_links(text[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mint_short_links(text[], text) TO service_role;