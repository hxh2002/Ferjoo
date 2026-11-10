import { fetchLinkedMeasurements } from '../lib/linked-measurements.js';
import { READ_MESSAGES, classifyReadError, isMissingSchema, isPermissionDenied } from '../lib/read-errors.js';
import { READ_TTL, cacheStamp, cachedRead, invalidateReadCache, readCacheKey } from '../lib/read-cache.js';

export const BUCKET_MS = 10 * 60 * 1000;
export const GAP_MS = 40 * 60 * 1000;
export const METRICS = {
  height_mm: { label: '高度', unit: '毫米' },
  temperature_c: { label: '温度', unit: '°C' },
  humidity_percent: { label: '湿度', unit: '%' },
  battery_percent: { label: '电量', unit: '%' }
};

export function mobileError(error) {
  const message = String(error?.message || error || '');
  const known = {
    AUTH_REQUIRED: '请先登录后再操作。', INVALID_BIND_CODE: '绑定码无效，请检查后重试。',
    USER_NOT_FOUND: '未找到这个系统用户，请核对用户编号。', FORBIDDEN: '没有操作权限，共享关系可能已变化。',
    CANNOT_UNBIND_OWNER: '设备所有者不能解绑自己，当前暂不支持转让所有权。'
  };
  for (const [key, text] of Object.entries(known)) if (message.includes(key)) return text;
  // 登录过期与「没有权限」必须分开：前者让用户重新登录，后者才说明共享关系变了。
  if (classifyReadError(error) === 'auth') return READ_MESSAGES.authExpired;
  if (error?.code === '42501') return known.FORBIDDEN;
  return '操作未完成，请检查网络或稍后重试。';
}

