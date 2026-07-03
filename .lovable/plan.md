## Goal
Let the same sub-account email be attached to different parent clients (e.g. Parent A gives access to Clinic X, Parent B gives access to Clinic Y — one login, two owners, two clinics). Today a UNIQUE constraint on `client_sub_accounts.sub_user_id` blocks this.

## 1. Database migration
- Drop `client_sub_accounts_sub_user_id_key` (unique on `sub_user_id`).
- Add composite unique `(parent_user_id, sub_user_id)` — a given sub-account can only be linked to a parent once, but can be linked to many parents.
- Update three security-definer helpers that currently assume one row per sub-user:
  - `is_sub_account(_user_id)` — already uses `EXISTS`, no change.
  - `get_sub_account_clinic_ids(_user_id)` — already unions across all rows via the join, no change.
  - `sub_account_hides_financials(_user_id)` — currently `LIMIT 1`. Change to return `true` if **any** of the user's sub-account rows has `hide_financials = true` (safer default: if any owner asked to hide, hide).
- No RLS policy changes needed — existing policies already scope by `parent_user_id` per row.

## 2. `create-sub-account` edge function
Extend the current "email exists" branch:
- If the existing user is already a sub-account of the **same** parent → merge new clinics into that row (current behavior, unchanged).
- If the existing user is a sub-account of a **different** parent (or not yet a sub-account at all but not a top-level client) → insert a new `client_sub_accounts` row for `(this parent, existing sub_user_id)` with the requested `hide_financials`, then insert the clinic assignments. Skip auth-user creation (it already exists) and skip the welcome email (they've already onboarded).
- If the existing user is a top-level `client` or `admin` → still reject with `email_in_use` (won't demote a real client into someone else's sub-account).

Return `{ merged: true, linked_new_parent: true|false, added_clinic_ids }` so the UI can show the right toast.

## 3. `delete-sub-account` edge function
Currently deletes the auth user unconditionally. Change to:
- Delete the `sub_account_clinics` rows and the one `client_sub_accounts` row being targeted.
- Only delete the `user_roles` entry and the auth user if this was that sub-user's **last** `client_sub_accounts` row (i.e. no other parent still links to them). Otherwise leave the login intact so the other parent's access keeps working.

## 4. UI (`SubAccounts.tsx`)
- The listing already groups per `client_sub_accounts` row, so a sub-account with two parents naturally shows up twice (once per parent) with each parent's clinic set. That's the desired view — no code change needed.
- Adjust the create-flow toast copy to cover the new "linked to a new parent" case.
- Keep the existing `email_in_use` inline error for the true collision case (email belongs to an admin/top-level client).

## Out of scope
- Merging identity across parents in the UI (e.g. "this login has 2 parents" badge). Can add later if useful.
- Per-parent password reset flows.

## Technical notes
Files touched:
- New migration: drop old unique, add composite unique, update `sub_account_hides_financials`.
- `supabase/functions/create-sub-account/index.ts` — extend existing-email branch.
- `supabase/functions/delete-sub-account/index.ts` — conditional auth-user deletion.
- `src/pages/SubAccounts.tsx` — toast copy only.
