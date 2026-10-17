import { hasSupabaseConfig, supabase } from '../lib/supabase.js';

const RECORD_FIELDS = 'id, kind, starter_id, occurred_at, input, result, ratio';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireClient() {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error('记录服务尚未启用，请稍后重试。');
  }
  return supabase;
}

function fail(message) {
  throw new Error(message);
}

function requiredUuid(value, label) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) fail(`${label}格式不正确。`);
  return value;
}

function queryTime(value) {
  if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Date.parse(value))) {
    fail('记录时间格式不正确。');
  }
  return new Date(value).toISOString();
}

function occurredAt(value) {
  const time = queryTime(value);
  if (new Date(time) > new Date()) fail('记录时间不能晚于当前时间。');
  return time;
}

function objectSnapshot(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}必须是对象。`);
  return value;
}

function mapError(error) {
  const message = String(error?.message || '');
  if (error?.code === '42P01' || error?.code === 'PGRST205' || /relation .* does not exist|Could not find the table/i.test(message)) {
    return new Error('记录服务尚未启用，请先完成数据库迁移。');
  }
  if (error?.code === '42501' || /permission denied|JWT/i.test(message)) return new Error('当前账号没有访问这份记录的权限。');
  if (message.includes('REQUEST_ID_CONFLICT')) return new Error('请求编号已用于另一条记录，原记录不会被覆盖。');
  if (message.includes('STARTER_NOT_FOUND')) return new Error('找不到这份酵种，可能已被移除。');
  if (message.includes('AUTH_REQUIRED')) return new Error('请先登录后再保存记录。');
  return error;
}

async function run(operation) {
  try {
    return await operation();
  } catch (error) {
    throw mapError(error);
  }
}

function record(row) {
  return {
    id: row.id,
    kind: row.kind,
    starter_id: row.starter_id,
    occurred_at: row.occurred_at,
    input: row.input,
    result: row.result,
    ratio: row.ratio ?? null
  };
}

export function listStarters({ userId } = {}) {
  return run(async () => {
    let query = requireClient().from('starters').select('id, name').order('created_at', { ascending: false });
    if (userId !== undefined) query = query.eq('user_id', requiredUuid(userId, '账号 ID'));
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(({ id, name }) => ({ id, name }));
  });
}

export function createStarter(name) {
  return run(async () => {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) fail('酵种名称需为 1 至 80 个字符。');
    const { data, error } = await requireClient().from('starters').insert({ name: name.trim() }).select('id, name').single();
    if (error) throw error;
    return { id: data.id, name: data.name };
  });
}

export function listCareRecords({ starterId, from, to, kind, limit, offset = 0, userId } = {}) {
  return run(async () => {
    const client = requireClient();
    let query = client.from('care_records').select(RECORD_FIELDS).order('occurred_at', { ascending: false }).order('id', { ascending: false });
    if (userId !== undefined) query = query.eq('user_id', requiredUuid(userId, '账号 ID'));
    if (starterId !== undefined && starterId !== null && starterId !== '') query = query.eq('starter_id', requiredUuid(starterId, '酵种 ID'));
    if (from !== undefined) query = query.gte('occurred_at', queryTime(from));
    if (to !== undefined) query = query.lt('occurred_at', queryTime(to));
    if (from !== undefined && to !== undefined && new Date(from) >= new Date(to)) fail('查询开始时间必须早于结束时间。');
    if (kind !== undefined) {
      if (!['feeding', 'observation'].includes(kind)) fail('记录类型不正确。');
      query = query.eq('kind', kind);
    }
    if (!Number.isSafeInteger(offset) || offset < 0) fail('查询偏移量不正确。');
    if (limit !== undefined) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) fail('每页记录数应为 1 至 200。');
      query = query.range(offset, offset + limit - 1);
    } else if (offset !== 0) fail('分页查询需要指定每页记录数。');
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(record);
  });
}

function saveRecord({ requestId, starterId, occurredAt: when, ratio, input = {}, result = {} }, kind) {
  return run(async () => {
    const request = requiredUuid(requestId, '请求编号');
    const starter = requiredUuid(starterId, '酵种 ID');
    const time = occurredAt(when);
    const inputSnapshot = objectSnapshot(input, '输入快照');
    if (kind === 'feeding') {
      const baseline = inputSnapshot.baseline_height_mm;
      if (baseline != null && baseline !== '' && (!Number.isFinite(Number(baseline)) || Number(baseline) <= 0)) {
        fail('起始高度必须是大于零的数值。');
      }
      if (inputSnapshot.baseline_source != null && !['device', 'manual'].includes(inputSnapshot.baseline_source)) {
        fail('起始高度来源不正确。');
      }
      for (const key of ['starter_g', 'water_g', 'flour_g', 'total_g']) {
        const value = inputSnapshot[key];
        if (value != null && (!Number.isFinite(Number(value)) || Number(value) <= 0)) fail('投喂重量必须是大于零的数值。');
      }
    }
    const resultSnapshot = objectSnapshot(result, '结果快照');
    const normalizedRatio = kind === 'feeding'
      ? (typeof ratio === 'string' && ratio.trim() ? ratio.trim() : fail('喂养比例不能为空。'))
      : null;
    if (normalizedRatio && normalizedRatio.length > 80) fail('喂养比例不能超过 80 个字符。');
    const { data, error } = await requireClient().rpc('save_care_record', {
      p_request_id: request,
      p_starter_id: starter,
      p_kind: kind,
      p_occurred_at: time,
      p_input: inputSnapshot,
      p_result: resultSnapshot,
      p_ratio: normalizedRatio
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) fail('记录保存失败，请稍后重试。');
    return record(row);
  });
}

export function saveFeeding(args = {}) {
  return saveRecord(args, 'feeding');
}

export function saveObservation(args = {}) {
  return saveRecord(args, 'observation');
}

export function getCareRecord(id, { userId } = {}) {
  return run(async () => {
    let query = requireClient().from('care_records').select(RECORD_FIELDS).eq('id', requiredUuid(id, '记录 ID'));
    if (userId !== undefined) query = query.eq('user_id', requiredUuid(userId, '账号 ID'));
    const { data, error } = await query.single();
    if (error) throw error;
    return record(data);
  });
}

export function listDeviceRoles() {
  return run(async () => {
    const client = requireClient();
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError) throw authError;
    if (!authData?.user?.id) fail('请先登录后再查看设备角色。');
    const { data, error } = await client.from('device_members').select('device_id, role').eq('user_id', authData.user.id).order('device_id');
    if (error) throw error;
    return data || [];
  });
}
