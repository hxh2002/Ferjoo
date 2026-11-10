begin;

-- 028_history_delete_guard.sql
--
-- 与 025 / 026 / 027 的关系：
--   * 025 收紧 starters / care_records / starter_device_links 的 update / delete 授权，并给出只读的
--     list_linked_measurements；
--   * 026 允许一台设备关联多个酵种；
--   * 027 用 starters.archived_at 把「删除酵种」换成归档，历史行一条不删；
--   * 本文件堵住剩下的级联删除路径：即使有人（管理员、service_role、未来的新接口）
--     真的去 delete devices / starters / auth.users，也必须失败，而不是静默清空历史。
--
-- 现状核查（依据 supabase/migrations/ 下的真实定义，不是猜的名字）：
--   * device_measurements.device_id → devices(device_id)：003 的显式命名约束 device_measurements_device_fk，
--     on delete cascade（001 的 device_measurements_device_owner_fk 已在 003 被 drop）。
--   * starter_device_links 三列在 019 内联定义，Postgres 自动命名为
--     starter_device_links_starter_id_fkey / _device_id_fkey / _user_id_fkey，全部 on delete cascade。
--   * starters.user_id、care_records.user_id / starter_id 在 015 内联定义，自动命名为
--     starters_user_id_fkey / care_records_user_id_fkey / care_records_starter_id_fkey，全部 on delete cascade。
--   * feed_events 三列在 018 内联定义，自动命名 feed_events_*_fkey，全部 on delete cascade。
-- 为免依赖自动命名的稳定性，下面用一个 helper 在运行时按 pg_constraint 反查「该列上真实存在的外键」并逐个 drop，
-- 再用显式名字 add constraint：重复执行安全，名字与真实库一致（不会 drop 到不存在的东西却不报错）。
create or replace function private.force_fk_on_delete_restrict(
  p_table regclass,
  p_column name,
  p_ref_table regclass,
  p_ref_column name,
  p_constraint name
)
returns void
language plpgsql
set search_path = public, private, pg_temp
as $$
declare
  v_attnum smallint;
  v_name name;
begin
  select a.attnum into v_attnum
  from pg_attribute a
  where a.attrelid = p_table and a.attname = p_column and not a.attisdropped;

  if v_attnum is null then
    raise exception 'COLUMN_NOT_FOUND: %.%', p_table, p_column;
  end if;

  -- 真实库上该列指向同一张表的全部外键（可能只有一个，也可能历史上重建过）。
  for v_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = p_table
      and c.contype = 'f'
      and c.confrelid = p_ref_table
      and v_attnum = any (c.conkey)
  loop
    execute format('alter table %s drop constraint %I', p_table, v_name);
  end loop;

  execute format('alter table %s drop constraint if exists %I', p_table, p_constraint);
  execute format(
    'alter table %s add constraint %I foreign key (%I) references %s(%I) on delete restrict',
    p_table, p_constraint, p_column, p_ref_table, p_ref_column
  );
end;
$$;
revoke all on function private.force_fk_on_delete_restrict(regclass, name, regclass, name, name) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 历史外键：级联删除 → restrict
-- ---------------------------------------------------------------------------
-- 设备下线 / 账号注销现在会明确失败，而不是带走读数、关联窗口与喂养记录。
-- 执行注意：add constraint 默认会校验存量数据并对被引用表加 SHARE ROW EXCLUSIVE 锁，
-- device_measurements 较大时请在低峰期执行；本迁移没有 NOT VALID，存量数据必须自洽
-- （悬空关联先按 025 末尾的查询收口），校验失败会整体回滚，不会留下半套约束。
select private.force_fk_on_delete_restrict(
  'public.device_measurements'::regclass, 'device_id',
  'public.devices'::regclass, 'device_id',
  'device_measurements_device_fk_restrict'
);

