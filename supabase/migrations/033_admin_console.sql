begin;

-- 033 · 桌面后台
--
-- 权限沿用 profiles.role（U 用户 / A 管理员），不另建账号表。
-- 首位管理员是 role = A 且 is_super_admin 的账号：
--   * 迁移时，若还没有首位管理员，取最早的 A 账号；
--   * 之后通过 private.set_user_role 提升为 A 时，如果当时还没有首位管理员，该账号自动成为首位管理员；
--   * 转移：select private.designate_super_admin('email@example.com'); （仅数据库管理员，不授予网页）
-- 首位管理员可以任命其他管理员、手工建号。普通管理员只能查阅和做日常运营（例如改设备名称），
-- 不能任命管理员，也不能建号。网页调用的函数都会先检查调用者，隐藏按钮不是权限边界。

alter table public.profiles
  add column if not exists is_super_admin boolean not null default false;

comment on column public.profiles.is_super_admin is
  '首位管理员。与 role=A 同时成立才能任命管理员和手工建号。普通管理员保持 false。';

create index if not exists profiles_super_admin_idx
  on public.profiles(id)
  where is_super_admin;

update public.profiles as target
set is_super_admin = true
where target.role = 'A'
  and not exists (select 1 from public.profiles as existing where existing.is_super_admin)
  and target.id = (
    select earliest.id
    from public.profiles as earliest
    where earliest.role = 'A'
    order by earliest.created_at asc, earliest.id asc
    limit 1
  );

create or replace function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'A'
      and is_super_admin
  );
$$;

revoke all on function private.is_super_admin() from public, anon, authenticated;

-- 提升为 A 时，若全库还没有首位管理员，则该账号成为首位管理员。降为 U 时去掉该标记。
create or replace function private.set_user_role(p_user_id uuid, p_role public.user_role)
returns varchar
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_system_user_id varchar;
  v_current boolean;
begin
  if p_role not in ('U', 'A') then
    raise exception 'INVALID_ROLE' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(83427501);

  select is_super_admin into v_current
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'UNKNOWN_USER' using errcode = '22023';
  end if;

  v_system_user_id := private.allocate_system_user_id(p_role);

  update public.profiles
  set role = p_role,
      system_user_id = v_system_user_id,
      invite_quota = case when p_role = 'A' then greatest(invite_quota, 100) else invite_quota end,
      is_super_admin = case
        when p_role <> 'A' then false
        when v_current then true
        when not exists (select 1 from public.profiles as other where other.is_super_admin) then true
        else false
      end,
      updated_at = now()
  where id = p_user_id;

  return v_system_user_id;
end;
$$;

revoke all on function private.set_user_role(uuid, public.user_role) from public, anon, authenticated;

create or replace function private.designate_super_admin(p_email text)
returns varchar
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_id uuid;
  v_role public.user_role;
  v_system_user_id varchar;
begin
  perform pg_advisory_xact_lock(83427501);

  select id, role, system_user_id
    into v_id, v_role, v_system_user_id
  from public.profiles
  where lower(email) = lower(btrim(coalesce(p_email, '')));

  if v_id is null then
    raise exception 'UNKNOWN_USER' using errcode = '22023';
  end if;

  if v_role <> 'A' then
    v_system_user_id := private.set_user_role(v_id, 'A');
  end if;

  update public.profiles
  set is_super_admin = (id = v_id),
      updated_at = now()
  where is_super_admin or id = v_id;

  return v_system_user_id;
end;
$$;

revoke all on function private.designate_super_admin(text) from public, anon, authenticated;

-- 手工建号走同一条 auth.users 触发器。created_by_admin 只有当前会话确实是首位管理员时才放行，
-- 普通注册即使自行塞入这个标记也会被拒绝，仍然必须使用邀请码。
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_role public.user_role := 'U';
  v_created_by_admin boolean := coalesce(new.raw_user_meta_data ->> 'created_by_admin', '') = '1';
  v_invite_code varchar := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')), '');
  v_inviter_id uuid;
  v_display_name varchar := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
