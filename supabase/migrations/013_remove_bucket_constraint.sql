begin;

-- 十分钟桶概念从数据库写入层移除：原始数据按 recorded_at 逐条保存，
-- 分桶与"每桶取最新一条"延后到 Web 查询/展示层完成。

drop view if exists public.device_latest_measurements;

alter table public.device_measurements
  drop constraint if exists device_measurements_one_point_per_bucket;

drop trigger if exists device_measurements_bucket on public.device_measurements;
drop function if exists private.set_measurement_bucket();

drop index if exists public.device_measurements_device_time_idx;

alter table public.device_measurements
  drop column if exists bucket_start;

create index if not exists device_measurements_device_recorded_idx
  on public.device_measurements(device_id, recorded_at desc);

-- 设备批量写入：不再按桶 upsert，直接插入原始数据，同批同桶不再冲突。
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
  v_count integer := 0;
begin
  if p_measurements is null or jsonb_typeof(p_measurements) <> 'array' then
    raise exception 'INVALID_MEASUREMENTS';
  end if;

  if jsonb_array_length(p_measurements) > 288 then
    raise exception 'TOO_MANY_MEASUREMENTS';
  end if;

  if not exists (
    select 1 from public.devices d
    where d.device_id = p_device_id
      and d.api_key_hash = private.hash_api_key(p_api_key)
  ) then
    raise exception 'INVALID_DEVICE_CREDENTIALS' using errcode = '42501';
  end if;

  insert into public.device_measurements (
    device_id, recorded_at,
    temperature_c, height_mm, height_delta_mm,
    humidity_percent, battery_percent, payload
  )
  select
    p_device_id,
    coalesce(r.recorded_at, now()),
    r.temperature_c, r.height_mm, r.height_delta_mm,
    r.humidity_percent, r.battery_percent,
    coalesce(r.payload, '{}'::jsonb)
  from jsonb_to_recordset(p_measurements) as r(
    recorded_at timestamptz,
    temperature_c numeric,
    height_mm numeric,
    height_delta_mm numeric,
    humidity_percent numeric,
    battery_percent numeric,
    payload jsonb
  );

  get diagnostics v_count = row_count;

  update public.devices
  set last_seen_at = greatest(coalesce(last_seen_at, now()), now())
  where device_id = p_device_id;

  return jsonb_build_object('written', v_count);
end;
$$;

-- 最新数据视图：按实际测量时间取每设备最新一条。
create or replace view public.device_latest_measurements
with (security_invoker = true)
as
select distinct on (device_id)
  device_id,
  recorded_at,
  temperature_c,
  height_mm,
  height_delta_mm,
  humidity_percent,
  battery_percent
from public.device_measurements
order by device_id, recorded_at desc;

commit;
