-- Disable GBP auto-regenerate triggers for the duration of this migration
ALTER TABLE public.geo_clusters DISABLE TRIGGER trg_regenerate_batches_on_cluster_change;
ALTER TABLE public.clinic_gbp_config DISABLE TRIGGER trg_regenerate_batches_on_config_change;

-- 1. Tickets
DELETE FROM public.ticket_audit_log WHERE id IS NOT NULL;
DELETE FROM public.ticket_assignees WHERE ticket_id IS NOT NULL;
DELETE FROM public.department_ticket_assignments WHERE id IS NOT NULL;
DELETE FROM public.department_tickets WHERE id IS NOT NULL;

-- 2. Content workflow / activity / comments
DELETE FROM public.post_activity_log WHERE id IS NOT NULL;
DELETE FROM public.post_comments WHERE id IS NOT NULL;
DELETE FROM public.post_workflow WHERE post_id IS NOT NULL;

-- 3. Content calendar / versions
DELETE FROM public.content_calendar WHERE id IS NOT NULL;
DELETE FROM public.content_versions WHERE id IS NOT NULL;

-- 4. Content posts and requests
DELETE FROM public.content_posts WHERE id IS NOT NULL;
DELETE FROM public.content_requests WHERE id IS NOT NULL;

-- 5. SM2
DELETE FROM public.sm2_post_performance WHERE id IS NOT NULL;
DELETE FROM public.sm2_posts WHERE id IS NOT NULL;
DELETE FROM public.sm2_generations WHERE id IS NOT NULL;

-- 6. Compliance & calendar submissions
DELETE FROM public.compliance_override_log WHERE id IS NOT NULL;
DELETE FROM public.calendar_submissions WHERE id IS NOT NULL;

-- 7. GBP — children first, then batches (FK to geo_clusters), then configs, then clusters
DELETE FROM public.gbp_compliance_scans WHERE id IS NOT NULL;
DELETE FROM public.gbp_post_history WHERE id IS NOT NULL;
DELETE FROM public.gbp_recent_content WHERE id IS NOT NULL;
DELETE FROM public.gbp_batches WHERE id IS NOT NULL;
DELETE FROM public.clinic_gbp_config WHERE id IS NOT NULL;
DELETE FROM public.geo_clusters WHERE cluster_id IS NOT NULL;

-- 8. Brand DNA & monthly planning
DELETE FROM public.clinic_brand_dna WHERE id IS NOT NULL;
DELETE FROM public.clinic_monthly_signals WHERE id IS NOT NULL;
DELETE FROM public.clinic_promotions WHERE id IS NOT NULL;

-- 9. Blogs
DELETE FROM public.blog_client_submissions WHERE id IS NOT NULL;
DELETE FROM public.blog_posts WHERE id IS NOT NULL;
DELETE FROM public.blog_tracker WHERE id IS NOT NULL;

-- 10. Analytics
DELETE FROM public.analytics WHERE id IS NOT NULL;
DELETE FROM public.seo_analytics WHERE id IS NOT NULL;
DELETE FROM public.website_pageviews WHERE id IS NOT NULL;
DELETE FROM public.pagespeed_scores WHERE id IS NOT NULL;

-- 11. Chat
DELETE FROM public.department_chat_reads WHERE id IS NOT NULL;
DELETE FROM public.department_chats WHERE id IS NOT NULL;

-- 12. Client journey
DELETE FROM public.client_journey_steps WHERE id IS NOT NULL;

-- 13. Misc operational state
DELETE FROM public.oauth_temp_tokens WHERE id IS NOT NULL;
DELETE FROM public.cron_heartbeats WHERE job_name IS NOT NULL;

-- Re-enable triggers
ALTER TABLE public.geo_clusters ENABLE TRIGGER trg_regenerate_batches_on_cluster_change;
ALTER TABLE public.clinic_gbp_config ENABLE TRIGGER trg_regenerate_batches_on_config_change;