export function normalizeBindCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
export function validateRange(from, to, now = Date.now()) {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '请填写完整的开始和结束日期时间。';
  if (end > now || start > now) return '时间范围不能包含未来时间。';
  if (end - start < BUCKET_MS) return '开始时间须早于结束时间，范围至少为十分钟。';
  return '';
}
export function metricValue(row, key) {
  const value = row?.[key];
  if (value == null || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
export function qualityLabel(row, key) {
  if (row.sensor_error) return '传感器故障';
  if (row.mode === 'sleep') return '休眠';
  if (row.mode !== 'fer') return '模式未知';
  return metricValue(row, key) == null ? '指标缺测' : '有效采样';
}
// 明细表按行说明这条采样的设备状态，与指标是否缺测分开表达。
export function deviceStatus(row) {
  if (row?.sensor_error) return { label: '传感器故障', tone: 'bad' };
  if (row?.mode === 'sleep') return { label: '休眠', tone: 'idle' };
  if (row?.mode === 'fer') {
    const hasValue = ['height_mm', 'temperature_c', 'humidity_percent', 'battery_percent']
      .some((key) => metricValue(row, key) != null);
    return hasValue ? { label: '正常采集', tone: 'ok' } : { label: '指标缺测', tone: 'warn' };
  }
  return { label: row?.mode ? '模式异常' : '状态未知', tone: 'warn' };
}
function compareRows(a, b) {
  const time = new Date(a.recorded_at) - new Date(b.recorded_at);
  if (time) return time;
  const left = String(a.id ?? '0');
  const right = String(b.id ?? '0');
  return /^\d+$/.test(left) && /^\d+$/.test(right)
    ? (BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0)
    : left.localeCompare(right);
}
export function bucketMeasurements(rows) {
  const sorted = [...rows].filter((r) => Number.isFinite(new Date(r.recorded_at).getTime())).sort(compareRows);
  const buckets = new Map();
  for (const row of sorted) buckets.set(Math.floor(new Date(row.recorded_at).getTime() / BUCKET_MS), row);
  const selected = [...buckets.values()];
  let cursor = 0;
  let previousTime = -Infinity;
  return selected.map((row) => {
    const time = new Date(row.recorded_at).getTime();
    let breakBefore = false;
    while (cursor < sorted.length && new Date(sorted[cursor].recorded_at).getTime() <= time) {
      const item = sorted[cursor++];
      if (new Date(item.recorded_at).getTime() > previousTime && (item.mode !== 'fer' || item.sensor_error)) breakBefore = true;
    }
    previousTime = time;
    return { ...row, breakBefore };
  });
}
export function metricGeometry(rows, key, from, to) {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  const valid = rows.map((r) => qualityLabel(r, key) === '有效采样' ? metricValue(r, key) : null);
  const values = valid.filter((v) => v != null);
  const low = values.length ? Math.min(...values) : 0;
  const high = values.length ? Math.max(...values) : 1;
  const pad = high === low ? Math.max(Math.abs(low) * 0.05, 1) : (high - low) * 0.1;
  const min = low - pad;
  const max = high + pad;
  const points = rows.map((row, index) => ({
    row, index, time: new Date(row.recorded_at).getTime(), value: valid[index],
    x: 52 + ((new Date(row.recorded_at).getTime() - start) / Math.max(end - start, 1)) * 292,
    y: valid[index] == null ? null : 178 - ((valid[index] - min) / (max - min)) * 150
  }));
  const segments = [];
  let segment = [];
  for (const point of points) {
    const previous = segment.at(-1);
    if (point.value == null || point.row.breakBefore || (previous && point.time - previous.time > GAP_MS)) {
      if (segment.length) segments.push(segment);
      segment = [];
    }
    if (point.value != null) segment.push(point);
  }
  if (segment.length) segments.push(segment);
  return { points, segments, min, max };
}

export function createMobileDeviceService(client) {
  async function result(query) {
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }
  const fields = 'device_id,name,model,firmware_version,bind_code,last_seen_at,created_at';
  return {
    async listDevices(userId) {
      if (!userId) throw new Error('AUTH_REQUIRED');
      const memberships = await result(client.from('device_members').select('device_id,role').eq('user_id', userId));
      if (!memberships?.length) return [];
      const devices = await result(client.from('devices').select(fields).in('device_id', memberships.map((m) => m.device_id)).order('created_at', { ascending: false }));
      return (devices || []).map((d) => ({ ...d, my_role: memberships.find((m) => m.device_id === d.device_id)?.role }));
    },
    async getDevice(deviceId, userId) {
      if (!userId) throw new Error('AUTH_REQUIRED');
      const [device, membership] = await Promise.all([
        result(client.from('devices').select(fields).eq('device_id', deviceId).maybeSingle()),
        result(client.from('device_members').select('role').eq('device_id', deviceId).eq('user_id', userId).maybeSingle())
      ]);
      return device ? { ...device, my_role: membership?.role || null } : null;
    },
    latest: (deviceId) => result(client.from('device_latest_measurements').select('device_id,recorded_at,mode,sensor_error,height_mm,temperature_c,humidity_percent,battery_percent').eq('device_id', deviceId).maybeSingle()),
    members: (deviceId) => result(client.rpc('list_device_members', { p_device_id: deviceId })),
    claim: (code) => result(client.rpc('claim_device', { p_bind_code: normalizeBindCode(code) })),
    rename: (deviceId, name) => result(client.from('devices').update({ name: name.trim() }).eq('device_id', deviceId).select('device_id,name').single()),
    bind: (deviceId, userId) => result(client.rpc('bind_device_member', { p_device_id: deviceId, p_system_user_id: userId.trim() })),
    unbind: (deviceId, userId) => result(client.rpc('unbind_device_member', { p_device_id: deviceId, p_system_user_id: userId.trim() })),
    // 读取顺序：先直读（RLS：device_members 成员），直读为空或 42501 时回退 list_linked_measurements RPC，
    // 只读 auth.uid() 自己关联窗口内的测量（starterId 可再限定到某个酵种）；RPC 不存在时保持原行为。
    // 返回 errorKind：'' 正常 / 'empty' 无采样 / 'auth' 登录过期 / 'denied' 无权限 / 'other'，调用方据此区分文案。
    async range(deviceId, { from, to, maxPages = 40, pageSize = 1000, onPage, starterId, linkedFallback = true } = {}) {
      const invalid = validateRange(from, to);
      if (invalid) throw new Error(invalid);
      let raw = [];
      let complete = false;
      let failure = null;
      let pages = 0;
      let source = 'direct';
      for (let page = 0; page < maxPages; page += 1) {
        try {
          const data = await result(client.from('device_measurements')
            .select('id,recorded_at,height_mm,temperature_c,humidity_percent,battery_percent,mode,sensor_error')
            .eq('device_id', deviceId).gte('recorded_at', from).lt('recorded_at', to)
            .order('recorded_at', { ascending: true }).order('id', { ascending: true })
            .range(page * pageSize, (page + 1) * pageSize - 1));
          pages += 1;
          raw.push(...(data || []));
          complete = !data || data.length < pageSize;
          onPage?.(bucketMeasurements(raw));
          if (complete) break;
        } catch (cause) {
          failure = cause;
          break;
        }
      }
      if (linkedFallback && (failure ? isPermissionDenied(failure) : !raw.length)) {
        try {
          const linked = await fetchLinkedMeasurements(client, { deviceId, from, to, starterId, maxPages, pageSize });
          if (linked.rows.length || failure) {
            raw = linked.rows; complete = linked.complete; failure = null; source = 'linked';
            onPage?.(bucketMeasurements(raw));
          }
        } catch (cause) {
          // 迁移未执行：保持原行为；其余失败如实上报，不当作「没有数据」。
          if (!isMissingSchema(cause)) failure = cause;
        }
      }
      const kind = failure ? classifyReadError(failure) : '';
      const error = !failure ? '' : kind === 'auth' ? READ_MESSAGES.authExpired : kind === 'denied' ? READ_MESSAGES.denied : mobileError(failure);
      return {
        rows: bucketMeasurements(raw), complete: !failure && complete, limited: !failure && !complete, error,
        errorKind: failure ? (kind === 'missing' ? 'other' : kind) : raw.length ? '' : 'empty', source,
        requested: { from, to }, covered: raw.length ? { from: raw[0].recorded_at, to: raw.at(-1).recorded_at } : null,
        nextOffset: complete || source === 'linked' ? null : pages * pageSize
      };
    }
  };
}
let service;
export async function mobileDeviceService() {
  if (!service) {
    const { supabase } = await import('../lib/supabase.js');
    if (!supabase) throw new Error('SERVICE_UNAVAILABLE');
    const base = createMobileDeviceService(supabase);
    // 设备信息与当天曲线在一段时间内不会变化，页面之间共享同一份读取结果。
    service = {
      ...base,
      listDevices: (userId) => cachedRead(readCacheKey(['device', 'list', userId]), () => base.listDevices(userId), { ttl: READ_TTL.device }),
      getDevice: (deviceId, userId) => cachedRead(readCacheKey(['device', 'one', deviceId, userId]), () => base.getDevice(deviceId, userId), { ttl: READ_TTL.device }),
      latest: (deviceId) => cachedRead(readCacheKey(['device', 'latest', deviceId]), () => base.latest(deviceId), { ttl: READ_TTL.records }),
      // 带 onPage 的渐进渲染必须实时返回，不能复用旧结果。
      range: (deviceId, options = {}) => options.onPage
        ? base.range(deviceId, options)
        : cachedRead(
          readCacheKey(['device', 'range', deviceId, cacheStamp(options.from), cacheStamp(options.to), options.maxPages ?? '', options.pageSize ?? '', options.starterId ?? '']),
          () => base.range(deviceId, options),
          { ttl: READ_TTL.device, cacheable: (value) => !value.error }
        ),
      claim: async (code) => { const row = await base.claim(code); invalidateReadCache('device'); invalidateReadCache('links'); return row; },
      rename: async (deviceId, name) => { const row = await base.rename(deviceId, name); invalidateReadCache('device'); return row; },
      bind: async (deviceId, userId) => { const row = await base.bind(deviceId, userId); invalidateReadCache('device'); return row; },
      unbind: async (deviceId, userId) => { const row = await base.unbind(deviceId, userId); invalidateReadCache('device'); return row; }
    };
  }
  return service;
}
