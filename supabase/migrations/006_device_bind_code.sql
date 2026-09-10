begin;

-- ============================================================================
-- 006 · 设备绑定码（持有即拥有）
--
-- 背景：设备先于账号发货，用户注册后需自行把设备绑到名下。
-- 设计：每台设备带一个 8 位人类可读绑定码（排除易混淆字符），
--       用户手输或扫码（二维码只是绑定码的冗余载体）即可完成绑定。
--       绑定即加入 device_members：无人认领时首个绑定者为 owner，
--       之后绑定者为 member（设备数据非敏感，读权限对持有人开放）。
-- ============================================================================

-- ---------- 绑定码列 ----------
alter table public.devices
  add column if not exists bind_code varchar(8);

alter table public.devices
  drop constraint if exists devices_bind_code_format;
alter table public.devices
  add constraint devices_bind_code_format check (bind_code is null or bind_code ~ '^[A-HJ-NP-Z2-9]{8}$');

-- ---------- 绑定码生成器（Crockford 风格字母表，无 0/O/1/I/L 混淆） ----------
create or replace function private.generate_bind_code()
returns varchar
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code varchar(8);
  i integer;
begin
  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * 32)::integer, 1);
    end loop;
    exit when not exists (select 1 from public.devices d where d.bind_code = v_code);
  end loop;
  return v_code;
end;
$$;

-- ---------- 存量设备补发绑定码 ----------
update public.devices
set bind_code = private.generate_bind_code()
where bind_code is null;

create unique index if not exists devices_bind_code_key
  on public.devices(bind_code)
  where bind_code is not null;

-- ---------- create_device：新设备同时签发绑定码 ----------
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
  v_bind_code varchar(8);
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  v_device_id := coalesce(
    nullif(trim(p_device_id), ''),
    'dev_' || encode(extensions.gen_random_bytes(8), 'hex')
  );
  v_api_key := encode(extensions.gen_random_bytes(32), 'hex');
  v_bind_code := private.generate_bind_code();

  insert into public.devices (device_id, name, model, api_key_hash, bind_code)
  values (
    v_device_id,
    nullif(trim(p_name), ''),
    nullif(trim(p_model), ''),
    private.hash_api_key(v_api_key),
    v_bind_code
  );

  insert into public.device_members (device_id, user_id, role)
  values (v_device_id, v_user_id, 'owner');

  return jsonb_build_object(
    'device_id', v_device_id,
    'api_key', v_api_key,
    'bind_code', v_bind_code
  );
end;
$$;

-- ---------- claim_device：凭绑定码把设备绑到自己名下 ----------
-- 幂等：已绑定过则直接返回 already_mine；并发由设备行锁串行化。
create or replace function public.claim_device(p_bind_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_code varchar := upper(regexp_replace(coalesce(p_bind_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_device_id varchar;
  v_has_owner boolean;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  -- 行锁串行化并发绑定
  select d.device_id into v_device_id
  from public.devices d
  where d.bind_code = v_code
  for update;

  if v_device_id is null then
    raise exception 'INVALID_BIND_CODE';
  end if;

  if exists (
    select 1 from public.device_members m
    where m.device_id = v_device_id and m.user_id = v_user_id
  ) then
    return jsonb_build_object('claimed', false, 'already_mine', true, 'device_id', v_device_id);
  end if;

  v_has_owner := exists (
    select 1 from public.device_members m
    where m.device_id = v_device_id and m.role = 'owner'
  );

  insert into public.device_members (device_id, user_id, role)
  values (v_device_id, v_user_id, case when v_has_owner then 'member' else 'owner' end);

  return jsonb_build_object(
    'claimed', true,
    'device_id', v_device_id,
    'role', case when v_has_owner then 'member' else 'owner' end
  );
end;
$$;

-- ---------- 权限收口 ----------
revoke all on function private.generate_bind_code() from public, anon, authenticated;
revoke all on function public.claim_device(text) from public, anon, authenticated;
grant execute on function public.claim_device(text) to authenticated;

commit;
