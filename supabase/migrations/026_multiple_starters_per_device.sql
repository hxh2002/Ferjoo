begin;

-- 一台设备可同时关联多个酵种；一个酵种仍只能有一个活跃设备关联。
-- 存量关联与历史窗口保持不变，只移除设备维度的排他约束。
drop index if exists public.one_active_link_per_account_device;

create or replace function public.link_starter_device(p_starter_id uuid, p_device_id text default null)
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
  -- 串行化同一账号的关联变更；不同酵种可以共享同一台设备。
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
  -- 换绑/取消只结束当前酵种自己的窗口，不能影响同设备的其他酵种。
  update public.starter_device_links set active_to = v_now
    where user_id = v_user_id and starter_id = p_starter_id and active_to is null;
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
