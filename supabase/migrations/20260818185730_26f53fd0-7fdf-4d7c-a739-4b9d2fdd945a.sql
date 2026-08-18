DO $$
DECLARE
  r record;
  new_qual text;
  new_check text;
  sql text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (qual ~ 'auth\.(uid|jwt|role)\(\)' AND qual !~ '\(\s*select auth\.')
        OR (with_check ~ 'auth\.(uid|jwt|role)\(\)' AND with_check !~ '\(\s*select auth\.')
      )
  LOOP
    new_qual := regexp_replace(coalesce(r.qual, ''), '(?<!select )auth\.(uid|jwt|role)\(\)', '(select auth.\1())', 'g');
    new_check := regexp_replace(coalesce(r.with_check, ''), '(?<!select )auth\.(uid|jwt|role)\(\)', '(select auth.\1())', 'g');

    sql := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    IF r.qual IS NOT NULL THEN
      sql := sql || format(' USING (%s)', new_qual);
    END IF;
    IF r.with_check IS NOT NULL THEN
      sql := sql || format(' WITH CHECK (%s)', new_check);
    END IF;

    EXECUTE sql;
  END LOOP;
END $$;