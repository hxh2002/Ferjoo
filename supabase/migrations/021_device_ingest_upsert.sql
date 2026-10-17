begin;

-- 设备批量上传的重放幂等：同一 (device_id, recorded_at) 已存在则跳过，重复投递同一批数据不再产生重复行。
-- 不删除、不覆盖任何已写入行（真实设备可能合法上报相同 recorded_at 的多条原始读数；
-- 十分钟桶去重自 013 起由查询层 pickLatestPerBucket 完成，数据库层保持追加语义），
-- 也不为 (device_id, recorded_at) 新建唯一约束：既有重复数据会让索引创建失败，阻塞整次迁移。
-- 并发下同批数据仍可能双写，与 013 以来行为一致，展示层按桶去重兜底。
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
  )
  where not exists (
    select 1
    from public.device_measurements m
    where m.device_id = p_device_id
      and m.recorded_at = coalesce(r.recorded_at, now())
  );

  get diagnostics v_count = row_count;

  update public.devices
  set last_seen_at = greatest(coalesce(last_seen_at, now()), now())
  where device_id = p_device_id;

  return jsonb_build_object('written', v_count);
end;
$$;

-- 权限与 014 保持一致：设备端用 anon 调用。
revoke all on function public.ingest_device_measurements(varchar, text, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_device_measurements(varchar, text, jsonb) to anon;

commit;
