# Production Reset — Clear All Test Data

You're going live with real clients. This plan wipes every piece of test/operational data while keeping the foundation intact so new clients arrive at a clean slate.

## What WILL be deleted (cleared to zero)

**Tickets & related**

- `department_tickets`, `department_ticket_assignments`, `ticket_assignees`, `ticket_audit_log`

**Social media content (SM2)**

- `sm2_generations`, `sm2_posts`, `sm2_post_performance`
- `content_posts`, `content_requests`, `content_versions`, `content_calendar`
- `post_activity_log`, `post_comments`, `post_workflow`
- `calendar_submissions`, `compliance_override_log`

**Brand DNA & monthly planning**

- `clinic_brand_dna` (full reset — every clinic re-does DNA collection)
- `clinic_monthly_signals`, `clinic_promotions`

**GBP (Google Business Profile)**

- `gbp_post_history`, `gbp_recent_content`, `gbp_compliance_scans`,
- `clinic_gbp_config` will be cleared (clinics re-sync from DNA)

**Blogs**

- `blog_posts`, `blog_client_submissions`, `blog_tracker`
- &nbsp;

**Notifications & chat**

- `department_chats`, `department_chat_reads`
- Notification "read" state lives in browser localStorage per user — it auto-clears as soon as the underlying records (tickets/posts/sm2) are deleted, so the bell will be empty.

**Client journey**

- `client_journey_steps` (clinics re-progress through onboarding from step 1)

**Misc operational state**

- `oauth_temp_tokens`, `cron_heartbeats`

## What WILL be preserved

- `clinics` — all clinic records stay
- `profiles`, `user_roles`, `client_sub_accounts`, `sub_account_clinics` — all users/logins stay
- `clinic_team_members`, `department_members` — staff assignments stay
- `clinic_api_credentials` — Meta/Google Ads/GA4 connections stay
- `terms_acceptance_log`, `terms_decline_log`, `terms_versions` — legal records preserved
- `sm2_system_prompts`, `blog_prompt_versions`, `gbp_topic_library`, `statutory_holidays_reference` — reference data preserved

## Execution

A single SQL migration, ordered to respect foreign keys (children first, parents last). Each statement is a `DELETE` with a safe `WHERE` clause (no `TRUNCATE`, so RLS-protected tables and triggers behave correctly).

Order:

```text
1. ticket_audit_log, ticket_assignees, department_ticket_assignments
2. department_tickets
3. post_activity_log, post_comments, post_workflow
4. content_calendar, content_versions
5. content_posts, content_requests
6. sm2_post_performance, sm2_posts, sm2_generations
7. compliance_override_log, calendar_submissions
8. gbp_compliance_scans, gbp_post_history, gbp_recent_content, gbp_batches
9. geo_clusters, clinic_gbp_config
10. clinic_brand_dna, clinic_monthly_signals, clinic_promotions
11. blog_client_submissions, blog_posts, blog_tracker
12. analytics, seo_analytics, website_pageviews, pagespeed_scores
13. department_chat_reads, department_chats
14. client_journey_steps
15. oauth_temp_tokens, cron_heartbeats
```

## After reset

- All clinics will appear with zero tickets, zero content, zero analytics
- Each clinic's onboarding journey resets to step 1
- Brand DNA must be re-collected per clinic before SM2 generation unlocks
- Notification bell becomes empty for all users
- Logged-in users stay logged in (auth not touched)

## Important notes

- This is **irreversible**. Once executed there is no built-in undo.
- It does NOT delete clinics or users. If you also want to remove specific test clinics or test user accounts, tell me which ones and I'll add that to the migration.
- Storage files (deliverables in `department-files` bucket) are NOT touched by SQL. If you want those purged too, say so and I'll add a cleanup step.

Approve to proceed.