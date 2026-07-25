CREATE OR REPLACE FUNCTION public.get_cron_job_health()
RETURNS TABLE(
  jobname text,
  last_run_at timestamptz,
  last_status text,
  last_message text,
  runs_24h bigint,
  failures_24h bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, cron
AS $$
  WITH bounds AS (
    SELECT GREATEST(COALESCE(MAX(runid), 0) - 10000, 0) AS min_runid
    FROM cron.job_run_details
  ),
  recent AS (
    SELECT d.jobid, d.start_time, d.status::text AS status, d.return_message
    FROM cron.job_run_details d, bounds b
    WHERE d.runid >= b.min_runid
      AND d.start_time IS NOT NULL
  ),
  latest AS (
    SELECT DISTINCT ON (jobid) jobid, start_time, status, return_message
    FROM recent
    ORDER BY jobid, start_time DESC
  ),
  windowed AS (
    SELECT
      jobid,
      COUNT(*) FILTER (WHERE start_time > now() - interval '24 hours') AS runs_24h,
      COUNT(*) FILTER (WHERE start_time > now() - interval '24 hours' AND status <> 'succeeded') AS failures_24h
    FROM recent
    GROUP BY jobid
  )
  SELECT
    j.jobname,
    l.start_time AS last_run_at,
    l.status AS last_status,
    l.return_message AS last_message,
    COALESCE(w.runs_24h, 0)::bigint AS runs_24h,
    COALESCE(w.failures_24h, 0)::bigint AS failures_24h
  FROM cron.job j
  LEFT JOIN latest l ON l.jobid = j.jobid
  LEFT JOIN windowed w ON w.jobid = j.jobid;
$$;

GRANT EXECUTE ON FUNCTION public.get_cron_job_health() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cron_job_health() TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_cron_job_health() FROM anon;