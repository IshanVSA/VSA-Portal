CREATE OR REPLACE FUNCTION public.get_db_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
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
                                FROM pg_stat_activity
                               WHERE state = 'active'
                                 AND query_start IS NOT NULL
                                 AND backend_type = 'client backend'
                                 AND pid <> pg_backend_pid()
                                 AND query NOT ILIKE 'START_REPLICATION%'
                                 AND COALESCE(application_name, '') NOT LIKE 'realtime_replication%'),
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
$function$;

CREATE OR REPLACE FUNCTION public.capture_db_health_snapshot()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
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
       FROM pg_stat_activity
      WHERE state = 'active'
        AND query_start IS NOT NULL
        AND backend_type = 'client backend'
        AND pid <> pg_backend_pid()
        AND query NOT ILIKE 'START_REPLICATION%'
        AND COALESCE(application_name, '') NOT LIKE 'realtime_replication%')
  FROM pg_stat_database d
  WHERE d.datname = current_database();

  DELETE FROM public.db_health_snapshots WHERE captured_at < now() - interval '30 days';
END;
$function$;