begin
  if char_length(coalesce(v_display_name, '')) > 80 then
    raise exception 'INVALID_NAME' using errcode = '22023';
  end if;

  if v_created_by_admin then
    if not private.is_super_admin() then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;

    insert into public.profiles(
      id, system_user_id, role, email, display_name,
      invite_code, invited_by, invite_quota, invited_count
    )
    values (
      new.id,
      private.allocate_system_user_id(v_role),
      v_role,
      coalesce(new.email, ''),
      v_display_name,
      private.generate_invite_code(),
      auth.uid(),
      1,
      0
    );
    return new;
  end if;

  if v_invite_code is null then
    raise exception 'REGISTRATION_REQUIRES_INVITE';
  end if;

  select p.id into v_inviter_id
  from public.profiles p
  where p.invite_code = v_invite_code
  for update of p;

  if v_inviter_id is null then
    raise exception 'INVALID_INVITE_CODE';
  end if;

  update public.profiles
  set invited_count = invited_count + 1
  where id = v_inviter_id
    and invited_count < invite_quota;

  if not found then
    raise exception 'INVITE_QUOTA_EXCEEDED';
  end if;

  insert into public.profiles(
    id, system_user_id, role, email, display_name,
    invite_code, invited_by, invite_quota, invited_count
  )
  values (
    new.id,
    private.allocate_system_user_id(v_role),
    v_role,
    coalesce(new.email, ''),
    v_display_name,
    private.generate_invite_code(),
    v_inviter_id,
    1,
    0
  );
  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

create or replace function public.admin_set_role(p_user_id uuid, p_role public.user_role)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_target public.profiles%rowtype;
  v_system_user_id varchar;
begin
  if v_actor is null or not private.is_super_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_role not in ('U', 'A') then
    raise exception 'INVALID_ROLE' using errcode = '22023';
  end if;
  if p_user_id is null or p_user_id = v_actor then
    raise exception 'CANNOT_CHANGE_SELF' using errcode = '42501';
  end if;

  select * into v_target
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'UNKNOWN_USER' using errcode = '22023';
  end if;
  if v_target.is_super_admin then
    raise exception 'CANNOT_CHANGE_SUPER_ADMIN' using errcode = '42501';
  end if;
  if v_target.role = p_role then
    return jsonb_build_object(
      'id', v_target.id,
      'role', v_target.role,
      'system_user_id', v_target.system_user_id,
      'is_super_admin', v_target.is_super_admin,
      'unchanged', true
    );
  end if;

  v_system_user_id := private.set_user_role(p_user_id, p_role);
  return jsonb_build_object(
    'id', p_user_id,
    'role', p_role,
    'system_user_id', v_system_user_id,
    'is_super_admin', false,
    'unchanged', false
  );
end;
$$;

revoke all on function public.admin_set_role(uuid, public.user_role) from public, anon;
grant execute on function public.admin_set_role(uuid, public.user_role) to authenticated;

-- 写入 auth.users / auth.identities，触发上面的注册函数。不新建用户表，也不把初始密码写进 profiles。
create or replace function public.admin_create_account(
  p_email text,
  p_password text,
  p_display_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth, extensions, pg_temp
as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_instance uuid;
  v_system_user_id varchar;
begin
  if auth.uid() is null or not private.is_super_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(v_email) > 320 then
    raise exception 'INVALID_EMAIL' using errcode = '22023';
  end if;
  if p_password is null or char_length(p_password) < 6 or char_length(p_password) > 72 then
    raise exception 'INVALID_PASSWORD' using errcode = '22023';
  end if;
  if v_name is not null and char_length(v_name) > 80 then
    raise exception 'INVALID_NAME' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'EMAIL_TAKEN' using errcode = '23505';
  end if;

  select instance_id into v_instance from auth.users limit 1;
  if v_instance is null then
    v_instance := '00000000-0000-0000-0000-000000000000';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    v_instance,
    v_id,
    'authenticated',
    'authenticated',
    v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', v_name, 'created_by_admin', '1'),
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, created_at, updated_at
  ) values (
    gen_random_uuid(),
    v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email',
    v_id::text,
    now(),
    now()
  );

  select system_user_id into v_system_user_id from public.profiles where id = v_id;
  if v_system_user_id is null then
    raise exception 'PROFILE_NOT_CREATED' using errcode = '23503';
  end if;

  return jsonb_build_object(
    'id', v_id,
    'email', v_email,
    'display_name', v_name,
    'system_user_id', v_system_user_id,
    'role', 'U'
  );
