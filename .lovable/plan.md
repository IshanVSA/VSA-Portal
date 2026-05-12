## Goal

Replace the current "pool + auto-pick lightest workload" behavior with a **multi-assignee model**: every new ticket is initially assigned to **all** matching team members in that clinic's department. As soon as one person changes the status (in_progress / completed / void), the ticket collapses to that single person and disappears from everyone else's view.

## Behavior summary

| State | Who sees it as "their" ticket | Assignee field shows |
|---|---|---|
| `open` (just created) | Every dept team member assigned to that clinic | All their names (e.g. "Devraj, Ayushi") |
| Anyone moves to `in_progress` / `completed` / `void` | Only the actor | That single person's name |
| Admin manually assigns | Only chosen person | That single person's name |

No more "Pool: 2 members" chip and no more "Unassigned" label when candidates exist.

## Changes

### 1. Database (migration)

- **Rewrite `auto_assign_ticket_pool` trigger** so on INSERT it:
  - Inserts a row per matching team member into `ticket_assignees` (clinic team members with the right `team_role`, fallback to all role-matched profiles if the clinic has none).
  - **Does NOT** set `department_tickets.assigned_to` anymore (leave NULL while multiple candidates exist).
- **New trigger `claim_on_status_change`** on `department_tickets` BEFORE UPDATE:
  - When `status` transitions from `open` → any other status (`in_progress`, `completed`, `void`, `emergency`) AND `assigned_to IS NULL`, set `assigned_to = auth.uid()` if the actor is in `ticket_assignees` for that ticket (or admin).
  - The existing `prune_pool_on_claim` trigger then deletes the other pool members automatically.
- **Same logic for `department_ticket_assignments`** (the per-department row that drives kanban/table status): when its `status` moves off `open`, set `assigned_to = auth.uid()`.
- **Backfill**: for currently-open tickets with NULL `assigned_to`, repopulate `ticket_assignees` from the clinic's dept team members so they show up as multi-assignee (instead of the single workload-picked person).

### 2. Frontend display (no business logic change beyond rendering)

Files: `src/components/department/TicketCard.tsx`, `src/components/department/TicketTableView.tsx`, `src/components/dashboard/OpenTicketsList.tsx`, `src/components/department/TicketsTab.tsx` (already loads `pool_user_ids`).

- When `assigned_to` is set → show that single name (current behavior).
- When `assigned_to` is NULL and `pool_user_ids.length > 0` → show **comma-separated names** of all pool members instead of "Pool: N members".
  - Truncate gracefully ("Devraj, Ayushi +2" if more than ~3) with full list in tooltip.
- Remove the "Unassigned" italic label whenever pool has members.
- Assignee `<Select>` dropdown stays as-is for manual override (admin/concierge can still hand-pick one person).

### 3. Filtering "my tickets"

- `src/components/dashboard/MyTickets.tsx` and any "assigned to me" query: include tickets where the current user is in `ticket_assignees` (pool) **OR** is the sole `assigned_to`. So Devraj and Ayushi both see the open ticket in their list; once Ayushi marks it in_progress, it drops off Devraj's list.

### 4. Notifications

- `notify-ticket-created` edge function: notify every pool member (not just `assigned_to`).

## Out of scope

- No changes to ticket creation form, departments, RLS structure, or visibility fanout to other departments.
- The 48-hour emergency escalation cron stays as-is.

## Technical notes

- Status transitions handled in DB ensure consistency even if the UI bypasses the Select (drag-and-drop on kanban, bulk actions).
- `prune_pool_on_claim` already handles cleanup when `assigned_to` is set, so once we set it on first status change, the pool is wiped automatically.
- We keep `ticket_assignees` as the source of truth for "candidate assignees" — no schema change needed, just trigger logic + UI rendering.
