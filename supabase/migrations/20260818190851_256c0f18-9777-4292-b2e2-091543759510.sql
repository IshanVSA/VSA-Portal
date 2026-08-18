-- Spread hourly jobs across different minutes to avoid pg_cron startup contention
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname='auto-approve-posts-hourly'), schedule := '5 * * * *');
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname='auto-approve-content-requests-15min'), schedule := '20 * * * *');
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname='ticket-automation-hourly'), schedule := '35 * * * *');
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname='sm2-worker-tick'), schedule := '2,7,12,17,22,27,32,37,42,47,52,57 * * * *');
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname='blog-worker-every-3min'), schedule := '4,14,24,34,44,54 * * * *');
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname='ga4-sync-worker'), schedule := '8,23,38,53 * * * *');
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname='auto-popup-expiry-tasks-daily'), schedule := '15 6 * * *');
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname='auto-upload-tasks-daily'), schedule := '25 6 * * *');