exception
  when unique_violation then
    raise exception 'EMAIL_TAKEN' using errcode = '23505';
end;
$$;

revoke all on function public.admin_create_account(text, text, text) from public, anon;
grant execute on function public.admin_create_account(text, text, text) to authenticated;

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not private.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'users', (select count(*)::int from public.profiles),
    'admins', (select count(*)::int from public.profiles where role = 'A'),
    'devices', (select count(*)::int from public.devices),
    'devices_online', (
      select count(*)::int from public.devices
      where last_seen_at >= now() - interval '40 minutes'
    ),
    'bindings', (select count(*)::int from public.device_members),
    'starter_links', (
      select count(*)::int from public.starter_device_links where active_to is null
    ),
    'active_rounds', (
      with feedings as (
        select
          lead(f.id) over (partition by f.user_id, f.starter_id order by f.occurred_at, f.id) as next_id,
          c.id as closure_id
        from public.care_records f
        left join public.fermentation_window_closures c on c.feeding_id = f.id
        where f.kind = 'feeding'
      )
      select count(*)::int from feedings where next_id is null and closure_id is null
    ),
    'starters', (select count(*)::int from public.starters where archived_at is null),
    'feedback', (select count(*)::int from public.user_feedback)
  );
end;
$$;

revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;

create or replace function public.admin_list_rounds(
  p_query text default '',
  p_status text default 'all',
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_like text;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_status text := coalesce(p_status, 'all');
  v_result jsonb;
begin
  if not private.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_status not in ('all', 'active', 'closed') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;

  v_like := '%' || replace(replace(replace(v_query, chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') || '%';

  with feedings as (
    select
      f.id,
      f.user_id,
      f.starter_id,
      f.occurred_at,
      f.ratio,
      f.created_at,
      f.input ->> 'baseline_height_mm' as baseline_height_mm,
      f.input ->> 'baseline_source' as baseline_source,
      lead(f.occurred_at) over (partition by f.user_id, f.starter_id order by f.occurred_at, f.id) as next_feeding_at,
      c.ended_at,
      c.reason,
      c.detail
    from public.care_records f
    left join public.fermentation_window_closures c on c.feeding_id = f.id
    where f.kind = 'feeding'
  ),
  joined as (
    select
      feedings.id,
      feedings.user_id,
      feedings.starter_id,
      feedings.occurred_at,
      feedings.ratio,
      feedings.created_at,
      feedings.baseline_height_mm,
      feedings.baseline_source,
      feedings.next_feeding_at,
      feedings.ended_at,
      feedings.reason,
      feedings.detail,
      p.system_user_id,
      p.display_name,
      p.email,
      s.name as starter_name,
      s.archived_at as starter_archived_at,
      case
        when feedings.ended_at is not null or feedings.next_feeding_at is not null then 'closed'
        else 'active'
      end as status
    from feedings
    join public.profiles p on p.id = feedings.user_id
    join public.starters s on s.id = feedings.starter_id
    where (
      v_query = ''
      or p.email ilike v_like escape E'\\'
      or coalesce(p.display_name, '') ilike v_like escape E'\\'
      or p.system_user_id ilike v_like escape E'\\'
      or s.name ilike v_like escape E'\\'
      or feedings.id::text = v_query
    )
    and (
      v_status = 'all'
      or (v_status = 'active' and feedings.ended_at is null and feedings.next_feeding_at is null)
      or (v_status = 'closed' and (feedings.ended_at is not null or feedings.next_feeding_at is not null))
    )
  )
  select jsonb_build_object(
    'total', (select count(*)::int from joined),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(page) order by page.occurred_at desc, page.id desc)
      from (
        select *
        from joined
        order by occurred_at desc, id desc
        offset v_offset
        limit v_limit
      ) page
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_list_rounds(text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_rounds(text, text, integer, integer) to authenticated;

create or replace function public.admin_get_round(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_row jsonb;
  v_starter uuid;
  v_occurred timestamptz;
  v_device jsonb;
  v_observations jsonb;
begin
  if not private.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  with feedings as (
    select
      f.id,
      f.user_id,
      f.starter_id,
      f.occurred_at,
      f.ratio,
      f.created_at,
      f.input,
      lead(f.occurred_at) over (partition by f.user_id, f.starter_id order by f.occurred_at, f.id) as next_feeding_at,
      c.ended_at,
      c.reason,
      c.detail
    from public.care_records f
    left join public.fermentation_window_closures c on c.feeding_id = f.id
    where f.kind = 'feeding'
      and f.user_id = (select user_id from public.care_records where id = p_id)
      and f.starter_id = (select starter_id from public.care_records where id = p_id)
  )
  select to_jsonb(joined), joined.starter_id, joined.occurred_at
    into v_row, v_starter, v_occurred
  from (
    select
      feedings.id,
      feedings.user_id,
      feedings.starter_id,
      feedings.occurred_at,
      feedings.ratio,
      feedings.created_at,
      feedings.next_feeding_at,
      feedings.ended_at,
      feedings.reason,
      feedings.detail,
      feedings.input ->> 'baseline_height_mm' as baseline_height_mm,
      feedings.input ->> 'baseline_source' as baseline_source,
      p.system_user_id,
      p.display_name,
      p.email,
      s.name as starter_name,
      s.archived_at as starter_archived_at
    from feedings
    join public.profiles p on p.id = feedings.user_id
    join public.starters s on s.id = feedings.starter_id
    where feedings.id = p_id
  ) joined;

  if v_row is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  select jsonb_build_object('device_id', link.device_id, 'name', device.name)
    into v_device
  from public.starter_device_links link
  left join public.devices device on device.device_id = link.device_id
  where link.starter_id = v_starter
    and link.active_from <= v_occurred
    and (link.active_to is null or link.active_to > v_occurred)
  order by link.active_from desc
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', observation.id,
    'occurred_at', observation.occurred_at,
    'title', coalesce(observation.result ->> 'title', '诊断结果')
  ) order by observation.occurred_at desc), '[]'::jsonb)
    into v_observations
  from public.care_records observation
  where observation.kind = 'observation'
    and observation.input ->> 'feedingId' = p_id::text;

  return v_row || jsonb_build_object(
    'device', v_device,
    'observations', v_observations
  );
end;
$$;

revoke all on function public.admin_get_round(uuid) from public, anon;
grant execute on function public.admin_get_round(uuid) to authenticated;

-- 管理员可以查阅运营需要的跨账号记录。写权限不放开：发酵结束、解绑仍走原来的用户函数。
drop policy if exists starters_select_admin on public.starters;
create policy starters_select_admin on public.starters
  for select to authenticated using (private.is_admin());
drop policy if exists care_records_select_admin on public.care_records;
create policy care_records_select_admin on public.care_records
  for select to authenticated using (private.is_admin());
drop policy if exists starter_device_links_select_admin on public.starter_device_links;
create policy starter_device_links_select_admin on public.starter_device_links
  for select to authenticated using (private.is_admin());
drop policy if exists fermentation_window_closures_select_admin on public.fermentation_window_closures;
create policy fermentation_window_closures_select_admin on public.fermentation_window_closures
  for select to authenticated using (private.is_admin());
drop policy if exists user_feedback_select_admin on public.user_feedback;
create policy user_feedback_select_admin on public.user_feedback
  for select to authenticated using (private.is_admin());

-- 浏览器只能改设备名称，不能改上传密钥或绑定码。
revoke update on table public.devices from authenticated;
grant update (name) on table public.devices to authenticated;

commit;
