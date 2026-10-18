begin;

-- 一轮发酵的业务结束只由“下一次喂养”或用户手动结束决定。
-- 设备缺测、断线、关联结束只影响观测质量，不写入结束记录。
create table public.fermentation_window_closures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  starter_id uuid not null references public.starters(id) on delete cascade,
  feeding_id uuid not null references public.care_records(id) on delete cascade,
  ended_at timestamptz not null,
  reason text not null default 'manual' check (reason = 'manual'),
  detail text check (detail is null or detail in ('fallen', 'no_peak', 'abnormal', 'record_only')),
  created_at timestamptz not null default now(),
  constraint fermentation_window_closures_feeding_unique unique (user_id, feeding_id)
);

create index fermentation_window_closures_starter_idx
  on public.fermentation_window_closures(user_id, starter_id, ended_at desc);

alter table public.fermentation_window_closures enable row level security;
revoke all on public.fermentation_window_closures from public, anon, authenticated;
grant select on public.fermentation_window_closures to authenticated;

create policy fermentation_window_closures_select_own on public.fermentation_window_closures
  for select to authenticated using (user_id = (select auth.uid()));

create function public.close_fermentation_window(
  p_feeding_id uuid,
  p_ended_at timestamptz,
  p_detail text default null
)
returns setof public.fermentation_window_closures
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_feeding public.care_records%rowtype;
  v_next timestamptz;
  v_ended_at timestamptz;
  v_row public.fermentation_window_closures%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_feeding_id is null or p_ended_at is null then
    raise exception 'INVALID_WINDOW_END' using errcode = '22023';
  end if;
  if p_detail is not null and p_detail not in ('fallen', 'no_peak', 'abnormal', 'record_only') then
    raise exception 'INVALID_WINDOW_DETAIL' using errcode = '22023';
  end if;

  select * into v_feeding from public.care_records
    where id = p_feeding_id and user_id = v_user_id and kind = 'feeding';
  if not found then
    raise exception 'FEEDING_NOT_FOUND' using errcode = '42501';
  end if;

  -- 手动结束必须落在本轮之内，并且不能晚于下一次喂养。
  select min(occurred_at) into v_next from public.care_records
    where user_id = v_user_id and starter_id = v_feeding.starter_id and kind = 'feeding'
      and id <> v_feeding.id and occurred_at >= v_feeding.occurred_at and occurred_at <= clock_timestamp();
  v_ended_at := least(p_ended_at, clock_timestamp(), coalesce(v_next, p_ended_at));
  if v_ended_at < v_feeding.occurred_at then
    raise exception 'INVALID_WINDOW_END' using errcode = '22023';
  end if;

  -- 结束是一次性事实：重复请求返回原记录，不覆盖已经归档的时间。
  select * into v_row from public.fermentation_window_closures
    where user_id = v_user_id and feeding_id = v_feeding.id;
  if found then
    return next v_row;
    return;
  end if;

  insert into public.fermentation_window_closures(user_id, starter_id, feeding_id, ended_at, reason, detail)
  values (v_user_id, v_feeding.starter_id, v_feeding.id, v_ended_at, 'manual', p_detail)
  on conflict (user_id, feeding_id) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.fermentation_window_closures
      where user_id = v_user_id and feeding_id = v_feeding.id;
  end if;
  return next v_row;
end;
$$;

revoke all on function public.close_fermentation_window(uuid, timestamptz, text) from public, anon;
grant execute on function public.close_fermentation_window(uuid, timestamptz, text) to authenticated;

commit;
