begin;

-- 027_archive_starters.sql
--
-- 与 025 / 026 的关系：
--   * 025 保护「关联历史」的读取通道（list_linked_measurements）并收紧 starters / care_records /
--     starter_device_links 的写权限，物理删除必然失败；
--   * 026 允许一台设备同时关联多个酵种，只结束当前酵种自己的窗口；
--   * 本文件把「删除酵种」改成软删除（归档）。starters 始终没有 delete 授权 / delete 策略，
--     而物理删除会级联清空 care_records、feed_events、starter_device_links —— 历史不可恢复。
--     归档只写 archived_at，不动任何历史行，因此归档后历史仍可读（025 的窗口口径继续生效）。
--
-- 约定：归档是幂等的；已归档再调用不报错，返回同样的历史信息。
-- 归档时同一事务内关闭该酵种仍活跃的设备关联（窗口转为已关闭），避免已归档酵种继续占用设备时段。

alter table public.starters
  add column if not exists archived_at timestamptz;

comment on column public.starters.archived_at is
  '软删除时间。非空表示已归档：不出现在酵种列表 / 可关联列表 / 设备首页，但历史记录与关联窗口全部保留。';

-- 列表默认只读未归档酵种；部分索引让该过滤保持廉价。
create index if not exists starters_active_user_idx
  on public.starters(user_id, created_at desc)
  where archived_at is null;

-- ---------------------------------------------------------------------------
-- 归档 RPC
-- ---------------------------------------------------------------------------
-- 安全边界：
--   1. security definer，但只接受 p_starter_id，用户身份只取 auth.uid()，无法归档他人酵种；
--   2. 与 025 / 026 使用同一把按账号的 advisory lock，归档与换绑串行，避免「归档时又插入新关联」；
--   3. 幂等：已归档直接返回 already_archived = true，不重复写 archived_at、不重复关闭窗口；
--   4. 不删除任何行：care_records / feed_events / starter_device_links 全部保留，
--      归档后历史仍按 025 的 [active_from, active_to) 窗口可读。
create or replace function public.archive_starter(p_starter_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_archived_at timestamptz;
  v_has_records boolean := false;
  v_has_links boolean := false;
  v_closed integer := 0;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_starter_id is null then
    raise exception 'INVALID_STARTER' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select s.archived_at into v_archived_at
  from public.starters s
  where s.id = p_starter_id and s.user_id = v_user_id;

  if not found then
    raise exception 'STARTER_NOT_FOUND' using errcode = '42501';
  end if;

  -- 历史存在性在归档前后都成立：无历史也可以归档（返回 has_* = false）。
  select exists (select 1 from public.care_records r where r.starter_id = p_starter_id)
    into v_has_records;
  select exists (select 1 from public.starter_device_links l where l.starter_id = p_starter_id)
    into v_has_links;

  if v_archived_at is null then
    -- 先关闭活跃窗口：窗口本身保留为历史，025 的只读 RPC 仍能读出这段读数。
    update public.starter_device_links
       set active_to = greatest(active_from, clock_timestamp())
     where starter_id = p_starter_id and user_id = v_user_id and active_to is null;
    get diagnostics v_closed = row_count;

    update public.starters
       set archived_at = clock_timestamp()
     where id = p_starter_id and user_id = v_user_id and archived_at is null;
  end if;

  return jsonb_build_object(
    'archived', true,
    'already_archived', v_archived_at is not null,
    'has_records', v_has_records,
    'has_links', v_has_links,
    'links_closed', v_closed
  );
end;
$$;
revoke all on function public.archive_starter(uuid) from public, anon, authenticated;
grant execute on function public.archive_starter(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 已归档酵种不得再建立新关联
-- ---------------------------------------------------------------------------
-- 026 的函数体在此原样保留，只加 archived_at is null 条件：归档酵种不能再占用设备时段，
-- 但已有关联窗口与读数不受影响。发现归档时抛出 STARTER_ARCHIVED（前端映射为可读文案）。
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
  if not exists (
    select 1 from public.starters
    where id = p_starter_id and user_id = v_user_id and archived_at is null
  ) then
    if exists (select 1 from public.starters where id = p_starter_id and user_id = v_user_id) then
      raise exception 'STARTER_ARCHIVED' using errcode = '42501';
    end if;
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

-- ---------------------------------------------------------------------------
-- 读取口径
-- ---------------------------------------------------------------------------
-- 已归档只影响「选择器」：starters 列表（应用层默认 is archived_at null）、可关联酵种、设备首页。
-- 历史读取刻意保留：
--   * list_linked_measurements（025）不按 archived_at 过滤，归档酵种的已关闭窗口仍按原口径可读；
--   * care_records / feed_events 不设 archived 字段，历史记录天然保留；
--   * 归档只会把活跃窗口关闭，不会删除窗口，因此不存在「归档后历史消失」的路径。
revoke update, delete, truncate on public.starters from public, anon, authenticated;

commit;
