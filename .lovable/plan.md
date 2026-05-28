# Client Chat (per Department)

Add a new "Client Chat" tab in every department (Website, SEO, Google Ads, AI SEO, Social Media) that works like the existing Team Chat but is visible to **clients and sub-clients** as well as staff. Primary use case: clients share pet photos / treatment images with the team.

## Scope

- Visible to: Admin, Concierge (assigned to dept/clinic), Client, Sub-client (per existing clinic access rules).
- Same UX as Team Chat: messages, replies, reactions, pins, edits, file/image attachments, drag-and-drop, search, typing indicators, unread badge.
- Image-friendly: inline thumbnails for image attachments (already supported by `DepartmentChat`), 10 MB / 5 file limits, stored in the existing `department-files` bucket under a `client-chat/...` prefix.
- Per-department, per-clinic channel — same model as Team Chat.

## Data model (new tables)

Create two new tables that mirror the existing team-chat tables so RLS and access scopes stay clean and independent:

1. `public.department_client_chats` — same columns as `department_chats` (`id`, `department`, `clinic_id`, `user_id`, `message`, `attachments`, `reactions`, `reply_to`, `pinned`, `edited_at`, `created_at`).
2. `public.department_client_chat_reads` — same columns as `department_chat_reads` (`user_id`, `department`, `clinic_id`, `last_read_message_id`, `last_read_at`).

RLS:
- **Select / Insert / Update (reactions, edits)**: allowed when the user is staff with access to that dept+clinic (same predicate as Team Chat) **OR** when the user is a client/sub-client with access to that clinic (reuse existing helpers such as `has_clinic_access` / `is_clinic_client`).
- **Delete**: admins only (same as Team Chat).
- `department_client_chat_reads`: user can read/write only their own row.
- GRANTs to `authenticated` (and `service_role`); no `anon`.

Realtime: add both tables to the `supabase_realtime` publication.

## Frontend

1. Refactor `src/components/department/DepartmentChat.tsx` to accept a `variant: "team" | "client"` prop (or a thin wrapper). The variant chooses:
   - Table names (`department_chats` vs `department_client_chats`, and matching reads table).
   - Storage prefix (`chat/...` vs `client-chat/...`).
   - Realtime channel name.
   - Header label / empty state copy ("Client Chat — share photos and updates with your clinic team").
   - Mentions: keep staff-only mentionable list; clients won't see suggestions but can post freely.
2. Add `useDepartmentClientChatUnread` hook (clone of `useDepartmentChatUnread` pointed at the new tables).
3. Add a new tab `client-chat` (icon: `Users` or `Camera`, label "Client Chat") to each department page:
   - `src/pages/WebsiteDepartment.tsx`
   - `src/pages/SeoDepartment.tsx`
   - `src/pages/GoogleAdsDepartment.tsx`
   - `src/pages/AiSeoDepartment.tsx`
   - `src/pages/SocialMedia.tsx` (only where a dept-chat surface exists)
   The tab is visible to **all roles** (not gated by `isStaff`), shows an unread badge from the new hook, and renders `<DepartmentChat variant="client" ... />`.
4. Respect existing service-access gating (`useClinicServiceAccess`) so a locked department also hides Client Chat for clients.

## Out of scope

- No changes to the existing Team Chat behavior or table.
- No new notification channels (email/push) — only the in-app unread badge.
- No moderation tooling beyond admin-delete (same as Team Chat).

## Technical notes

- Reusing `DepartmentChat` via a `variant` prop avoids duplicating ~1000 lines of UI.
- File uploads continue to use the public `department-files` bucket; image previews already render inline via `FilePreviewDialog`.
- Client role must already have a working session; no auth changes needed.
- Migration order per table: `CREATE TABLE` → `GRANT` → `ENABLE RLS` → `CREATE POLICY`.

Confirm and I'll implement.
