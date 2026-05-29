create table if not exists public.tracking_events (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    text not null,
  event_type   text not null check (event_type in ('session_start', 'cta_click')),
  cta_type     text check (cta_type in (
                 'book_appointment','find_us','call_us','new_client_form','email_contact'
               )),
  channel      text not null default 'direct'
               check (channel in ('organic','paid','direct','social','referral','email')),
  source       text,
  landing_page text,
  page_path    text,
  session_id   text,
  created_at   timestamptz not null default now()
);

grant select on public.tracking_events to authenticated;
grant all on public.tracking_events to service_role;

create index if not exists idx_tracking_clinic_date
  on public.tracking_events (clinic_id, created_at desc);
create index if not exists idx_tracking_channel
  on public.tracking_events (channel, event_type);

alter table public.tracking_events enable row level security;

drop policy if exists "portal users can read" on public.tracking_events;
create policy "portal users can read"
  on public.tracking_events for select to authenticated using (true);

create or replace view public.cta_daily as
select
  clinic_id,
  date_trunc('day', created_at)::date                  as day,
  channel,
  count(*) filter (where event_type = 'session_start') as sessions,
  count(*) filter (where cta_type = 'book_appointment') as book_appointment,
  count(*) filter (where cta_type = 'find_us')          as find_us,
  count(*) filter (where cta_type = 'call_us')          as call_us,
  count(*) filter (where cta_type = 'new_client_form')  as new_client_form,
  count(*) filter (where cta_type = 'email_contact')    as email_contact,
  count(*) filter (where event_type = 'cta_click')      as total_ctas
from public.tracking_events
group by clinic_id, day, channel;

grant select on public.cta_daily to authenticated;