import { hasSupabaseConfig, supabase } from '../lib/supabase.js';
import { fetchLinkedMeasurements } from '../lib/linked-measurements.js';
import { classifyReadError, incompleteReadError, isMissingSchema, isPermissionDenied, readErrorMessage } from '../lib/read-errors.js';

function requireClient() {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error('Supabase 尚未配置。');
  }
  return supabase;
}

const BUCKET_MS = 10 * 60 * 1000;

// 十分钟桶在查询层实现：每个桶自动选取 recorded_at 最新的一条。
export function pickLatestPerBucket(rows, dir = 'desc') {
  const byBucket = new Map();
  for (const row of rows) {
    const t = new Date(row.recorded_at).getTime();
    if (!Number.isFinite(t)) continue;
    const key = Math.floor(t / BUCKET_MS);
    const prev = byBucket.get(key);
    if (!prev || new Date(prev.recorded_at).getTime() < t) byBucket.set(key, row);
  }
  const sign = dir === 'asc' ? 1 : -1;
  return [...byBucket.values()].sort(
    (a, b) => sign * (new Date(a.recorded_at) - new Date(b.recorded_at))
  );
}

export async function listDevices() {
  const client = requireClient();
  const { data, error } = await client
    .from('devices')
    .select('device_id, name, model, firmware_version, bind_code, last_seen_at, metadata, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function claimDevice(bindCode) {
  const client = requireClient();
  const { data, error } = await client.rpc('claim_device', {
    p_bind_code: bindCode?.trim() || ''
  });
  if (error) throw error;
  return data; // { claimed, already_mine?, device_id, role }
}

export async function renameDevice(deviceId, name) {
  const client = requireClient();
  const { data, error } = await client
    .from('devices')
    .update({ name: name?.trim() || null })
    .eq('device_id', deviceId)
    .select('device_id, name, model, firmware_version, last_seen_at, metadata, created_at, updated_at')
    .single();
  if (error) throw error;
  return data;
}

export async function getLatestMeasurement(deviceId) {
  const client = requireClient();
  const { data, error } = await client
    .from('device_latest_measurements')
    .select('*')
    .eq('device_id', deviceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// 按时间范围拉取（PostgREST 单页上限 1000 行，自动分页），返回按时间升序的数组。
// onPage：每页拉完即回调该页的桶化增量行，供调用方渐进渲染；返回值仍是全量结果。
// 分页按 (recorded_at, id) 稳定排序，避免同一时刻的多行在翻页边界重复或丢失。
// 触顶 maxPages 且最后一页仍是满页时视为「读取不完整」：默认抛出 MEASUREMENTS_INCOMPLETE，
// allowPartial: true 时返回已读到的行，并在数组上标记 incomplete = true，调用方必须提示用户。
// 直读为空或被 RLS 拒绝（用户已不是 device_members 成员）时，回退到 list_linked_measurements RPC，
// 只读 auth.uid() 自己关联窗口内的测量（starterId 可再限定到某个酵种）；RPC 不存在时保持原行为。
export async function listMeasurementsRange(deviceId, { from, to, bucketed = true, maxPages = 40, onPage, starterId, linkedFallback = true, allowPartial = false } = {}) {
  const client = requireClient();
  const PAGE = 1000;
  let rows = [];
  let truncated = false;
  let directError = null;
  try {
    let page = 0;
    for (; page < maxPages; page += 1) {
      let query = client
        .from('device_measurements')
        .select('id, recorded_at, temperature_c, height_mm, height_delta_mm, humidity_percent, battery_percent, mode, sensor_error')
        .eq('device_id', deviceId)
        .order('recorded_at', { ascending: true })
        .order('id', { ascending: true })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (from) query = query.gte('recorded_at', from);
      if (to) query = query.lte('recorded_at', to);
      const { data, error } = await query;
      if (error) throw error;
      rows.push(...(data || []));
      if (onPage && data?.length) onPage(bucketed ? pickLatestPerBucket(data, 'asc') : data);
      if (!data || data.length < PAGE) break;
    }
    truncated = page >= maxPages;
  } catch (error) {
    directError = error;
  }
  if (directError ? isPermissionDenied(directError) && linkedFallback : !rows.length && linkedFallback && from && to) {
    try {
      const linked = await fetchLinkedMeasurements(client, { deviceId, from, to, starterId, maxPages, pageSize: PAGE, inclusiveTo: true });
      if (linked.rows.length || directError) {
        rows = linked.rows;
        truncated = !linked.complete;
        directError = null;
        if (onPage && rows.length) onPage(bucketed ? pickLatestPerBucket(rows, 'asc') : rows);
      }
    } catch (error) {
      // 迁移未执行：保持原行为（空结果或原始错误）；其他错误如实抛出。
      if (!isMissingSchema(error)) throw describeFailure(error);
    }
  }
  if (directError) throw describeFailure(directError);
  if (truncated) {
    if (!allowPartial) throw incompleteReadError(rows.length);
  }
  const result = bucketed ? pickLatestPerBucket(rows, 'asc') : rows;
  if (truncated) result.incomplete = true;
  return result;
}

// 把登录过期 / 无权限转成可读文案，其余错误原样抛出。
function describeFailure(error) {
  const kind = classifyReadError(error);
  if (kind !== 'auth' && kind !== 'denied') return error;
  const wrapped = new Error(readErrorMessage(error));
  wrapped.code = error?.code;
  wrapped.cause = error;
  return wrapped;
}

export async function addMeasurement(deviceId, measurement) {
  const client = requireClient();
  const payload = {
    device_id: deviceId,
    recorded_at: measurement.recordedAt || new Date().toISOString(),
    temperature_c: finiteOrNull(measurement.temperatureC),
    height_mm: finiteOrNull(measurement.heightMm),
    height_delta_mm: finiteOrNull(measurement.heightDeltaMm),
    humidity_percent: finiteOrNull(measurement.humidityPercent),
    battery_percent: finiteOrNull(measurement.batteryPercent),
    payload: measurement.payload || {}
  };
  const { data, error } = await client
    .from('device_measurements')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function bindDeviceMember(deviceId, systemUserId) {
  const client = requireClient();
  const { data, error } = await client.rpc('bind_device_member', {
    p_device_id: deviceId,
    p_system_user_id: systemUserId?.trim()
  });
  if (error) throw error;
  return data;
}

export async function unbindDeviceMember(deviceId, systemUserId) {
  const client = requireClient();
  const { data, error } = await client.rpc('unbind_device_member', {
    p_device_id: deviceId,
    p_system_user_id: systemUserId?.trim()
  });
  if (error) throw error;
  return data;
}

export async function listDeviceMembers(deviceId) {
  const client = requireClient();
  const { data, error } = await client.rpc('list_device_members', {
    p_device_id: deviceId
  });
  if (error) throw error;
  return data || [];
}

function finiteOrNull(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
