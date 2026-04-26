## Goal
Add a month-based filter to the Tickets tab in every department, with smart carry-forward logic so any ticket that wasn't completed before the month ended automatically shows up in the next month (and keeps rolling forward until it's completed or void).

## Behavior

**Month selector** (added to the toolbar in `TicketsTab.tsx`, next to the status filter chips):
- Options: `All Months` · `This Month` (default) · `Last Month` · plus a dropdown of the last 12 months.

**What shows up in a selected month (e.g. "April 2026"):**
1. Every ticket **created in April 2026**, AND
2. Every ticket **created before April 2026** that is still `open`, `in_progress`, or `emergency` (i.e. not `completed` or `void`) as of the end of April — these are the carry-forwards.
3. Tickets that were `completed`/`void` in a prior month do NOT carry forward.

**Visual cue for carry-forwards:**
- A small amber "Carried over" pill on the ticket card (next to the status badge) showing the original creation month, e.g. *"Carried from Mar 2026"*. This makes it clear the work is overdue without changing the underlying ticket.

**"All Months"** behaves like today (no date filter).

## Technical Implementation

**Frontend only — no schema or cron changes needed.** Carry-forward is a pure read-time filter based on `created_at` and `status`, so it works retroactively for existing tickets.

1. **`src/components/department/TicketsTab.tsx`**
   - Add `monthFilter` state (`"all" | "YYYY-MM"`, default = current `YYYY-MM`).
   - Build a list of the last 12 months for the dropdown.
   - After the existing status/department merge, apply month filtering in JS:
     - If `monthFilter === "all"` → no change.
     - Else, parse selected month start/end. Keep ticket if:
       - `created_at` falls inside the month, OR
       - `created_at < monthStart` AND current per-department `status` ∈ {`open`, `in_progress`, `emergency`}.
     - Tag each kept ticket with `__carriedFrom: "MMM YYYY"` when its `created_at` is before `monthStart`.
   - Add a `Select` (shadcn) to the toolbar for month choice; keep status chips as-is.

2. **`src/components/department/TicketCard.tsx`**
   - If `ticket.__carriedFrom` is set, render a small amber outline badge "Carried from {month}" beside the status badge.

3. **`src/components/department/TicketKanbanView.tsx`**
   - Pass tickets through unchanged; the `__carriedFrom` flag propagates to `TicketCard`.

4. Stat counts (Open / In Progress / Completed / Emergency) recompute from the month-filtered list so the summary matches what's visible.

No database migration, no edge function changes, no impact on ticket creation flow.