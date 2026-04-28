
CREATE TABLE IF NOT EXISTS public.cron_heartbeats (
  job_name text PRIMARY KEY,
  last_run_at timestamptz NOT NULL DEFAULT now(),
  last_status text NOT NULL DEFAULT 'ok',
  last_error text,
  runs_24h integer NOT NULL DEFAULT 0,
  failures_24h integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cron_heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view heartbeats" ON public.cron_heartbeats;
CREATE POLICY "Admins can view heartbeats" ON public.cron_heartbeats
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.record_cron_heartbeat(_job_name text, _status text DEFAULT 'ok', _error text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _now timestamptz := now();
  _window_reset boolean := false;
BEGIN
  INSERT INTO public.cron_heartbeats(job_name, last_run_at, last_status, last_error, runs_24h, failures_24h, window_start, updated_at)
  VALUES (_job_name, _now, _status, _error, 1, CASE WHEN _status = 'ok' THEN 0 ELSE 1 END, _now, _now)
  ON CONFLICT (job_name) DO UPDATE SET
    last_run_at = _now,
    last_status = _status,
    last_error = _error,
    window_start = CASE WHEN public.cron_heartbeats.window_start < _now - interval '24 hours' THEN _now ELSE public.cron_heartbeats.window_start END,
    runs_24h = CASE WHEN public.cron_heartbeats.window_start < _now - interval '24 hours' THEN 1 ELSE public.cron_heartbeats.runs_24h + 1 END,
    failures_24h = CASE
      WHEN public.cron_heartbeats.window_start < _now - interval '24 hours' THEN CASE WHEN _status = 'ok' THEN 0 ELSE 1 END
      ELSE public.cron_heartbeats.failures_24h + CASE WHEN _status = 'ok' THEN 0 ELSE 1 END
    END,
    updated_at = _now;
END;
$$;
