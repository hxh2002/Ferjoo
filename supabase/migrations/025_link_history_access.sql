begin;

-- 025_link_history_access.sql
--
-- 目标：酵种与设备的「关联历史」必须在换绑 / 解绑 / 成员退出后仍然可读、不悬空、不被级联硬删除。
-- 本文件只落地，不在此处执行到线上。
--
-- 背景：device_measurements 只带 device_id，酵种归属靠 starter_device_links 的 [active_from, active_to) 推断。
-- 读测量的 RLS 要求 device_members 成员资格，因此用户退出共享后，即使他自己曾经关联过的时间窗，
-- 直读也会返回空或 42501，看起来像「历史丢失」。
--
-- 包含：
--   (a) unbind_device_member：同一事务内结束该用户在该设备上的活跃关联（+ 兜底触发器，覆盖其他删除成员的路径）。
--   (b) list_linked_measurements：只读 RPC，按 auth.uid() 自己的 link 窗口返回测量。
--   (c) 显式收紧 starters / starter_device_links / care_records 的写权限（保持无 delete），并说明级联风险。

-- ---------------------------------------------------------------------------
-- (a) 解绑成员时结束其活跃关联
-- ---------------------------------------------------------------------------
-- 关闭而不是删除：窗口 [active_from, active_to) 作为历史保留，(b) 的 RPC 依赖它读取历史读数。
-- 与 link_starter_device 使用同一把按账号的 advisory lock，避免「成员已删除但并发又插入新关联」。
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
  v_closed integer := 0;
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

  perform pg_advisory_xact_lock(hashtextextended(v_target::text, 0));

  -- 同一事务内先结束该用户在该设备上的活跃关联，再删除成员行，避免成员已退出而关联仍「悬空」为进行中。
  update public.starter_device_links
     set active_to = greatest(active_from, clock_timestamp())
   where user_id = v_target and device_id = p_device_id and active_to is null;
  get diagnostics v_closed = row_count;

  delete from public.device_members
  where device_id = p_device_id and user_id = v_target;

  return jsonb_build_object('unbound', true, 'links_closed', v_closed);
end;
$$;
revoke all on function public.unbind_device_member(varchar, varchar) from public, anon, authenticated;
grant execute on function public.unbind_device_member(varchar, varchar) to authenticated;

-- 兜底：任何路径删除 device_members 行（管理员直接 SQL、其他 RPC）都同样结束该用户的活跃关联。
-- RPC 已处理时这里是幂等的空操作；设备被级联删除时 links 行本身也会被删除，同样无影响。
create or replace function private.close_links_on_member_removal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.starter_device_links
     set active_to = greatest(active_from, clock_timestamp())
   where user_id = old.user_id and device_id = old.device_id and active_to is null;
  return old;
end;
$$;
revoke all on function private.close_links_on_member_removal() from public, anon, authenticated;

drop trigger if exists device_members_close_links on public.device_members;
create trigger device_members_close_links
  after delete on public.device_members
  for each row execute function private.close_links_on_member_removal();

