

## Department Chat Thread — Admin & Assigned Team Members Only

### Summary

Add a persistent, Slack-like chat thread to each department page (Website, SEO, Google Ads, Social Media). Messages are scoped per department + clinic combination. Only admins and team members assigned to that department for the selected clinic can see and use the chat. Clients never see it.

### Database

**New table: `department_chats`**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default gen_random_uuid() |
| department | department (enum) | website, seo, google_ads, social_media |
| clinic_id | uuid | FK to clinics |
| user_id | uuid | sender, FK to auth.users |
| message | text | not null |
| created_at | timestamptz | default now() |

**RLS policies:**
- SELECT: admin OR (concierge AND user is in `department_members` for this department)
- INSERT: same check, plus `user_id = auth.uid()`
- No UPDATE/DELETE (immutable messages)

The SELECT/INSERT policies will use a security definer function to check department membership:

```sql
create or replace function public.is_department_member(_user_id uuid, _department department)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.department_members
    where user_id = _user_id and department = _department
  )
$$;
```

Policy logic: `has_role(auth.uid(), 'admin') OR (has_role(auth.uid(), 'concierge') AND is_department_member(auth.uid(), department))`

**Enable Realtime** on `department_chats` so messages appear instantly.

### New Component: `DepartmentChat.tsx`

**Location:** `src/components/department/DepartmentChat.tsx`

**Props:** `{ department: string; clinicId: string | undefined }`

**Behavior:**
- Fetches messages from `department_chats` filtered by department + clinic_id, ordered by created_at ascending
- Subscribes to Supabase Realtime for new inserts on the same filter
- Shows sender name (joined from profiles), timestamp, and message text
- Input field at the bottom to send a new message
- Scrolls to bottom on new messages
- Compact card UI with a `MessageSquare` icon header — "Team Chat"
- Shows user avatars/initials, message bubbles (own messages right-aligned, others left-aligned)

### Integration into Department Pages

In each of the 4 department pages, after the `Tabs` component (inside the unlocked content area):

1. Import `useUserRole` (already imported in most) and `DepartmentChat`
2. Only render `<DepartmentChat>` if `role === "admin" || role === "concierge"` — clients never see it
3. Pass `department` and `clinicId={selectedClinicId}`

**Files modified:**
- `src/pages/WebsiteDepartment.tsx` — add chat below tabs
- `src/pages/SeoDepartment.tsx` — add chat below tabs
- `src/pages/GoogleAdsDepartment.tsx` — add chat below tabs
- `src/pages/SocialMedia.tsx` — add chat below tabs

### Technical Details

- Uses `supabase.channel()` realtime subscription with postgres_changes filter on `department_chats` for the specific department + clinic_id
- Messages join profiles table for sender name display via a separate query or by fetching profiles of participants
- The component handles its own loading/empty states
- No edge function needed — direct client SDK insert with RLS enforcement

