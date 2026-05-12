## Goal
Show the "Locked" badge on department items in the left sidebar for **admin** users when the currently selected clinic has that department disabled — matching what clients already see. Admin navigation remains unaffected (admins can still click in).

## Change
Single edit in `src/components/DashboardLayout.tsx`, function `isDepartmentLocked` (around line 335):

- Remove the early `if (role === "admin") return false;` short-circuit so the lock state is computed for admins too.
- Keep the rest of the logic identical — it already reads from `clinicAccess` (the per-clinic flags loaded for the active clinic in the selector), so switching clinics in the global selector already re-evaluates lock state reactively.

That's all that's needed: the existing render already paints the `Lock` icon (collapsed) and the "Locked" pill (expanded) whenever `locked` is true, regardless of role. The `Link` `to=` is not gated on role, so admins keep full access.

## Out of scope
- No change to client behavior (still locked + can't navigate via DepartmentAccessLocked screen).
- No change to AI SEO default semantics — `ai_seo_enabled` defaults to false, so admins will correctly see AI SEO as locked until enabled per clinic (mirrors the client view and the existing `AdminServiceLockNotice` shown on the page).
- No backend / RLS changes.