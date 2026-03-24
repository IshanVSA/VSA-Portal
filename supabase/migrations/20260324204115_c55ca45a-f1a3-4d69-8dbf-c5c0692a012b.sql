
-- Security definer function to check department membership
create or replace function public.is_department_member(_user_id uuid, _department department_type)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.department_members
    where user_id = _user_id and department = _department
  )
$$;

-- Create department_chats table
create table public.department_chats (
  id uuid primary key default gen_random_uuid(),
  department public.department_type not null,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid not null,
  message text not null,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.department_chats enable row level security;

-- SELECT policy: admin or concierge department member
create policy "Admins and dept members can view chats"
on public.department_chats for select to authenticated
using (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    public.has_role(auth.uid(), 'concierge'::app_role)
    AND public.is_department_member(auth.uid(), department)
  )
);

-- INSERT policy: same + user_id must match
create policy "Admins and dept members can insert chats"
on public.department_chats for insert to authenticated
with check (
  user_id = auth.uid()
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'concierge'::app_role)
      AND public.is_department_member(auth.uid(), department)
    )
  )
);

-- Enable realtime
alter publication supabase_realtime add table public.department_chats;