-- ---------------------------------------------------------------------------
-- (b) 只读通道：按本人关联窗口读取测量
-- ---------------------------------------------------------------------------
-- 安全边界（务必保持）：
--   1. 只放行 auth.uid() 自己的 starter_device_links 行；不接受传入用户 ID，无法读取他人窗口。
--   2. 只返回 device_id 匹配、且 recorded_at 落在该用户某条 link 的 [active_from, active_to) 内的行；
--      窗口之外（换绑空窗期、退出共享之后、别的用户的窗口）的数据一律不返回。
--   3. 仍处于进行中（active_to is null）的窗口要求用户当前仍是 device_members 成员：
--      旧版 unbind_device_member 不处理 links，遗留的「悬空」活跃关联不会因此让已退出的用户继续读到新数据。
--   4. link 只能由 link_starter_device 创建（authenticated 只有 select 授权），且创建时校验设备成员资格，
--      active_from 取服务端时钟，不能被用户回填到成员身份之前。
--   5. 不放宽 device_measurements 的 RLS，也不提供写入；p_limit 上限 1000，用 (recorded_at, id) 键集分页。
--   6. p_starter_id 可选，进一步把窗口限定到某个酵种，避免同一用户不同酵种的窗口互相混入。
-- 已知残留：遗留数据中「已关闭」的窗口若覆盖了用户被移出成员之后、尚未被换绑关闭的一段时间
-- （旧 unbind 不关闭 link 造成），该段读数对该用户可见。需要时由运维按真实移除时间手工收口，见文末注释。
create or replace function public.list_linked_measurements(
  p_device_id text,
  p_from timestamptz,
  p_to timestamptz,
  p_starter_id uuid default null,
  p_after_at timestamptz default null,
  p_after_id bigint default null,
  p_limit integer default 1000
)
returns table (
  id bigint,
  device_id text,
  recorded_at timestamptz,
  temperature_c numeric,
  height_mm numeric,
  height_delta_mm numeric,
  humidity_percent numeric,
  battery_percent numeric,
  mode text,
  sensor_error boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 1000), 1), 1000);
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_device_id is null or p_from is null or p_to is null or p_to <= p_from then
    raise exception 'INVALID_RANGE' using errcode = '22023';
  end if;

  return query
  select m.id, m.device_id::text, m.recorded_at, m.temperature_c::numeric, m.height_mm::numeric,
         m.height_delta_mm::numeric, m.humidity_percent::numeric, m.battery_percent::numeric,
         m.mode::text, m.sensor_error
  from public.device_measurements m
  where m.device_id = p_device_id
    and m.recorded_at >= p_from
    and m.recorded_at <= p_to
    and (p_after_at is null or (m.recorded_at, m.id) > (p_after_at, coalesce(p_after_id, 0)))
    and exists (
      select 1 from public.starter_device_links l
      where l.user_id = v_user_id
        and l.device_id = m.device_id
        and (p_starter_id is null or l.starter_id = p_starter_id)
        and m.recorded_at >= l.active_from
        and (
          (l.active_to is not null and m.recorded_at < l.active_to)
          or (l.active_to is null and exists (
            select 1 from public.device_members dm
            where dm.device_id = l.device_id and dm.user_id = v_user_id
          ))
        )
    )
  order by m.recorded_at, m.id
  limit v_limit;
end;
$$;
revoke all on function public.list_linked_measurements(text, timestamptz, timestamptz, uuid, timestamptz, bigint, integer) from public, anon;
grant execute on function public.list_linked_measurements(text, timestamptz, timestamptz, uuid, timestamptz, bigint, integer) to authenticated;

create index if not exists starter_device_links_user_device_idx
  on public.starter_device_links(user_id, device_id, active_from);

-- ---------------------------------------------------------------------------
-- (c) 关联历史与记录不得被硬删除
-- ---------------------------------------------------------------------------
-- 现状（001/015/018/019）：authenticated 对 starters、care_records、starter_device_links 只有 select / insert，
-- 没有任何 update / delete 授权，也没有 delete 策略；这里显式再收紧一次（幂等，已无授权则为空操作），
-- 防止今后误加授权。starters 被删除会级联清空 care_records、starter_device_links、feed_events 等全部历史。
revoke update, delete, truncate on public.starters from public, anon, authenticated;
revoke update, delete, truncate on public.care_records from public, anon, authenticated;
revoke update, delete, truncate on public.starter_device_links from public, anon, authenticated;
-- 注意（未在此改动）：以下路径仍会级联删除关联历史，属于有意的账号/设备生命周期操作：
--   * auth.users 删除（账号注销）；
--   * devices 行被删除（owner 或管理员的 delete 策略）会级联删除 starter_device_links 与 device_measurements。
--     如需保护，应另行把 starter_device_links.device_id 的外键改为 no action 并评估设备下线流程。
--
-- 运维收口（可选，按需手工执行，不在迁移内自动执行）：
--   旧版 unbind 留下的悬空活跃关联（用户已不是成员但 active_to is null），已在 (b) 中不会放行读取。
--   若知道真实移除时间 T，可：update public.starter_device_links set active_to = T
--     where user_id = :uid and device_id = :dev and active_to is null and active_from <= T;
--   查找悬空关联：
--     select l.* from public.starter_device_links l
--     where l.active_to is null and not exists (
--       select 1 from public.device_members m where m.device_id = l.device_id and m.user_id = l.user_id);

commit;
