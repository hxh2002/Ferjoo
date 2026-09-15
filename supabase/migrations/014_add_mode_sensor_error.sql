begin;

-- 为新版硬件数据规范添加模式与传感器故障字段（从 payload 中提取并独立成列）。

alter table public.device_measurements
  add column if not exists mode varchar(10)
    check (mode is null or mode in ('sleep', 'fer'));

alter table public.device_measurements
  add column if not exists sensor_error boolean not null default false;

-- 回填历史数据
update public.device_measurements
set
  mode = case
    when payload->>'mode' in ('sleep', 'fer') then payload->>'mode'
    else null
  end,
  sensor_error = coalesce((payload->>'sensor_error')::boolean, false);

drop view if exists public.device_latest_measurements;

-- 设备批量写入：写入时从 payload 中提升 mode/sensor_error。
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
    humidity_percent, battery_percent, payload,
    mode, sensor_error
  )
  select
    p_device_id,
    coalesce(r.recorded_at, now()),
    r.temperature_c, r.height_mm, r.height_delta_mm,
    r.humidity_percent, r.battery_percent,
    coalesce(r.payload, '{}'::jsonb),
    case
      when coalesce(r.payload, '{}'::jsonb)->>'mode' in ('sleep', 'fer')
        then coalesce(r.payload, '{}'::jsonb)->>'mode'
      else null
    end,
    coalesce((coalesce(r.payload, '{}'::jsonb)->>'sensor_error')::boolean, false)
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

-- 最新数据视图：携带 mode / sensor_error。
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
  battery_percent,
  mode,
  sensor_error
from public.device_measurements
order by device_id, recorded_at desc;

commit;
