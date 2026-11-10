begin;

-- 自动结束：last-peak 触发后设备连续 2 小时无读数，客户端按读数判定并归档结束时刻。
-- reason 区分结束来源：'manual' = 用户点击结束，'auto' = 系统自动结束。
-- 与手动结束共用同一张表和唯一约束：一轮只会有一条结束事实，先写入者生效。
alter table public.fermentation_window_closures
  drop constraint if exists fermentation_window_closures_reason_check;
alter table public.fermentation_window_closures
  add constraint fermentation_window_closures_reason_check check (reason in ('manual', 'auto'));

create function public.auto_close_fermentation_window(
  p_feeding_id uuid,
  p_ended_at timestamptz
)
returns setof public.fermentation_window_closures
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_feeding public.care_records%rowtype;
  v_next timestamptz;
  v_row public.fermentation_window_closures%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_feeding_id is null or p_ended_at is null then
    raise exception 'INVALID_WINDOW_END' using errcode = '22023';
  end if;

  select * into v_feeding from public.care_records
    where id = p_feeding_id and user_id = v_user_id and kind = 'feeding';
  if not found then
    raise exception 'FEEDING_NOT_FOUND' using errcode = '42501';
  end if;

  -- 已有结束事实（手动或自动）时原样返回，不覆盖。
  select * into v_row from public.fermentation_window_closures
    where user_id = v_user_id and feeding_id = v_feeding.id;
  if found then
    return next v_row;
    return;
  end if;

  -- 自动结束必须落在本轮之内、不晚于下一次喂养，并且距今至少 2 小时（数据缺口成立的最低条件）。
  select min(occurred_at) into v_next from public.care_records
    where user_id = v_user_id and starter_id = v_feeding.starter_id and kind = 'feeding'
      and id <> v_feeding.id and occurred_at >= v_feeding.occurred_at and occurred_at <= clock_timestamp();
  if p_ended_at < v_feeding.occurred_at
    or p_ended_at > clock_timestamp() - interval '2 hours'
    or (v_next is not null and p_ended_at > v_next) then
    raise exception 'INVALID_WINDOW_END' using errcode = '22023';
  end if;

  insert into public.fermentation_window_closures(user_id, starter_id, feeding_id, ended_at, reason, detail)
  values (v_user_id, v_feeding.starter_id, v_feeding.id, p_ended_at, 'auto', null)
  on conflict (user_id, feeding_id) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.fermentation_window_closures
      where user_id = v_user_id and feeding_id = v_feeding.id;
  end if;
  return next v_row;
end;
$$;

revoke all on function public.auto_close_fermentation_window(uuid, timestamptz) from public, anon;
grant execute on function public.auto_close_fermentation_window(uuid, timestamptz) to authenticated;

commit;
