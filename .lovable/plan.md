

## Fix: Properly Delete Users from Database

### Problem
When you delete a team member or client from the dashboard, the code only removes their row from the `user_roles` table. The user still exists in:
- `auth.users` (Supabase Auth) — this is why you can't re-use their email
- `profiles` table
- `department_members` table (for team members)
- `clinic_team_members` table (for team members)

### Solution
Create a new edge function `delete-user` that uses the Supabase Admin API to fully delete the user from `auth.users`. Since the `profiles` table has `id` referencing `auth.users(id)`, and other tables reference `user_id`, we also clean those up. Then update both Employees and Clients pages to call this function instead of just deleting from `user_roles`.

### Changes

**New file: `supabase/functions/delete-user/index.ts`**
- Verify caller is admin (same pattern as `create-team-member`)
- Accept `{ user_id }` in request body
- Delete from `department_members`, `clinic_team_members`, `user_roles`, `profiles` using service role
- Call `supabaseAdmin.auth.admin.deleteUser(user_id)` to remove from Auth
- Return success/error

**Update: `src/pages/Employees.tsx`**
- Change `confirmDelete` to call `supabase.functions.invoke("delete-user", { body: { user_id: deleteTarget.id } })` instead of just deleting from `user_roles`

**Update: `src/pages/Clients.tsx`**
- Same change to `confirmDelete` — invoke `delete-user` edge function

### Cleanup of Existing Stale Data
After the edge function is deployed, I'll also provide guidance on cleaning up the existing orphaned accounts (emp1, emp2, test, user1-3, etc.) that are already stuck in the database.

### Technical Details
- The edge function uses `SUPABASE_SERVICE_ROLE_KEY` (already configured) to call `auth.admin.deleteUser()`
- Deleting from `auth.users` is the only way to free up the email address
- The function cleans up all related tables before deleting the auth user to avoid foreign key issues

