
## Department Tasks — Plan

A new staff-only **Tasks** tab inside each department page (Website / SEO / Google Ads / Social Media / AI SEO), scoped to the currently selected clinic. Admins create and assign tasks to team members; assignees update status, comment, attach files, and record voice notes.

### Visibility (mirrors Team Chat)
- Visible only to `admin` and `concierge` roles. Clients never see the tab.
- A concierge sees a task only if they belong to that clinic + department (same rule as `is_clinic_dept_team_member`).
- Admins see everything.

### Tabs / placement
- Add `tasks` tab next to `chat` in: `WebsiteDepartment`, `SeoDepartment`, `GoogleAdsDepartment`, `SocialMedia`, `AiSeoDepartment`.
- Unread/open-count badge on the tab (mirrors `useDepartmentChatUnread` pattern).

### Task fields
- title, description, priority (low / medium / high / urgent), due_date
- assignee (single team member; admin chooses from clinic+department staff)
- status: `todo`, `in_progress`, `done`, `cancelled`
- attachments: files in `department-files` bucket under `tasks/{clinic_id}/{task_id}/...`
- voice notes: same bucket, `tasks/{clinic_id}/{task_id}/voice/...` (`audio/webm` from MediaRecorder, identical to existing `VoiceDictation` flow but stored, not transcribed)
- comments (lightweight discussion thread on the task)

### UI
- List view with filters: All / My Tasks / Open / Overdue, plus priority chips.
- "New Task" button (admin only) opens a slide-in inspector matching the existing PostInspector aesthetic.
- Task detail drawer: edit fields, status dropdown, attachments grid, voice notes player list (record + play inline), comments thread.
- Overdue rows highlighted with `destructive` accent; priority shown with department color.

### Notifications (in-app only)
- On assign / reassign / status change / new comment → insert a row consumed by existing `NotificationBell`.
- Tab badge shows count of open tasks assigned to the current user in that clinic+department.

### Database (migration)

```text
department_tasks
  id, clinic_id, department (department_type), title, description,
  priority (enum: low|medium|high|urgent), status (enum: todo|in_progress|done|cancelled),
  due_date (date), assigned_to (uuid), created_by (uuid),
  completed_at, created_at, updated_at

department_task_attachments
  id, task_id, kind (file|voice), file_path, file_name, mime_type,
  size_bytes, duration_seconds (voice), uploaded_by, created_at

department_task_comments
  id, task_id, user_id, body, created_at
```

RLS via new security-definer helper `can_access_clinic_department(uid, clinic_id, department)` reusing `has_role('admin')`, `is_clinic_dept_team_member`. Only admins can `INSERT`/`DELETE` tasks; assignees + admins can `UPDATE` status, due_date, and own comments/attachments.

`updated_at` trigger via existing `update_updated_at_column()`. Auto-set `completed_at` when status flips to `done`.

### Notifications wiring
- Reuse existing notification table/pattern used by tickets. A small trigger inserts a notification row on insert/update of `department_tasks` when `assigned_to` changes or status changes.

### Files to add
- `supabase/migrations/*` — tables, enums, RLS, triggers.
- `src/hooks/useDepartmentTasks.ts` — list/create/update/delete with React Query.
- `src/hooks/useDepartmentTaskUnread.ts` — open-tasks-for-me count per clinic+dept.
- `src/components/department/tasks/TasksTab.tsx` — list + filters + "New Task".
- `src/components/department/tasks/TaskInspector.tsx` — slide-in detail/edit.
- `src/components/department/tasks/TaskVoiceRecorder.tsx` — MediaRecorder → upload to `department-files`.
- `src/components/department/tasks/TaskAttachments.tsx`, `TaskComments.tsx`.

### Files to edit
- `WebsiteDepartment.tsx`, `SeoDepartment.tsx`, `GoogleAdsDepartment.tsx`, `SocialMedia.tsx`, `AiSeoDepartment.tsx` — add `tasksTab` (staff-only) and `<TasksTab>` content.

### Out of scope
- Email notifications, recurring tasks, subtasks/checklists, client visibility, cross-clinic task views, AI auto-fill.
