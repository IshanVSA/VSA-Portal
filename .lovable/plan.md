## Goal
Eliminate the separate Clients section. Everything lives under **Clinics**, and creating a clinic requires picking or creating a client owner in the same dialog.

## 1. Nav & routing
- Remove the "Clients" item from the sidebar (`DashboardLayout`).
- Delete the `/clients` route from `App.tsx` and redirect `/clients` → `/clinics` for any bookmarks.
- Delete `src/pages/Clients.tsx` after its still-useful pieces are absorbed (below).

## 2. Clinics page becomes the single hub
Turn `src/pages/Clinics.tsx` into a tabbed page (admin only sees the tabs; concierge keeps the current single view):

- **Tab 1 — Clinics** (default): the existing table, unchanged.
- **Tab 2 — Client Accounts**: absorbs everything currently on `/clients` that isn't duplicated — login activity metrics, "Last seen" list, welcome-email status/resend, edit name, delete client, Partnerships dialog. This keeps admin tooling intact without a separate top-level page.

No feature loss; just relocated.

## 3. "Add Clinic" dialog — client becomes mandatory
Rework the Add Clinic dialog in `Clinics.tsx` so a client owner is required before the clinic can be saved. Replace the current optional "Client Owner" select with a required block:

```text
Client Owner *
( ) Assign existing client   [ searchable dropdown of clients ]
( ) Create new client        Full name*  Email*  Password*
```

- Radio toggles which sub-form is active; the inactive one is ignored.
- Save flow:
  1. If "new client": call the existing `create-team-member` edge function with `role: "client"` and capture the new `user_id`. Surface duplicate-email errors inline (same pattern as sub-accounts).
  2. Insert the clinic with `owner_user_id` set to that user (existing or newly created).
  3. If step 2 fails after creating a new user, show a clear toast; do not attempt to delete the user (kept simple, matches current app behavior).
- Save button stays disabled until: website OK, clinic name present, AND either an existing client is selected or the new-client fields pass the same Zod schema currently used in `Clients.tsx` (`full_name`, `email`, `password ≥ 8`).
- "Extract from Website" button behavior is unchanged.

## 4. Client edit / delete / partnerships
Reachable from the new **Client Accounts** tab (Tab 2). No inline client editing added to the Clinics table itself — keeps that table readable.

## 5. Docs / memory
Update `mem://features/admin/client-login-activity` and the clinic-management memory to reflect: Clients page merged into Clinics; Add Clinic requires a client owner.

## Technical notes
- Files touched: `src/pages/Clinics.tsx` (major), `src/App.tsx` (route removal + redirect), `src/components/DashboardLayout.tsx` (nav item removal), `src/pages/Clients.tsx` (deleted — logic split into a new `src/components/clinics/ClientAccountsTab.tsx` extracted from the current page).
- No DB migration needed — `clinics.owner_user_id` already exists and is already how ownership works; we're just enforcing it at the UI layer.
- RLS unchanged.
- Sub-accounts flow (`/sub-accounts`) is untouched.

## Out of scope
- Backfilling `owner_user_id` for existing clinics that don't have one (they keep working; requirement only applies to new clinics).
- Changing what a "client" can see/do.
