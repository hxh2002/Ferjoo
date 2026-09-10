begin;

-- ============================================================================
-- 004 · 邀请码 + 个人资料
--
-- 1. profiles 新增：
--    - invite_code     8 位数字邀请码（存量用户迁移后补发，新用户注册时生成）
--    - invited_by      邀请人（注册时消耗谁的邀请码）
--    - invite_quota    可邀请人数上限（存量用户与管理员 100，被邀请新用户默认 1）
--    - invited_count   已邀请人数
--    - gender / birth_date / profile_identity / avatar_url  个人资料
-- 2. 新用户注册只允许携带有效邀请码（auth.users 触发器强制校验）。
-- 3. 头像存储桶 avatars（public 读，写按 user_id 目录隔离）。
-- ============================================================================

-- ---------- profiles 扩展字段 ----------
alter table public.profiles
  add column if not exists invite_code varchar(8),
  add column if not exists invited_by uuid references public.profiles(id) on delete set null,
  add column if not exists invite_quota integer not null default 1,
  add column if not exists invited_count integer not null default 0,
  add column if not exists gender varchar(10),
  add column if not exists birth_date date,
  add column if not exists profile_identity varchar(20),
  add column if not exists avatar_url text;

alter table public.profiles
  drop constraint if exists profiles_invite_code_format;
alter table public.profiles
  add constraint profiles_invite_code_format check (invite_code is null or invite_code ~ '^[0-9]{8}$');

alter table public.profiles
  drop constraint if exists profiles_invite_quota_nonneg;
alter table public.profiles
  add constraint profiles_invite_quota_nonneg check (invite_quota >= 0);

alter table public.profiles
  drop constraint if exists profiles_invited_count_within_quota;
alter table public.profiles
  add constraint profiles_invited_count_within_quota check (invited_count >= 0 and invited_count <= invite_quota);

alter table public.profiles
  drop constraint if exists profiles_gender_values;
alter table public.profiles
  add constraint profiles_gender_values check (gender is null or gender in ('male', 'female', 'other', 'secret'));

alter table public.profiles
  drop constraint if exists profiles_identity_values;
alter table public.profiles
  add constraint profiles_identity_values check (
    profile_identity is null or profile_identity in ('secondary', 'college', 'graduate', 'working', 'other')
  );

create unique index if not exists profiles_invite_code_key
  on public.profiles(invite_code)
  where invite_code is not null;

create index if not exists profiles_invited_by_idx
  on public.profiles(invited_by);

-- ---------- 邀请码生成器 ----------
create or replace function private.generate_invite_code()
returns varchar
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_code varchar(8);
begin
  loop
    v_code := lpad(floor(random() * 100000000)::bigint::text, 8, '0');
    exit when not exists (select 1 from public.profiles p where p.invite_code = v_code);
  end loop;
  return v_code;
end;
$$;

-- ---------- 存量用户补发邀请码，可邀请上限 100 ----------
do $$
declare
  r record;
begin
  for r in
    select p.id
    from public.profiles p
    where p.invite_code is null
  loop
    update public.profiles
    set invite_code = private.generate_invite_code(),
        invite_quota = 100,
        invited_count = coalesce(invited_count, 0)
    where id = r.id;
  end loop;
end
$$;

-- 保险：任何现存管理员（含已提升为 A 的用户）都保证 100
update public.profiles
set invite_quota = 100
where role = 'A' and invite_quota < 100;

-- ---------- 注册触发器：强制校验邀请码并原子扣减 ----------
-- 客户端注册需在 metadata 中携带 invite_code（supabase.auth.signUp options.data）。
-- 数据库内直接插入/管理员后台建号同样受此约束；如确需绕过，可携带有效邀请码。
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_role public.user_role := 'U';
  v_invite_code varchar := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')), '');
  v_inviter_id uuid;
begin
  if v_invite_code is null then
    raise exception 'REGISTRATION_REQUIRES_INVITE';
  end if;

  -- 行锁串行化并发注册，防止同一个邀请码超额被使用
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
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    private.generate_invite_code(),
    v_inviter_id,
    1,
    0
  );
  return new;
end;
$$;

-- ---------- 角色提升时给管理员 100 配额 ----------
create or replace function private.set_user_role(p_user_id uuid, p_role public.user_role)
returns varchar
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_system_user_id varchar;
begin
  v_system_user_id := private.allocate_system_user_id(p_role);

  update public.profiles
  set role = p_role,
      system_user_id = v_system_user_id,
      invite_quota = case when p_role = 'A' then greatest(invite_quota, 100) else invite_quota end,
      updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'Unknown user %', p_user_id;
  end if;

  return v_system_user_id;
end;
$$;

-- ---------- 用户可编辑列（邀请码/配额/计数只允许服务端与数据库管理员修改） ----------
grant update (display_name, gender, birth_date, profile_identity, avatar_url)
  on table public.profiles to authenticated;

-- ---------- 头像存储桶 ----------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read
on storage.objects for select
to public
using (bucket_id = 'avatars');

drop policy if exists avatars_owner_insert on storage.objects;
create policy avatars_owner_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists avatars_owner_update on storage.objects;
create policy avatars_owner_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists avatars_owner_delete on storage.objects;
create policy avatars_owner_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ---------- 权限收口 ----------
revoke all on function private.generate_invite_code() from public, anon, authenticated;
revoke all on function private.handle_new_auth_user() from public, anon, authenticated;
revoke all on function private.set_user_role(uuid, public.user_role) from public, anon, authenticated;

commit;
