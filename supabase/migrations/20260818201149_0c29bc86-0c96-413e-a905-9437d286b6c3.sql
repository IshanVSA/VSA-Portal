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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  FOREACH p IN ARRAY COALESCE(_paths, ARRAY[]::text[]) LOOP
    CONTINUE WHEN p IS NULL OR length(p) = 0;

    IF NOT EXISTS (
      SELECT 1
      FROM public.short_links sl
      WHERE sl.bucket = _bucket AND sl.object_path = p
    ) THEN
      new_token := translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/=', '-_');
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

REVOKE ALL ON FUNCTION public.mint_short_links(text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mint_short_links(text[], text) TO authenticated;