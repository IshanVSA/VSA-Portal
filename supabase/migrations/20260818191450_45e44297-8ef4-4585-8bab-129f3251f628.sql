CREATE TABLE IF NOT EXISTS public.db_health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT now(),
  db_size_bytes bigint,
  connections_total integer,
  connections_active integer,
  connections_idle_in_tx integer,
  max_connections integer,
  cache_hit_ratio numeric,
  deadlocks bigint,
  rolled_back bigint,
  committed bigint,
  temp_bytes bigint,
  tup_returned bigint,
  tup_fetched bigint,
  longest_query_seconds numeric
);

GRANT SELECT ON public.db_health_snapshots TO authenticated;
GRANT ALL ON public.db_health_snapshots TO service_role;
ALTER TABLE public.db_health_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view db health snapshots"
  ON public.db_health_snapshots FOR SELECT TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_db_health_snapshots_captured_at
  ON public.db_health_snapshots (captured_at DESC);

-- Snapshot writer (used by cron)
CREATE OR REPLACE FUNCTION public.capture_db_health_snapshot()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
BEGIN
  INSERT INTO public.db_health_snapshots (
    db_size_bytes, connections_total, connections_active, connections_idle_in_tx,
    max_connections, cache_hit_ratio, deadlocks, rolled_back, committed,
    temp_bytes, tup_returned, tup_fetched, longest_query_seconds
  )
  SELECT
    pg_database_size(current_database()),
    (SELECT count(*)::int FROM pg_stat_activity),
    (SELECT count(*)::int FROM pg_stat_activity WHERE state = 'active'),
    (SELECT count(*)::int FROM pg_stat_activity WHERE state = 'idle in transaction'),
    (SELECT setting::int FROM pg_settings WHERE name = 'max_connections'),
    CASE WHEN (d.blks_hit + d.blks_read) > 0
         THEN round((d.blks_hit::numeric / (d.blks_hit + d.blks_read)) * 100, 2) ELSE NULL END,
    d.deadlocks, d.xact_rollback, d.xact_commit, d.temp_bytes, d.tup_returned, d.tup_fetched,
    (SELECT COALESCE(max(EXTRACT(EPOCH FROM (now() - query_start))), 0)
       FROM pg_stat_activity WHERE state = 'active' AND query_start IS NOT NULL)
  FROM pg_stat_database d
  WHERE d.datname = current_database();

  DELETE FROM public.db_health_snapshots WHERE captured_at < now() - interval '30 days';
END;
$$;

