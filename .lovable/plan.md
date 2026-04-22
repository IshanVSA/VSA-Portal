

## Plan: Fix sole-member auto-assignment by changing trigger timing

### Root cause

The `trg_auto_assign_ticket_pool` trigger is registered as **AFTER INSERT**. Inside the function, the line `NEW.assigned_to := sole_member` only takes effect on **BEFORE** triggers — on AFTER triggers, mutations to `NEW` are silently discarded by Postgres.

Result: the pool row gets inserted into `ticket_assignees` correctly (1 member = Debraj), but the ticket's own `assigned_to` column is never updated. The card shows "Pool: 1 member" instead of being assigned to Debraj, and the client view shows "Unassigned".

The previous tickets at 13:58 and 14:11 only appear assigned because the migration's one-time backfill `UPDATE` statement caught them. Any ticket created after the migration ran misses the backfill and stays unassigned.

### Fix (one migration)

1. **Drop and recreate the trigger as `BEFORE INSERT`** so `NEW.assigned_to := sole_member` actually persists to the row being inserted.
2. **Re-run the backfill** for unassigned tickets in the last 7 days that have exactly one pool member, so the new "Time Changes Request" at 14:22 gets assigned to Debraj immediately.

No function body change needed — the logic is already correct, only the trigger timing is wrong.

### Expected result

- New tickets with a single eligible team member are assigned to that person at insert time.
- The 14:22 Alma ticket flips from "Pool: 1 member / Unassigned" to "Assigned to Debraj Mondal" after refresh.
- Multi-member pools continue to work as before (claim-on-in-progress).

### Files

**Created**
- Supabase migration: drop `trg_auto_assign_ticket_pool`, recreate as `BEFORE INSERT`, backfill unassigned single-pool tickets from last 7 days.

