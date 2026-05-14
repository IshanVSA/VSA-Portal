## Goal

Scope the notification bell and the dashboard "Recent Activity" feed for staff team members (concierges) to the department they belong to. Admins continue to see everything. Clients are unaffected. A Website ticket created with "Promote on Social Media: Yes" should still appear for a Social Media team member, because the existing fan-out trigger already creates a `social_media` assignment row for it.

## Current behaviour (the bug)

Simar's `profiles.team_role` is "Social & Concierge", which maps to the `social_media` department. But:

- `NotificationBell` fetches the latest 15 rows from `department_tickets` with no department filter, so it shows Website / SEO / Google Ads tickets too.
- `RecentActivity` fetches 40 tickets, 40 chats, blog/GBP/promotion/clinic events and lets the user see them all. The component-level `filter.department` only kicks in when the admin dashboard passes a filter — concierges don't.

That is why the Avon "Pop-up Offer" (a Website ticket) shows up in Simar's bell and her recent-activity feed, even though it has nothing to do with social media.

## Approach

Introduce a single source of truth for "which department(s) does this staff user belong to" and use it to filter both feeds. Reuse the existing fan-out signal — `department_ticket_assignments` — so the "Promote on Social Media: Yes" exception keeps working automatically.

### 1. New hook: `useUserDepartments`

`src/hooks/useUserDepartments.ts`

- For `role === "admin"` → returns `{ departments: null, isAllAccess: true }` (no filtering).
- For `role === "client" / "sub_client"` → returns `null` (these feeds already have their own client-specific filtering, no change).
- For `role === "concierge"` → reads `profiles.team_role` of the current user and maps to one or more `department_type` values, using the same mapping the DB triggers use:

  ```
  Developer, Maintenance               → website
  SEO Lead                             → seo
  Ads Strategist, Ads Analyst          → google_ads
  Social & Concierge, Meta Ads Spec.   → social_media
  ```

  Result: `{ departments: ["social_media"], isAllAccess: false }`.

A small in-memory cache keyed by `user.id` keeps it cheap.

### 2. Tickets: use fan-out assignments, not just `department`

For both feeds, when filtering tickets for a non-admin staff user, the visible set is:

```
ticket.department ∈ user.departments
  OR
  ticket.id has a row in department_ticket_assignments where department ∈ user.departments
```

The second branch is what makes "Website ticket + Promote on Social Media: Yes" appear for Simar (the trigger writes a `social_media` row), while a plain Website ticket without that flag does not.

Implementation: in each feed, after fetching tickets, also query

```ts
supabase
  .from("department_ticket_assignments")
  .select("ticket_id, department")
  .in("ticket_id", ticketIds)
  .in("department", userDepartments)
```

and keep tickets that either match directly or appear in that result.

### 3. `NotificationBell` changes

`src/components/notifications/NotificationBell.tsx`

- Call `useUserDepartments()`.
- For staff (non-admin, non-client):
  - Filter the `department_tickets` result through the rule above.
  - Apply the same filter to the realtime `INSERT` / `UPDATE` handlers on `department_tickets`. For inserts we can't see the assignments row yet (race with the trigger); use a short `select(...)` on `department_ticket_assignments` for the new ticket id, falling back to the ticket's own `department`.
  - SM2 events (`sm2_generations`, `sm2_posts.client_feedback`) and `post_activity_log` are inherently social-media-domain — only include them if `social_media ∈ user.departments`.
- Admins: behaviour unchanged.
- Clients: behaviour unchanged.

### 4. `RecentActivity` changes

`src/components/dashboard/RecentActivity.tsx`

- Call `useUserDepartments()`.
- After building the unified list, before the existing `.slice(0, 25)`, drop any item whose `department` is not in the user's set, with these specifics:
  - Tickets: use the fan-out-aware rule (direct match OR assignment row).
  - Chats: filter by chat `department`.
  - Blog / GBP: only kept if `seo ∈ user.departments`.
  - SM2 generation / Promotions / Content posts / Content requests / Post comments: only kept if `social_media ∈ user.departments`.
  - Clinic created: kept for everyone (it's not department-bound).
- Admins skip this filter entirely.

### 5. Out of scope

- No database / RLS changes. The recently-tightened `department_tickets` RLS for concierges stays as-is; this is purely a presentation filter for two staff-facing feeds.
- No change to the actual department pages (Website / SEO / Social Media tabs) — they already scope tickets by department.
- No change to client notifications.

## Files touched

- `src/hooks/useUserDepartments.ts` (new)
- `src/components/notifications/NotificationBell.tsx`
- `src/components/dashboard/RecentActivity.tsx`

## Verification

- Log in as Simar (concierge, team_role "Social & Concierge"):
  - Bell shows only social_media tickets and any Website ticket with "Promote on Social Media: Yes" (e.g. it would surface as a social_media notification).
  - Recent Activity hides Website / SEO / Google Ads items; keeps social posts, SM2, promotions, social chats, and the cross-posted Website ticket.
- Log in as an admin → both feeds look exactly the same as today.
- Log in as a client → both feeds look exactly the same as today.