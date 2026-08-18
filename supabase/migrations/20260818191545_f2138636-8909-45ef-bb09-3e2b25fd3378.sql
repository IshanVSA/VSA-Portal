REVOKE ALL ON FUNCTION public.get_db_overview() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_db_table_stats(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_db_slow_queries(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_db_active_queries() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_db_health_trend(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.capture_db_health_snapshot() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_db_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_db_table_stats(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_db_slow_queries(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_db_active_queries() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_db_health_trend(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.capture_db_health_snapshot() TO service_role;