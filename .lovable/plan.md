

## Per-Department Ticket Assignment & Completion

Today, a cross-department ticket (e.g. "Time Change" → Website + SEO + Google Ads + Social Media) is a **single row** with one `assigned_to` and one `status`. Whichever department changes the status changes it for everyone, and there's no concept of each dept having its own assignee.

We'll change this so each department gets its **own assignee + own status** for the same ticket, and the client only sees "Completed" once **every** involved department marks it complete.

---

### What changes for each role

**Admin / Concierge / Department Staff**
- Open a "Time Change" ticket in the Website department → see the Website assignee, Website status, and a small badge `Website ✓ · SEO ⏳ · Ads ⏳ · Social ⏳` showing other depts' progress.
- Each dept's assign / status dropdown only updates **that department's** record.
- Each department auto-assigns to a clinic team member with the matching role (Developer, SEO Lead, Ads Strategist, Social & Concierge) for that clinic — same logic as today, but applied per department.

**Client**
- Sees one ticket card per ticket (not 4 copies).
- Status shown is the **rollup**:
  - `Completed` only when every involved department is completed
  - `In Progress` if any dept is in progress
  - `Open` otherwise
  - `Void` if any dept voids it (with reason)
- A small footer shows: `Progress: 2 of 4 departments complete`.

---

### Data model

Add a new table `department_ticket_assignments` (one row per ticket × department):

```text
id              uuid pk
ticket_id       uuid  → department_tickets(id) on delete cascade
department      department_type
assigned_to     uuid  null → profiles(id)
status          ticket_status default 'open'
completed_at    timestamptz null
notes           text null
created_at, updated_at
unique (ticket_id, department)
```

- On ticket insert, a trigger fans out: for each department in the ticket-type's visibility list, create a row and auto-assign to a clinic-scoped team member with the right role (reuses logic from `auto_assign_ticket_pool`).
- A view/function `ticket_rollup_status(ticket_id)` returns `completed` only when all assignment rows are `completed`; otherwise the most-progressed non-void status. Voids surface as `void`.
- A trigger updates `department_tickets.status` to the rollup whenever an assignment row changes — so existing client queries continue to work without rewrites.
- RLS on the new table mirrors `department_tickets`: dept members see their dept's row; admins see all; clients see read-only via the parent ticket.

### Frontend

- **`TicketsTab`**: query joins `department_ticket_assignments` filtered by current `department`, so the assignee/status shown is the per-dept row (not the parent).
- **`TicketCard`** (staff view): status & assign dropdowns write to the assignment row, not the parent. Add an "Other departments" mini-strip showing each involved dept + its status icon.
- **`TicketCard`** (client view): hides per-dept controls, shows rollup status + "X of Y departments complete" progress.
- **`NewTicketDialog`**: unchanged from user perspective — fan-out happens server-side on insert.
- Keep the conditional rule for "Add/Remove Team Members" → social_media (only when `Promote on Social Media: Yes`); the fan-out trigger respects this.

### Migration of existing tickets

A one-shot SQL block backfills `department_ticket_assignments` for every existing ticket using the same visibility map, copying the current `assigned_to` and `status` into the row matching the ticket's `department` field, and creating `open`/unassigned rows for the other involved departments.

### Files to change

- **DB migration**: new table, fan-out trigger, rollup trigger, RLS policies, backfill.
- `src/lib/ticket-department-map.ts` — export helper used server-side mirror; no behaviour change.
- `src/components/department/TicketsTab.tsx` — query assignments instead of parent for status/assignee.
- `src/components/department/TicketCard.tsx` — write to assignment row; render cross-dept strip; client rollup view.
- `src/components/department/TicketKanbanView.tsx` and `TicketTableView.tsx` — same per-dept read/write swap.
- `src/components/dashboard/MyTickets.tsx` — show only assignments where `assigned_to = me`.

### Out of scope (confirm if you want these too)

- Notifying the client when each individual dept completes (currently silent until full rollup).
- Letting one department "skip" itself (e.g. SEO says "no change needed") — today they'd have to mark Completed.

