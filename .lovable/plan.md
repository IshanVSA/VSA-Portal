

## Plan: Fix auto-assignment to use `team_role` (not empty `department_members`)

### Root cause

The `auto_assign_ticket_pool` trigger queries `department_members` to find who should be in a ticket's pool. **That table is completely empty** — no rows for any department. Meanwhile, the actual source of truth in this app is `profiles.team_role` (e.g., `Developer`, `Maintenance` → website; `SEO Lead` → seo; `Ads Strategist`/`Ads Analyst` → google_ads; `Social & Concierge` → social_media). The frontend `useDepartmentTeam` hook already uses this mapping.

So when your "Time Changes" ticket was created for Alma (clinic `b82b…4399`):
- Trigger looked in `department_members` where `department='website'` → 0 rows
- Fallback also looked in `department_members` → 0 rows
- Pool stayed empty, `assigned_to` stayed NULL → "Unassigned"

The clinic actually has eligible website staff: **Debraj Mondal (Developer)** is on Alma's clinic team, so he should have been the sole pool member.

### Fix

Rewrite `auto_assign_ticket_pool` to derive department membership from `profiles.team_role` using the same role→department mapping as the frontend, instead of reading from the empty `department_members` table.

**Mapping (matches `useDepartmentTeam.ts`):**
```text
website       → Developer, Maintenance
seo           → SEO Lead
google_ads    → Ads Strategist, Ads Analyst
social_media  → Social & Concierge
```

Also exclude any user whose `user_roles.role = 'client'` (so clients in `clinic_team_members` never get assigned tickets).

### Database changes (one migration)

1. **Replace `auto_assign_ticket_pool()`** so it:
   - Resolves allowed `team_role`s for `NEW.department` via a CASE expression.
   - Inserts into `ticket_assignees` for every profile whose `team_role` is in that set AND who is on `clinic_team_members` for `NEW.clinic_id` AND is not a `client`.
   - Fallback (no clinic match, or `clinic_id` IS NULL): all profiles with allowed `team_role`s, excluding clients.
   - Leaves `NEW.assigned_to` NULL (pool state) unless caller already set it.
2. **Backfill** the existing unassigned "Time Changes" ticket (and any other recent unassigned ones from the past 7 days) by re-running the new logic so they immediately show the pool instead of "Unassigned".

No frontend changes needed — `TicketCard`/`Kanban`/`Table` already render the pool when `pool_user_ids.length > 0`.

### Expected result

Your Alma "Time Changes" ticket will show **Pool: 1 member — Debraj Mondal**. Once Debraj (or an admin) moves it to In Progress, the existing `claim_ticket_on_in_progress` trigger sets him as the sole assignee.

### Files

**Created**
- Supabase migration: replace `auto_assign_ticket_pool()` with team_role-based logic + backfill recent unassigned tickets.

