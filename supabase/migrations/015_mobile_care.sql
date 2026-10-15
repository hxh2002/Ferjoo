begin;

create table public.starters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);

create index starters_user_created_idx on public.starters(user_id, created_at desc);
alter table public.starters enable row level security;
revoke all on public.starters from anon, authenticated;
grant select, insert on public.starters to authenticated;
create policy starters_select_own on public.starters
  for select to authenticated using (user_id = (select auth.uid()));
create policy starters_insert_own on public.starters
  for insert to authenticated with check (user_id = (select auth.uid()));

create table public.care_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  request_id uuid not null,
  starter_id uuid not null references public.starters(id) on delete cascade,
  kind text not null check (kind in ('feeding', 'observation')),
  occurred_at timestamptz not null,
  input jsonb not null default '{}'::jsonb check (jsonb_typeof(input) = 'object'),
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  ratio text,
  created_at timestamptz not null default now(),
  constraint care_records_user_request_unique unique (user_id, request_id),
  constraint care_records_kind_fields check (
    (kind = 'feeding' and ratio is not null and char_length(btrim(ratio)) between 1 and 80)
    or (kind = 'observation' and ratio is null)
  )
);

create index care_records_user_occurred_idx on public.care_records(user_id, occurred_at desc);
create index care_records_user_starter_occurred_idx on public.care_records(user_id, starter_id, occurred_at desc);
alter table public.care_records enable row level security;
revoke all on public.care_records from anon, authenticated;
grant select, insert on public.care_records to authenticated;

create policy care_records_select_own on public.care_records
  for select to authenticated using (user_id = (select auth.uid()));
create policy care_records_insert_own on public.care_records
  for insert to authenticated with check (user_id = (select auth.uid()));

create or replace function public.save_care_record(
  p_request_id uuid,
  p_starter_id uuid,
  p_kind text,
  p_occurred_at timestamptz,
  p_input jsonb,
  p_result jsonb,
  p_ratio text default null
)
returns setof public.care_records
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_record public.care_records%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_request_id is null or p_starter_id is null or p_occurred_at is null
     or p_kind not in ('feeding', 'observation')
     or p_input is null or jsonb_typeof(p_input) <> 'object'
     or p_result is null or jsonb_typeof(p_result) <> 'object'
     or (p_kind = 'feeding' and (p_ratio is null or char_length(btrim(p_ratio)) not between 1 and 80))
     or (p_kind = 'observation' and p_ratio is not null) then
    raise exception 'INVALID_CARE_RECORD' using errcode = '22023';
  end if;
  if not exists (select 1 from public.starters s where s.id = p_starter_id and s.user_id = v_user_id) then
    raise exception 'STARTER_NOT_FOUND' using errcode = '42501';
  end if;

  insert into public.care_records(user_id, request_id, starter_id, kind, occurred_at, input, result, ratio)
  values (v_user_id, p_request_id, p_starter_id, p_kind, p_occurred_at, p_input, p_result, p_ratio)
  on conflict (user_id, request_id) do nothing;

  select * into v_record from public.care_records r
  where r.user_id = v_user_id and r.request_id = p_request_id;
  if v_record.starter_id <> p_starter_id or v_record.kind <> p_kind
     or v_record.occurred_at <> p_occurred_at or v_record.input <> p_input
     or v_record.result <> p_result or v_record.ratio is distinct from p_ratio then
    raise exception 'REQUEST_ID_CONFLICT' using errcode = '23505';
  end if;
  return next v_record;
end;
$$;

revoke all on function public.save_care_record(uuid, uuid, text, timestamptz, jsonb, jsonb, text) from public, anon;
grant execute on function public.save_care_record(uuid, uuid, text, timestamptz, jsonb, jsonb, text) to authenticated;

commit;
