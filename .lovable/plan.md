

## Plan: Pool-then-claim ticket assignment

### Current behavior
A ticket has a single `assigned_to` user. The `auto_assign_ticket` trigger picks one department member with the lightest workload. There is no concept of multiple assignees or "claim on status change."

### New behavior

1. **On ticket creation** — auto-assign to **every** department team member who is also on that clinic's team (for that ticket's department). The ticket sits in a shared pool visible to all of them.
2. **When anyone moves the ticket to "In Progress"** — that person becomes the **sole assignee**; all other co-assignees are removed.
3. **Fallbacks**:
   - If no one in the department is on the clinic team → assign to all department members for that department (so it doesn't get lost).
   - If clinic_id is null → assign to all department members.

### Data model change

Add a join table for many-to-many assignment, keeping `assigned_to` as the "claimed by" single-user column for backwards compatibility:

```text
ticket_assignees
├─ ticket_id  (uuid, fk department_tickets.id, on delete cascade)
├─ user_id    (uuid)
├─ created_at
└─ PRIMARY KEY (ticket_id, user_id)
```

- `department_tickets.assigned_to` keeps its current meaning: **null** while the ticket is in the shared pool, **set to the claimer** once someone moves it to In Progress (or manually picks it up).
- RLS: clients read-only for their clinic's tickets; admins/concierges/department members can read; only admins/department members can insert/delete rows.

### Database changes

1. **Create table** `ticket_assignees` with RLS policies above.
2. **Replace trigger** `auto_assign_ticket` with `auto_assign_ticket_pool`:
   - On INSERT: insert one row into `ticket_assignees` for every department member who is also on `clinic_team_members` for `NEW.clinic_id` (fallback: all dept members).
   - Leave `NEW.assigned_to` NULL (pool state).
3. **New trigger** `claim_ticket_on_in_progress` (BEFORE UPDATE on `department_tickets`):
   - When `OLD.status != 'in_progress'` AND `NEW.status = 'in_progress'` AND `NEW.assigned_to IS NULL`:
     - Set `NEW.assigned_to = auth.uid()` (if the actor is one of the co-assignees; otherwise leave as-is).
   - When `assigned_to` changes from NULL → uuid: delete all other rows from `ticket_assignees` for this ticket, keeping only that user.

### Frontend changes

1. **`useDepartmentTeam` / Tickets query** — fetch co-assignees from `ticket_assignees` and expose `coAssignees: TeamMemberOption[]` per ticket.
2. **TicketCard / TicketKanbanView / TicketTableView**:
   - When `assigned_to` is null → show stacked avatars / "Pool: 3 members" badge instead of "Unassigned".
   - When `assigned_to` is set → show single assignee (current behavior).
   - Status select: when a staff member changes status to "In Progress" while ticket is in the pool, the trigger auto-claims. UI just refreshes.
3. **Filtering** — staff "My Tickets" / personal queues should include tickets where the user is in `ticket_assignees` (pool tickets they can claim) plus tickets where `assigned_to = me`.

### Files

**Edited**
- `src/components/department/TicketCard.tsx` — render co-assignee avatars when pool, single assignee when claimed.
- `src/components/department/TicketKanbanView.tsx` — same display change.
- `src/components/department/TicketTableView.tsx` — assignee column shows pool count or single name.
- `src/components/department/TicketsTab.tsx` — fetch ticket_assignees alongside tickets and pass through.
- `src/integrations/supabase/types.ts` — auto-regenerated after migration.

**Created**
- Supabase migration: `ticket_assignees` table + RLS + replace `auto_assign_ticket` + add `claim_ticket_on_in_progress` trigger.

### Notes
- The audit log already captures `assigned_to` changes, so the claim event is logged automatically.
- Clients remain read-only — banner and disabled controls are unaffected.

