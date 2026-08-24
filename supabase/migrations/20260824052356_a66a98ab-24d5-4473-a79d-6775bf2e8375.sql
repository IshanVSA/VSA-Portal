CREATE OR REPLACE FUNCTION public.get_db_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  result jsonb;
  rt_heartbeat bigint := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  -- Supabase Realtime's subscription manager runs one read-only heartbeat transaction
  -- per tick (sub_tables + pg_publication_tables) that always ends in ROLLBACK.
  IF to_regclass('extensions.pg_stat_statements') IS NOT NULL THEN
    BEGIN
      EXECUTE $q$
        SELECT COALESCE(sum(calls), 0)
          FROM extensions.pg_stat_statements
         WHERE query ILIKE '%sub_tables%'
           AND query ILIKE '%pg_publication_tables%'
      $q$ INTO rt_heartbeat;
    EXCEPTION WHEN OTHERS THEN
      rt_heartbeat := 0;
    END;
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
    'realtime_rollback', LEAST(rt_heartbeat, d.xact_rollback),
    'app_rollback', GREATEST(d.xact_rollback - rt_heartbeat, 0),
    'rollback_ratio', CASE WHEN (d.xact_commit + GREATEST(d.xact_rollback - rt_heartbeat, 0)) > 0
                           THEN round((GREATEST(d.xact_rollback - rt_heartbeat, 0)::numeric
                                        / (d.xact_commit + GREATEST(d.xact_rollback - rt_heartbeat, 0))) * 100, 3)
                           ELSE 0 END,
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