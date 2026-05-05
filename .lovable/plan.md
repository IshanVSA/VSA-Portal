## Goal

Give admins a single view answering: of all clients (and their sub-accounts), how many have actually logged into the portal, and when each one was last active. Hidden from concierge, clients, and sub-accounts.

## What admins will see

A new card on the Clients page (admin-only):

- Three KPIs at the top:
  - Total clients
  - Logged in at least once
  - Active in the last 30 days
- An extra column on the existing clients table: **Last seen** (e.g. "2 hours ago", "3 days ago", "Never").
- Sortable by Last seen, with a small filter chip: All / Active 30d / Never logged in.

Sub-accounts (`sub_client`) are tracked too and rolled up under their parent client, with a tooltip listing each sub-account's own last-seen timestamp.

## How it works (technical)

We can't read `auth.users.last_sign_in_at` directly from the client SDK and we don't want to ship the service-role key. Two parts:

**1. Database** (`supabase--migration`)
- New table `public.user_login_activity`:
  - `user_id uuid PK references profiles(id) on delete cascade`
  - `first_login_at timestamptz`
  - `last_seen_at timestamptz`
  - `login_count int default 0`
- RLS:
  - SELECT: `has_role(auth.uid(),'admin')` only.
  - INSERT/UPDATE: only via the security-definer RPC below (no direct writes from clients).
- RPC `public.touch_login_activity()` `SECURITY DEFINER`:
  - Upserts row for `auth.uid()`: sets `first_login_at` if null, bumps `last_seen_at = now()`, increments `login_count`.
  - Throttled in the function itself: only updates if `last_seen_at < now() - interval '5 minutes'` to avoid write storms.
- RPC `public.get_client_login_summary()` `SECURITY DEFINER` returning `(user_id, full_name, email, role, parent_user_id, last_seen_at, first_login_at, login_count)`:
  - Admin-only check at top, raises if not admin.
  - Returns rows for every user with role `client` or `sub_client`, left-joined to activity. Includes parent linkage from `client_sub_accounts` so the UI can group sub-accounts under their parent.

**2. Client heartbeat**
- In `useAuth` (or `App.tsx` once the session is known), call `supabase.rpc('touch_login_activity')` once per session load and on `SIGNED_IN` auth event. The 5-minute throttle is enforced server-side, so we don't need extra client logic.

**3. UI** (`src/pages/Clients.tsx`)
- Admin-only block (gated by `role === 'admin'`):
  - Fetch via `supabase.rpc('get_client_login_summary')`.
  - Render the three KPI cards and add the **Last seen** column to the existing client table using `formatDistanceToNow` from `date-fns` (already in the project). "Never" badge for null.
  - Filter chip switches the visible row set client-side.
  - Sub-accounts surfaced in a tooltip on the parent's row (Tooltip already imported in this file).

## Out of scope

- No per-page or per-route activity tracking; just session-level "last seen".
- No history graph; only current `last_seen_at` plus login count. Easy to extend later if needed.
- Concierge users are not shown in this report (they're staff, not clients).

## Files touched

- New migration: `user_login_activity` table + 2 RPCs + RLS.
- `src/hooks/useAuth.ts` — fire-and-forget `touch_login_activity` RPC on sign-in.
- `src/pages/Clients.tsx` — admin-only summary card, KPIs, Last seen column, filter chip.
