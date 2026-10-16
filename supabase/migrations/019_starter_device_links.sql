begin;

create table public.starter_device_links (
  id uuid primary key default gen_random_uuid(),
  starter_id uuid not null references public.starters(id) on delete cascade,
  device_id text not null references public.devices(device_id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  active_from timestamptz not null default now(),
  active_to timestamptz,
  created_at timestamptz not null default now(),
  constraint starter_device_link_period check (active_to is null or active_to >= active_from)
);
-- NULL values are distinct in an ordinary unique constraint: use partial indexes.
create unique index one_active_link_per_starter on public.starter_device_links(starter_id) where active_to is null;
create unique index one_active_link_per_account_device on public.starter_device_links(user_id, device_id) where active_to is null;
create index starter_device_links_history_idx on public.starter_device_links(user_id, starter_id, active_from desc);
alter table public.starter_device_links enable row level security;
revoke all on public.starter_device_links from public, anon, authenticated;
grant select on public.starter_device_links to authenticated;
create policy starter_device_links_select_own on public.starter_device_links
  for select to authenticated using (user_id = (select auth.uid()));

create function public.link_starter_device(p_starter_id uuid, p_device_id text default null)
returns setof public.starter_device_links
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz;
  v_current public.starter_device_links%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  -- Serialize switches for one account, including switches between two starters.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  if not exists (select 1 from public.starters where id = p_starter_id and user_id = v_user_id) then
    raise exception 'STARTER_NOT_FOUND' using errcode = '42501';
  end if;
  if p_device_id is not null and not exists (
    select 1 from public.device_members where device_id = p_device_id and user_id = v_user_id
  ) then
    raise exception 'DEVICE_MEMBERSHIP_REQUIRED' using errcode = '42501';
  end if;
  select * into v_current from public.starter_device_links
    where starter_id = p_starter_id and user_id = v_user_id and active_to is null;
  if v_current.device_id = p_device_id then
    return next v_current;
    return;
  end if;
  v_now := clock_timestamp();
  update public.starter_device_links set active_to = v_now
    where user_id = v_user_id and active_to is null
      and (starter_id = p_starter_id or device_id = p_device_id);
  if p_device_id is not null then
    insert into public.starter_device_links(starter_id, device_id, user_id, active_from)
      values (p_starter_id, p_device_id, v_user_id, v_now) returning * into v_current;
    return next v_current;
  end if;
end;
$$;
revoke all on function public.link_starter_device(uuid, text) from public, anon;
grant execute on function public.link_starter_device(uuid, text) to authenticated;

commit;
