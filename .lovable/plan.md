

## Plan: Add "Void" status + automatic ticket assignment

### 1. Database changes (migration)

- Extend the `ticket_status` enum to include a new value: **`void`**.
- Add two new columns on `department_tickets`:
  - `void_reason` (text, nullable) — required when status is set to void
  - `voided_by` (uuid, nullable) — captures the admin/team member who voided it
  - `voided_at` (timestamptz, nullable)

### 2. Auto-assignment on ticket creation (database trigger)

Replace the manual-only flow with an **automatic round-robin trigger** that fires on `INSERT` into `department_tickets`:

- Look up all `department_members` for the ticket's `department`
- If the ticket has a `clinic_id`, intersect with `clinic_team_members` so only members assigned to that clinic are eligible
- Pick the member with the **fewest currently open/in_progress tickets** in that department (load-balanced round-robin)
- Set `assigned_to` and bump `status` to `in_progress`
- Fall back to department lead (existing behavior) if no eligible member found

This means new tickets are auto-assigned at creation time rather than waiting for the hourly `ticket-automation` cron.

### 3. UI: Void status everywhere

**TicketCard** (`src/components/department/TicketCard.tsx`)
- Add `void` to `statusConfig` (slate/grey color, `Ban` icon, `border-l-slate-500`)
- Add `Void` to status options in the dropdown (admin & concierge only — hidden from clients)
- When user picks "Void", open a small inline AlertDialog asking for a **mandatory reason** (textarea). On confirm, write `status='void'`, `void_reason`, `voided_by=auth.uid()`, `voided_at=now()`
- In the expanded panel, when status is void, show the reason in a destructive-styled callout

**TicketKanbanView** (`src/components/department/TicketKanbanView.tsx`)
- Add a 5th column "Void" with grey styling
- Drag-drop into Void column triggers the same reason prompt before persisting

**TicketTableView** (`src/components/department/TicketTableView.tsx`)
- Add Void to the status filter and status badge map

**TicketsTab + DepartmentOverview + AdminDashboard counts**
- Include `void` tickets in the "all" view but exclude them from open/in-progress KPI tallies

### 4. Manual reassignment stays available

The Assignee dropdown on every card stays editable so admins can override the auto-assignment if needed. We are only changing the **default at creation time**, not removing manual control.

### 5. Files touched

- New migration: extend enum, add 3 columns, create `auto_assign_ticket()` trigger function + `BEFORE INSERT` trigger on `department_tickets`
- `src/components/department/TicketCard.tsx` — status config, void dialog, reason display
- `src/components/department/TicketKanbanView.tsx` — Void column, drag-drop reason prompt
- `src/components/department/TicketTableView.tsx` — Void badge & filter
- `src/components/department/TicketsTab.tsx` — include void in fetched list, optional filter chip
- `src/components/dashboard/MyTickets.tsx` — show Void badge
- `supabase/functions/ticket-automation/index.ts` — keep as a safety-net for any tickets the trigger missed; skip voided tickets in escalation logic

### 6. What the user sees

- Creating a new ticket: it instantly shows "In Progress · Assigned to [name]" (no more "Unassigned" state)
- Any admin/team member can change status → "Void" → enter reason → ticket greys out with the reason visible
- Clients see voided tickets but cannot void them themselves

