begin;

create table public.feed_events (
  id uuid primary key default gen_random_uuid(),
  care_record_id uuid not null unique references public.care_records(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  starter_id uuid not null references public.starters(id) on delete cascade,
  fed_at timestamptz not null,
  ratio text not null,
  baseline_height_mm numeric(10,2) check (baseline_height_mm > 0),
  baseline_source text check (baseline_source in ('device', 'manual')),
  created_at timestamptz not null default now()
);
create index feed_events_starter_fed_idx on public.feed_events(user_id, starter_id, fed_at desc);
alter table public.feed_events enable row level security;
revoke all on public.feed_events from public, anon, authenticated;
grant select on public.feed_events to authenticated;
create policy feed_events_select_own on public.feed_events
  for select to authenticated using (user_id = (select auth.uid()));

-- A feeding and its baseline are one immutable transaction, including RPC retries.
create function public.create_feeding_event()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.kind = 'feeding' then
    if not exists (select 1 from public.starters s where s.id = new.starter_id and s.user_id = new.user_id) then
      raise exception 'STARTER_NOT_FOUND' using errcode = '42501';
    end if;
    insert into public.feed_events(care_record_id, user_id, starter_id, fed_at, ratio, baseline_height_mm, baseline_source)
    values (new.id, new.user_id, new.starter_id, new.occurred_at, new.ratio,
      nullif(new.input->>'baseline_height_mm', '')::numeric,
      nullif(new.input->>'baseline_source', ''));
  end if;
  return new;
end;
$$;
revoke all on function public.create_feeding_event() from public, anon, authenticated;
create trigger care_record_feeding_event after insert on public.care_records
  for each row execute function public.create_feeding_event();

insert into public.feed_events(care_record_id, user_id, starter_id, fed_at, ratio, baseline_height_mm, baseline_source)
select r.id, r.user_id, r.starter_id, r.occurred_at, r.ratio,
  nullif(r.input->>'baseline_height_mm', '')::numeric, nullif(r.input->>'baseline_source', '')
from public.care_records r join public.starters s on s.id = r.starter_id and s.user_id = r.user_id
where r.kind = 'feeding'
on conflict (care_record_id) do nothing;

commit;