-- Live overview
CREATE OR REPLACE FUNCTION public.get_db_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  SELECT jsonb_build_object(
    'db_size_bytes', pg_database_size(current_database()),
    'max_connections', (SELECT setting::int FROM pg_settings WHERE name = 'max_connections'),
    'connections_total', (SELECT count(*) FROM pg_stat_activity),
    'connections_active', (SELECT count(*) FROM pg_stat_activity WHERE state = 'active'),
    'connections_idle', (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle'),
    'connections_idle_in_tx', (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle in transaction'),
    'waiting_on_locks', (SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock'),
    'longest_query_seconds', (SELECT COALESCE(round(max(EXTRACT(EPOCH FROM (now() - query_start)))::numeric, 1), 0)
                                FROM pg_stat_activity WHERE state = 'active' AND query_start IS NOT NULL),
    'cache_hit_ratio', CASE WHEN (d.blks_hit + d.blks_read) > 0
                            THEN round((d.blks_hit::numeric / (d.blks_hit + d.blks_read)) * 100, 2) ELSE NULL END,
    'deadlocks', d.deadlocks,
    'xact_commit', d.xact_commit,
    'xact_rollback', d.xact_rollback,
    'rollback_ratio', CASE WHEN (d.xact_commit + d.xact_rollback) > 0
                           THEN round((d.xact_rollback::numeric / (d.xact_commit + d.xact_rollback)) * 100, 3) ELSE 0 END,
    'temp_files', d.temp_files,
    'temp_bytes', d.temp_bytes,
    'conflicts', d.conflicts,
    'stats_reset', d.stats_reset,
    'generated_at', now()
  ) INTO result
  FROM pg_stat_database d
  WHERE d.datname = current_database();

  RETURN result;
END;
$$;

-- Table level stats
CREATE OR REPLACE FUNCTION public.get_db_table_stats(_limit integer DEFAULT 25)
RETURNS TABLE(
  table_name text, total_bytes bigint, table_bytes bigint, index_bytes bigint,
  live_rows bigint, dead_rows bigint, dead_ratio numeric,
  seq_scans bigint, idx_scans bigint,
  last_autovacuum timestamptz, last_autoanalyze timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  RETURN QUERY
  SELECT
    (s.schemaname || '.' || s.relname)::text,
    pg_total_relation_size(s.relid)::bigint,
    pg_table_size(s.relid)::bigint,
    pg_indexes_size(s.relid)::bigint,
    s.n_live_tup,
    s.n_dead_tup,
    CASE WHEN (s.n_live_tup + s.n_dead_tup) > 0
         THEN round((s.n_dead_tup::numeric / (s.n_live_tup + s.n_dead_tup)) * 100, 2) ELSE 0 END,
    s.seq_scan,
    COALESCE(s.idx_scan, 0),
    s.last_autovacuum,
    s.last_autoanalyze
  FROM pg_stat_user_tables s
  WHERE s.schemaname NOT IN ('auth','storage','realtime','supabase_functions','vault','extensions','cron','net','pgsodium')
  ORDER BY pg_total_relation_size(s.relid) DESC
  LIMIT COALESCE(_limit, 25);
END;
$$;

-- Slow queries
CREATE OR REPLACE FUNCTION public.get_db_slow_queries(_limit integer DEFAULT 15)
RETURNS TABLE(
  query text, calls bigint, total_ms numeric, mean_ms numeric, max_ms numeric, rows_returned bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'extensions'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  RETURN QUERY
  SELECT
    left(s.query, 400)::text,
    s.calls,
    round(s.total_exec_time::numeric, 1),
    round(s.mean_exec_time::numeric, 2),
    round(s.max_exec_time::numeric, 1),
    s.rows
  FROM extensions.pg_stat_statements s
  WHERE s.query NOT ILIKE '%pg_stat_statements%'
  ORDER BY s.total_exec_time DESC
  LIMIT COALESCE(_limit, 15);
END;
$$;

-- Currently running queries
CREATE OR REPLACE FUNCTION public.get_db_active_queries()
RETURNS TABLE(
  pid integer, state text, wait_event_type text, wait_event text,
  duration_seconds numeric, application_name text, query text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  RETURN QUERY
  SELECT a.pid, a.state::text, a.wait_event_type::text, a.wait_event::text,
         round(EXTRACT(EPOCH FROM (now() - a.query_start))::numeric, 1),
         a.application_name::text,
         left(a.query, 300)::text
  FROM pg_stat_activity a
  WHERE a.datname = current_database()
    AND a.pid <> pg_backend_pid()
    AND a.state IS NOT NULL
    AND a.state <> 'idle'
  ORDER BY a.query_start ASC NULLS LAST
  LIMIT 50;
END;
$$;

-- Trend from snapshots
CREATE OR REPLACE FUNCTION public.get_db_health_trend(_hours integer DEFAULT 168)
RETURNS SETOF public.db_health_snapshots
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  RETURN QUERY
  SELECT * FROM public.db_health_snapshots
  WHERE captured_at > now() - make_interval(hours => COALESCE(_hours, 168))
  ORDER BY captured_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_db_health_snapshot() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_db_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_db_table_stats(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_db_slow_queries(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_db_active_queries() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_db_health_trend(integer) TO authenticated;

SELECT cron.unschedule('db-health-snapshot-hourly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'db-health-snapshot-hourly');

SELECT cron.schedule('db-health-snapshot-hourly', '50 * * * *', $$SELECT public.capture_db_health_snapshot();$$);

SELECT public.capture_db_health_snapshot();