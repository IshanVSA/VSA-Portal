
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
SECURITY DEFINER
STABLE
SET search_path = public, cron
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (j.jobname)
      j.jobname,
      d.start_time AS last_run_at,
      d.status::text AS last_status,
      d.return_message AS last_message
    FROM cron.job j
    LEFT JOIN cron.job_run_details d ON d.jobid = j.jobid
    ORDER BY j.jobname, d.start_time DESC NULLS LAST
  ),
  windowed AS (
    SELECT
      j.jobname,
      COUNT(d.runid) FILTER (WHERE d.start_time > now() - interval '24 hours') AS runs_24h,
      COUNT(d.runid) FILTER (WHERE d.start_time > now() - interval '24 hours' AND d.status::text <> 'succeeded') AS failures_24h
    FROM cron.job j
    LEFT JOIN cron.job_run_details d ON d.jobid = j.jobid
    GROUP BY j.jobname
  )
  SELECT
    l.jobname,
    l.last_run_at,
    l.last_status,
    l.last_message,
    COALESCE(w.runs_24h, 0)::bigint,
    COALESCE(w.failures_24h, 0)::bigint
  FROM latest l
  LEFT JOIN windowed w USING (jobname);
$$;

REVOKE ALL ON FUNCTION public.get_cron_job_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cron_job_health() TO authenticated, service_role;
