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
      ON CONFLICT (bucket, object_path) DO NOTHING;
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

INSERT INTO public.short_links (token, bucket, object_path, created_by)
SELECT replace(gen_random_uuid()::text, '-', ''), 'department-files', media.object_path, NULL
FROM (
  SELECT DISTINCT path AS object_path
  FROM public.sm2_posts p
  CROSS JOIN LATERAL unnest(
    array_remove(
      ARRAY[p.image_path] || COALESCE(p.image_paths, ARRAY[]::text[]),
      NULL
    )
  ) AS path
  WHERE path <> ''

  UNION

  SELECT DISTINCT regexp_replace(path, '(\.[^.]+)$', '-cover\1') AS object_path
  FROM public.sm2_posts p
  CROSS JOIN LATERAL unnest(
    array_remove(
      ARRAY[p.image_path] || COALESCE(p.image_paths, ARRAY[]::text[]),
      NULL
    )
  ) AS path
  WHERE path ~* '\.(mp4|mov|webm|m4v)$'

  UNION

  SELECT DISTINCT regexp_replace(path, '(\.[^.]+)$', '-thumb.jpg') AS object_path
  FROM public.sm2_posts p
  CROSS JOIN LATERAL unnest(
    array_remove(
      ARRAY[p.image_path] || COALESCE(p.image_paths, ARRAY[]::text[]),
      NULL
    )
  ) AS path
  WHERE path ~* '\.(mp4|mov|webm|m4v)$'
) AS media
ON CONFLICT (bucket, object_path) DO NOTHING;