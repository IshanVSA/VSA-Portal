

## Plan: Make tickets read-only for clients across all views

### Problem

Clients can currently change ticket status, assignee, and department through:
- **Kanban view** — drag-and-drop between columns
- **Card view** — Status / Department / Assign dropdowns inside the expanded "Details" panel
- **Table view** — Status and Assignee dropdowns inline in each row

Clients should be able to **see** everything (status badges, assignee, void reason, details) but never change anything ticket-related.

### Solution

Detect the client role once via the existing `useUserRole()` hook in each view component and render a read-only variant when `role === "client"`. Admin and concierge behavior is unchanged.

### Behavior by view

**Kanban view (`TicketKanbanView.tsx`)**
- Cards become non-draggable (`draggable={false}`, no `GripVertical` handle, no `cursor-grab`).
- Drop targets stop accepting drops (skip `onDragOver` / `onDrop` handlers, no "Drop here" hint).
- Tickets remain visible in their respective status columns.

**Card view (`TicketCard.tsx`)**
- "Details" expand button stays so clients can still read description, void reason, dates, badges.
- The bottom action row (Status / Dept / Assign selects) is hidden entirely for clients.
- Status/priority/assignee shown as read-only badges (already present at the top of the card).

**Table view (`TicketTableView.tsx`)**
- Status column renders the existing colored status badge instead of a `Select`.
- Assigned-to column renders the assignee name (or "Unassigned" muted text) instead of a `Select`.
- All other columns unchanged.

**New Ticket button**
- Stays available — clients submit tickets, they just can't manage them after creation.

### Technical details

- Add `const { role } = useUserRole(); const isClient = role === "client";` to each of the three view components.
- In Kanban: gate `draggable`, `onDragStart`, `onDragOver`, `onDrop`, `handleStatusChange`, and the `GripVertical` icon on `!isClient`. Replace `cursor-grab active:cursor-grabbing` with `cursor-default` for clients.
- In Card: wrap the bottom controls block (lines ~283-330) in `{!isClient && (...)}`.
- In Table: replace the two `<Select>` blocks in the status and assignee `TableCell`s with read-only badges/text when `isClient`.
- No backend/RLS changes — server-side RLS already prevents unauthorized writes; this is purely a UX fix to stop showing controls that would silently fail.

### Files

**Edited**
- `src/components/department/TicketKanbanView.tsx` — disable drag-and-drop for clients
- `src/components/department/TicketCard.tsx` — hide management controls in expanded panel for clients
- `src/components/department/TicketTableView.tsx` — replace selects with read-only badges for clients

