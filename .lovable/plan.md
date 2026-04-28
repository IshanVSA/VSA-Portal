## Goal

Let **clients** create and manage **sub-accounts** (employees) under their own login. Each sub-account:
- Inherits client-level access, but only to the **clinics the parent client explicitly assigns**.
- Has a **"Hide financials"** toggle that hides spend / cost / CPC / budget data across the app.

Admins and concierges are unaffected.

## Data model (one migration)

### New table `public.client_sub_accounts`
- `id uuid pk`
- `parent_user_id uuid not null` — the client (owner) who created the sub-account
- `sub_user_id uuid not null unique` — the auth user created for the employee
- `hide_financials boolean not null default false`
- `created_at`, `updated_at`

### New table `public.sub_account_clinics`
- `id uuid pk`
- `sub_account_id uuid not null references client_sub_accounts(id) on delete cascade`
- `clinic_id uuid not null`
- `unique (sub_account_id, clinic_id)`

### New `app_role` enum value
- Add `'sub_client'` to `public.app_role` so we can distinguish them from full clients.

### RLS / helper functions
- `public.is_sub_account(_user_id uuid) returns boolean` — security definer.
- `public.get_sub_account_clinic_ids(_user_id uuid) returns setof uuid` — returns clinics assigned to the sub-account's row.
- `public.sub_account_hides_financials(_user_id uuid) returns boolean`.
- `public.get_accessible_clinic_ids(_user_id uuid) returns setof uuid` — unifies: client owns clinics, OR sub-account is assigned clinics. Used by all "client-scoped" RLS that currently checks `owner_user_id = auth.uid()`.
- Update key RLS policies on `clinics`, `analytics`, `content_posts`, `department_tickets`, `sm2_*`, etc. that previously used `owner_user_id = auth.uid()` to also accept `clinic_id IN (SELECT public.get_accessible_clinic_ids(auth.uid()))`. (Same set of tables already enumerated for clients today.)
- `client_sub_accounts` policies: parent client can manage own rows; sub-account can read its own row.
- `sub_account_clinics` policies: parent client can manage rows belonging to their sub-accounts; sub-account can read its own assignments.

## Backend (edge functions)

### New `create-sub-account`
- Auth required; caller must have role `client`.
- Validates email, password ≥ 8, full_name, `clinic_ids[]` (must be subset of caller's owned clinics), `hide_financials` boolean.
- Creates auth user via service role, sets profile, sets `user_roles.role = 'sub_client'`, inserts `client_sub_accounts` row + `sub_account_clinics` rows. Sends Zoho welcome email (reusing existing helper).

### New `delete-sub-account`
- Caller must own the sub-account (`parent_user_id = caller`). Removes auth user + cascades.

### Update `useClinicSelector`
- Replaces the current direct `select * from clinics` with a query that, for `sub_client` role, joins through `sub_account_clinics`. Easiest path: rely on RLS — `select` already returns only the visible clinics. The new RLS for `clinics` will filter automatically.

## Frontend

### New page: **Sub Accounts** (clients only)
- Route `/sub-accounts`, sidebar entry visible only when `role === 'client'`.
- Lists existing sub-accounts: name, email, assigned clinics (chips), "Financials hidden" badge, edit / delete.
- "Add Sub-Account" dialog:
  - Full name, email, password (with strength hint, ≥8 chars).
  - Multi-select chips: only the parent client's clinics.
  - Toggle: "Hide financial data (spend, CPC, budgets)".
- "Edit Sub-Account" dialog: re-assign clinics, toggle financials. (Password reset = "Send reset email" button.)
- Custom AlertDialog for delete (per project standard).

### Role / access wiring
- Extend `AppRole` union in `useUserRole.ts` to include `'sub_client'`.
- Add `useFinancialsVisible()` hook that returns `true` for admin/concierge/client and reads `client_sub_accounts.hide_financials` for sub-accounts (cached via react-query).
- ProtectedRoute & sidebar: treat `sub_client` like `client` for everything except the Sub-Accounts page itself (sub-accounts cannot create more sub-accounts).

### Hiding financial content when `hide_financials = true`
Wrap the following with `useFinancialsVisible()`:
- Google Ads Analytics tab: hide **Total Spend** KPI, **Avg. CPC** KPI, **Daily Ad Spend** chart, "Cost" + "CPC" columns in Campaigns and Search Terms tables.
- Google Ads Overview KPIs in `GoogleAdsDepartment.tsx` (Ad Spend, Avg. CPC).
- Google Ads PDF Reports (`GoogleAdsReportsTab`) — strip cost/CPC columns when generating.
- Any social media "Boost / Ads recommendation" cost mentions (Performance Intelligence card).
- Promotions section pricing fields if present.

Empty-state placeholder where a card is hidden: the row simply collapses (no "redacted" boxes — cleaner UX).

## Edge cases
- A sub-account losing access to all clinics → still logs in but sees an empty-state ("No clinics assigned. Contact your account owner.").
- Parent client deletes their account → cascade deletes `client_sub_accounts` rows; orphaned sub-account auth users are deleted by `delete-sub-account` style cleanup invoked from the existing user-delete flow. (Add to `delete-user` edge function.)
- Existing migration `delete_clinic_by_id` does not need changes — sub-account assignments cascade via FK on `sub_account_clinics.sub_account_id`. We'll also add `ON DELETE CASCADE` on `clinic_id` via a manual cleanup statement (FK to clinics).

## Out of scope
- Granular per-feature permissions beyond the financials toggle (can be added later as additional booleans on `client_sub_accounts`).
- Sub-accounts creating sub-accounts.