select private.force_fk_on_delete_restrict(
  'public.starter_device_links'::regclass, 'device_id',
  'public.devices'::regclass, 'device_id',
  'starter_device_links_device_id_fkey_restrict'
);

select private.force_fk_on_delete_restrict(
  'public.starter_device_links'::regclass, 'starter_id',
  'public.starters'::regclass, 'id',
  'starter_device_links_starter_id_fkey_restrict'
);

select private.force_fk_on_delete_restrict(
  'public.starter_device_links'::regclass, 'user_id',
  'auth.users'::regclass, 'id',
  'starter_device_links_user_id_fkey_restrict'
);

select private.force_fk_on_delete_restrict(
  'public.care_records'::regclass, 'starter_id',
  'public.starters'::regclass, 'id',
  'care_records_starter_id_fkey_restrict'
);

select private.force_fk_on_delete_restrict(
  'public.care_records'::regclass, 'user_id',
  'auth.users'::regclass, 'id',
  'care_records_user_id_fkey_restrict'
);

select private.force_fk_on_delete_restrict(
  'public.starters'::regclass, 'user_id',
  'auth.users'::regclass, 'id',
  'starters_user_id_fkey_restrict'
);

select private.force_fk_on_delete_restrict(
  'public.feed_events'::regclass, 'starter_id',
  'public.starters'::regclass, 'id',
  'feed_events_starter_id_fkey_restrict'
);

select private.force_fk_on_delete_restrict(
  'public.feed_events'::regclass, 'user_id',
  'auth.users'::regclass, 'id',
  'feed_events_user_id_fkey_restrict'
);

-- ---------------------------------------------------------------------------
-- 设备物理删除：前端与普通用户都不得再触发
-- ---------------------------------------------------------------------------
-- 001 曾把 select / insert / update / delete 一并授予 authenticated；003 只收回了 insert。
-- 这里收回 delete：保留 service_role（运维下线设备时先归档 / 打标记，再按需物理清理）。
-- 003 的 devices_delete_owner_or_admin 策略刻意保留不 drop，仅在注释里说明它已对普通用户失效
-- （策略管「允许删哪些行」，权限管「能不能发 delete」，后者缺失时策略不会生效）。
revoke delete, truncate on public.devices from public, anon, authenticated;
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'devices' and policyname = 'devices_delete_owner_or_admin'
  ) then
    execute $c$comment on policy devices_delete_owner_or_admin on public.devices is
      '保留历史策略名称，不再生效：authenticated 已于 028 收回 delete 权限，物理删除仅 service_role 可执行；即便执行也会被 028 的 restrict 外键阻止（设备有采样或关联历史时）。'$c$;
  end if;
end;
$$;

-- 设备下线能力（本轮不新增前端入口，仅记录边界）：
--   * 前端没有任何删除设备的入口，成员只能「解除绑定」自己（unbind_device_member，保留历史窗口）；
--   * 所有者 / 管理员即便直接调 API，也因 delete 权限被收回而失败；
--   * service_role 可先写 devices.metadata 标记下线（或停用绑定码），物理删除会因
--     device_measurements.device_id / starter_device_links.device_id 的 restrict 而失败 —— 这是有意为之。
--
-- 账号注销（本轮不实现，仅说明）：
--   * starters.user_id、care_records.user_id、starter_device_links.user_id 均为 restrict，
--     feed_events.user_id 同样 restrict，因此 delete from auth.users 会直接报外键错误，不会清空历史；
--   * 需要单独的匿名化流程（把用户标识替换为匿名占位、保留时间序列与聚合结论），必须走显式审批的
--     service_role 脚本，而不是普通的账号删除接口。
--
-- 悬空关联收口：仍按 025 末尾的查询与手工 SQL 执行，本文件不重复、也不自动修改任何历史窗口。

-- helper 只服务于本迁移，避免长期暴露在建库 schema 里。
drop function private.force_fk_on_delete_restrict(regclass, name, regclass, name, name);

commit;
