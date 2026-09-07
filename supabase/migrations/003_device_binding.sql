begin;

create table if not exists public.device_members (
  device_id varchar(80) not null references public.devices(device_id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role varchar(10) not null default 'member',
  created_at timestamptz not null default now(),
  primary key (device_id, user_id),
  constraint device_members_role_check check (role in ('owner', 'member'))
);

insert into public.device_members (device_id, user_id, role)
select device_id, user_id, 'owner'
from public.devices
where user_id is not null
on conflict (device_id, user_id) do nothing;

drop view if exists public.device_latest_measurements;

drop trigger if exists device_measurements_touch_device on public.device_measurements;
drop function if exists private.touch_device_last_seen();

drop policy if exists devices_select_own_or_admin on public.devices;
drop policy if exists devices_insert_own_or_admin on public.devices;
drop policy if exists devices_update_own_or_admin on public.devices;
drop policy if exists devices_delete_own_or_admin on public.devices;

drop policy if exists measurements_select_own_or_admin on public.device_measurements;
drop policy if exists measurements_insert_own_or_admin on public.device_measurements;

drop index if exists public.devices_user_id_idx;
drop index if exists public.device_measurements_user_time_idx;

alter table public.device_measurements
  drop constraint if exists device_measurements_device_owner_fk;

alter table public.device_measurements
  drop column if exists user_id;

alter table public.devices
  drop constraint if exists devices_device_owner_unique;

alter table public.devices
  drop column if exists user_id;

alter table public.device_measurements
  add constraint device_measurements_device_fk
  foreign key (device_id) references public.devices(device_id) on delete cascade;

create index if not exists device_members_user_idx
  on public.device_members(user_id);

create index if not exists device_members_device_idx
  on public.device_members(device_id);

create or replace function private.touch_device_last_seen()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.devices
  set last_seen_at = greatest(coalesce(last_seen_at, new.recorded_at), new.recorded_at)
  where device_id = new.device_id;
  return new;
end;
$$;

create trigger device_measurements_touch_device
after insert on public.device_measurements
for each row execute function private.touch_device_last_seen();

alter table public.device_members enable row level security;

revoke all on table public.device_members from anon, authenticated;
grant select on table public.device_members to authenticated;

drop policy if exists device_members_select_own_or_admin on public.device_members;
create policy device_members_select_own_or_admin
on public.device_members for select
to authenticated
using (user_id = auth.uid() or private.is_admin());

revoke insert on table public.devices from authenticated;

drop policy if exists devices_select_member_or_admin on public.devices;
create policy devices_select_member_or_admin
on public.devices for select
to authenticated
using (
  private.is_admin()
  or exists (
    select 1 from public.device_members m
    where m.device_id = devices.device_id and m.user_id = auth.uid()
  )
);

drop policy if exists devices_update_owner_or_admin on public.devices;
create policy devices_update_owner_or_admin
on public.devices for update
to authenticated
using (
  private.is_admin()
  or exists (
    select 1 from public.device_members m
    where m.device_id = devices.device_id and m.user_id = auth.uid() and m.role = 'owner'
  )
)
with check (
  private.is_admin()
  or exists (
    select 1 from public.device_members m
    where m.device_id = devices.device_id and m.user_id = auth.uid() and m.role = 'owner'
  )
);

drop policy if exists devices_delete_owner_or_admin on public.devices;
create policy devices_delete_owner_or_admin
on public.devices for delete
to authenticated
using (
  private.is_admin()
  or exists (
    select 1 from public.device_members m
    where m.device_id = devices.device_id and m.user_id = auth.uid() and m.role = 'owner'
  )
);

drop policy if exists measurements_select_member_or_admin on public.device_measurements;
create policy measurements_select_member_or_admin
on public.device_measurements for select
to authenticated
using (
  private.is_admin()
  or exists (
    select 1 from public.device_members m
    where m.device_id = device_measurements.device_id and m.user_id = auth.uid()
  )
);

drop policy if exists measurements_insert_member_or_admin on public.device_measurements;
create policy measurements_insert_member_or_admin
on public.device_measurements for insert
to authenticated
with check (
  private.is_admin()
  or exists (
    select 1 from public.device_members m
    where m.device_id = device_measurements.device_id and m.user_id = auth.uid()
  )
);

create or replace function public.create_device(
  p_name varchar default null,
  p_device_id varchar default null,
  p_model varchar default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_device_id varchar;
  v_api_key text;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  v_device_id := coalesce(
    nullif(trim(p_device_id), ''),
    'dev_' || encode(extensions.gen_random_bytes(8), 'hex')
  );
  v_api_key := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.devices (device_id, name, model, api_key_hash)
  values (
    v_device_id,
    nullif(trim(p_name), ''),
    nullif(trim(p_model), ''),
    private.hash_api_key(v_api_key)
  );

  insert into public.device_members (device_id, user_id, role)
  values (v_device_id, v_user_id, 'owner');

  return jsonb_build_object(
    'device_id', v_device_id,
    'api_key', v_api_key
  );
end;
$$;

create or replace function public.ingest_device_measurements(
  p_device_id varchar,
  p_api_key text,
  p_measurements jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_count integer := 0;
begin
  if p_measurements is null or jsonb_typeof(p_measurements) <> 'array' then
    raise exception 'INVALID_MEASUREMENTS';
  end if;

  if not exists (
    select 1 from public.devices d
    where d.device_id = p_device_id
      and d.api_key_hash = private.hash_api_key(p_api_key)
  ) then
    raise exception 'INVALID_DEVICE_CREDENTIALS' using errcode = '42501';
  end if;

  with incoming as (
    select
      p_device_id as device_id,
      coalesce(r.recorded_at, now()) as recorded_at,
      r.temperature_c,
      r.height_mm,
      r.height_delta_mm,
      r.humidity_percent,
      r.battery_percent,
      coalesce(r.payload, '{}'::jsonb) as payload
    from jsonb_to_recordset(p_measurements) as r(
      recorded_at timestamptz,
      temperature_c numeric,
      height_mm numeric,
      height_delta_mm numeric,
      humidity_percent numeric,
      battery_percent numeric,
      payload jsonb
    )
  )
  insert into public.device_measurements (
    device_id, recorded_at,
    temperature_c, height_mm, height_delta_mm,
    humidity_percent, battery_percent, payload
  )
  select
    device_id, recorded_at,
    temperature_c, height_mm, height_delta_mm,
    humidity_percent, battery_percent, payload
  from incoming
  on conflict (device_id, bucket_start) do update set
    recorded_at = excluded.recorded_at,
    temperature_c = excluded.temperature_c,
    height_mm = excluded.height_mm,
    height_delta_mm = excluded.height_delta_mm,
    humidity_percent = excluded.humidity_percent,
    battery_percent = excluded.battery_percent,
    payload = excluded.payload;

  get diagnostics v_count = row_count;

  update public.devices
  set last_seen_at = greatest(coalesce(last_seen_at, now()), now())
  where device_id = p_device_id;

  return jsonb_build_object('written', v_count);
end;
$$;

create or replace function public.bind_device_member(
  p_device_id varchar,
  p_system_user_id varchar
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_target uuid;
begin
  if v_caller is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select id into v_target
  from public.profiles
  where system_user_id = p_system_user_id;

  if v_target is null then
    raise exception 'USER_NOT_FOUND';
  end if;

  if not private.is_admin() and not exists (
    select 1 from public.device_members m
    where m.device_id = p_device_id and m.user_id = v_caller and m.role = 'owner'
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.device_members (device_id, user_id, role)
  values (p_device_id, v_target, 'member')
  on conflict (device_id, user_id) do nothing;

  return jsonb_build_object('bound', true);
end;
$$;

create or replace function public.unbind_device_member(
  p_device_id varchar,
  p_system_user_id varchar
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_target uuid;
  v_target_role varchar;
begin
  if v_caller is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select id into v_target
  from public.profiles
  where system_user_id = p_system_user_id;

  if v_target is null then
    raise exception 'USER_NOT_FOUND';
  end if;

  select role into v_target_role
  from public.device_members
  where device_id = p_device_id and user_id = v_target;

  if v_target_role = 'owner' then
    raise exception 'CANNOT_UNBIND_OWNER';
  end if;

  if not private.is_admin()
     and v_target <> v_caller
     and not exists (
       select 1 from public.device_members m
       where m.device_id = p_device_id and m.user_id = v_caller and m.role = 'owner'
     ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  delete from public.device_members
  where device_id = p_device_id and user_id = v_target;

  return jsonb_build_object('unbound', true);
end;
$$;

create or replace function public.list_device_members(p_device_id varchar)
returns table(system_user_id varchar, member_role varchar, created_at timestamptz)
language sql
security definer
set search_path = public, private, pg_temp
as $$
  select p.system_user_id, m.role, m.created_at
  from public.device_members m
  join public.profiles p on p.id = m.user_id
  where m.device_id = p_device_id
    and (
      private.is_admin()
      or exists (
        select 1 from public.device_members own
        where own.device_id = p_device_id and own.user_id = auth.uid() and own.role = 'owner'
      )
    )
    and (private.is_admin() or p.role <> 'A')
  order by m.created_at;
$$;

create or replace view public.device_latest_measurements
with (security_invoker = true)
as
select distinct on (device_id)
  device_id,
  bucket_start,
  recorded_at,
  temperature_c,
  height_mm,
  height_delta_mm,
  humidity_percent,
  battery_percent
from public.device_measurements
order by device_id, bucket_start desc;

revoke all on table public.device_latest_measurements from anon, authenticated;
grant select on table public.device_latest_measurements to authenticated;

revoke all on function public.bind_device_member(varchar, varchar) from public, anon, authenticated;
grant execute on function public.bind_device_member(varchar, varchar) to authenticated;

revoke all on function public.unbind_device_member(varchar, varchar) from public, anon, authenticated;
grant execute on function public.unbind_device_member(varchar, varchar) to authenticated;

revoke all on function public.list_device_members(varchar) from public, anon, authenticated;
grant execute on function public.list_device_members(varchar) to authenticated;

commit;
