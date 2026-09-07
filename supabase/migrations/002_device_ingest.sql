begin;

-- 设备通过 HTTP/WiFi 上传数据时需要独立的设备凭据，
-- 不依赖用户登录态（anon 即可调用上传 RPC）。
create extension if not exists pgcrypto with schema extensions;

alter table public.devices
  add column if not exists api_key_hash text;

create unique index if not exists devices_api_key_hash_idx
  on public.devices(api_key_hash)
  where api_key_hash is not null;

-- 设备密钥只存 sha256 摘要，明文仅在创建设备时返回一次。
create or replace function private.hash_api_key(p_api_key text)
returns text
language sql
immutable
set search_path = pg_temp
as $$
  select encode(extensions.digest(p_api_key, 'sha256'), 'hex');
$$;

-- 已登录用户在浏览器端创建设备，并获取一次性 API Key。
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
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  v_device_id := coalesce(
    nullif(trim(p_device_id), ''),
    'dev_' || encode(extensions.gen_random_bytes(8), 'hex')
  );
  v_api_key := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.devices (device_id, user_id, name, model, api_key_hash)
  values (
    v_device_id,
    v_user_id,
    nullif(trim(p_name), ''),
    nullif(trim(p_model), ''),
    private.hash_api_key(v_api_key)
  );

  return jsonb_build_object(
    'device_id', v_device_id,
    'api_key', v_api_key
  );
end;
$$;

-- 设备端批量上传接口：一次性写入最多过去 48 小时（约 288 个 10 分钟桶）的数据。
-- p_measurements 为 JSON 数组，元素形如：
--   { "recorded_at": "2026-09-04T08:00:00Z", "temperature_c": 24.5, ... }
create or replace function public.ingest_device_measurements(
  p_device_id varchar,
  p_api_key text,
  p_measurements jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_user_id uuid;
  v_count integer := 0;
begin
  if p_measurements is null or jsonb_typeof(p_measurements) <> 'array' then
    raise exception 'INVALID_MEASUREMENTS';
  end if;

  select d.user_id
    into v_user_id
  from public.devices d
  where d.device_id = p_device_id
    and d.api_key_hash = private.hash_api_key(p_api_key);

  if v_user_id is null then
    raise exception 'INVALID_DEVICE_CREDENTIALS' using errcode = '42501';
  end if;

  with incoming as (
    select
      p_device_id as device_id,
      v_user_id as user_id,
      coalesce(r.recorded_at, now()) as recorded_at,
      r.temperature_c,
      r.height_mm,
      r.height_delta_mm,
      r.humidity_percent,
      r.battery_percent,
      coalesce(r.payload, '{}'::jsonb) as payload
    from jsonb_to_recordset(p_measurements) as r(
      recorded_at timestamptz,
      temperature_c numeric,
      height_mm numeric,
      height_delta_mm numeric,
      humidity_percent numeric,
      battery_percent numeric,
      payload jsonb
    )
  )
  insert into public.device_measurements (
    device_id, user_id, recorded_at,
    temperature_c, height_mm, height_delta_mm,
    humidity_percent, battery_percent, payload
  )
  select
    device_id, user_id, recorded_at,
    temperature_c, height_mm, height_delta_mm,
    humidity_percent, battery_percent, payload
  from incoming
  on conflict (device_id, bucket_start) do update set
    recorded_at = excluded.recorded_at,
    temperature_c = excluded.temperature_c,
    height_mm = excluded.height_mm,
    height_delta_mm = excluded.height_delta_mm,
    humidity_percent = excluded.humidity_percent,
    battery_percent = excluded.battery_percent,
    payload = excluded.payload;

  get diagnostics v_count = row_count;

  update public.devices
  set last_seen_at = greatest(coalesce(last_seen_at, now()), now())
  where device_id = p_device_id and user_id = v_user_id;

  return jsonb_build_object('written', v_count);
end;
$$;

-- 权限：默认 PUBLIC 有函数执行权，先全部收回再按角色授予。
revoke all on function private.hash_api_key(text) from public, anon, authenticated;

revoke all on function public.create_device(varchar, varchar, varchar) from public, anon, authenticated;
grant execute on function public.create_device(varchar, varchar, varchar) to authenticated;

revoke all on function public.ingest_device_measurements(varchar, text, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_device_measurements(varchar, text, jsonb) to anon;

commit;
