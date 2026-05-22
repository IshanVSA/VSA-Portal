# Auto-Task on Scheduled Post Day (Social Media)

When a social-media post is scheduled to go live today, automatically create a shared "Upload post" task for that clinic's **Social & Concierge** team members. The task uses the same first-to-act-claims-it pool model as social media tickets.

## Behavior

- Trigger: every morning at **06:00 UTC** (and on-demand for backfill).
- Source posts (both, deduped per clinic+date):
  - `sm2_posts` where `scheduled_date = today` AND status is approved/ready (not draft/rejected).
  - `content_posts` where `scheduled_date = today` AND `status = 'scheduled'`.
- Candidate users: `clinic_team_members` for that clinic whose `profiles.team_role = 'Social & Concierge'`. Meta Ads Specialist excluded. If zero candidates, skip silently.
- One task per `(clinic_id, scheduled_date)` — never duplicates if cron re-runs or both sources exist.
- Task fields:
  - `department = 'social_media'`
  - `title = "Upload today's post — {ClinicName}"`
  - `description` lists each post (platform · caption preview · source).
  - `priority = 'high'`, `status = 'todo'`
  - `due_date = today + 1 day` (24-hour deadline).
  - `assigned_to = NULL` (pool); `created_by` = a system/service id (use first admin as fallback so RLS is satisfied).

## Pool / claim model

Add a lightweight candidate table mirroring `ticket_assignees`:

- `department_task_candidates(task_id, user_id)` — populated at task creation with every concierge.
- DB trigger `claim_task_on_status_change`: when `department_tasks.status` moves from `todo` to anything else AND `assigned_to IS NULL` AND `auth.uid()` is a candidate (or admin), set `assigned_to = auth.uid()` and delete the other candidates. Mirrors `claim_ticket_on_status_change` + `prune_pool_on_claim`.
- RLS update on `department_tasks`: candidate users get SELECT + UPDATE while assignee is NULL, in addition to existing assignee/creator/admin policies.

## Files

**Migration**
- New table `department_task_candidates` (task_id, user_id, created_at, PK).
- RLS: admin/concierge full; candidate self-select.
- Trigger functions `claim_task_on_status_change`, `prune_task_pool_on_claim` on `department_tasks`.
- Extend `department_tasks` SELECT/UPDATE policies so pool members see/update unclaimed tasks.

**New edge function** `supabase/functions/auto-create-upload-tasks/index.ts`
- CORS + `CRON_SECRET` auth (matches `gbp-publish-cron`).
- Service-role client. Queries today's `sm2_posts` + `content_posts`, groups by clinic, resolves concierges via `clinic_team_members` + `profiles.team_role`, upserts task + candidates idempotently (skip if a task with same title+clinic+due_date already exists today).
- Registered in `supabase/config.toml` with `verify_jwt = false`.

**pg_cron** (via insert tool, not migration):
- Daily 06:00 UTC `select net.http_post(...)` to the new function with `Authorization: Bearer <CRON_SECRET>`.

**Frontend** (`src/components/department/tasks/TasksTab.tsx` + `useDepartmentTasks.ts`)
- Tasks query: include rows where current user is in `department_task_candidates` (unclaimed pool) in addition to existing filter.
- Show a small "Pool · auto-claims on status change" chip when `assigned_to` is null and current user is a candidate.
- Status change of a pool task triggers the DB-side claim automatically; UI just optimistically refetches.

## Out of scope

- Notifications/emails on task creation (can be added later by reusing existing notify functions).
- GBP posts, blog posts, other departments.
- Changing how posts are scheduled or published.
