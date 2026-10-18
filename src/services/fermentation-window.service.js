import { hasSupabaseConfig, supabase } from '../lib/supabase.js';

const FIELDS = 'id, starter_id, feeding_id, ended_at, reason, detail';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireClient() {
  if (!hasSupabaseConfig || !supabase) throw new Error('发酵窗口服务尚未启用，请稍后重试。');
  return supabase;
}

function requiredUuid(value, label) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) throw new Error(`${label}格式不正确。`);
  return value;
}

function mapError(error) {
  const message = String(error?.message || '');
  if (error?.code === '42P01' || error?.code === 'PGRST205' || /relation .* does not exist|Could not find the table/i.test(message)) {
    return new Error('发酵窗口服务尚未启用，请先完成数据库迁移。');
  }
  if (message.includes('FEEDING_NOT_FOUND')) return new Error('找不到这次喂养记录，可能已被移除。');
  if (message.includes('INVALID_WINDOW_END')) return new Error('结束时间必须晚于喂养时间且不晚于现在。');
  if (message.includes('INVALID_WINDOW_DETAIL')) return new Error('结束原因不正确。');
  if (message.includes('AUTH_REQUIRED')) return new Error('请先登录后再结束本轮。');
  return error;
}

async function run(operation) {
  try {
    return await operation();
  } catch (error) {
    throw mapError(error);
  }
}

export function loadWindowClosure(userId, feedingId) {
  return run(async () => {
    const { data, error } = await requireClient().from('fermentation_window_closures')
      .select(FIELDS)
      .eq('user_id', requiredUuid(userId, '账号 ID'))
      .eq('feeding_id', requiredUuid(feedingId, '喂养记录 ID'))
      .maybeSingle();
    if (error) throw error;
    return data || null;
  });
}

export function loadWindowClosures(userId, feedingIds) {
  return run(async () => {
    const ids = [...new Set(Array.isArray(feedingIds) ? feedingIds : [])];
    if (!ids.length) return [];
    const { data, error } = await requireClient().from('fermentation_window_closures')
      .select(FIELDS)
      .eq('user_id', requiredUuid(userId, '账号 ID'))
      .in('feeding_id', ids.map((id) => requiredUuid(id, '喂养记录 ID')))
      .limit(200);
    if (error) throw error;
    return data || [];
  });
}

export function closeFeedingWindow({ feedingId, endedAt, detail = null } = {}) {
  return run(async () => {
    const at = new Date(endedAt);
    if (!Number.isFinite(at.getTime())) throw new Error('结束时间格式不正确。');
    const { data, error } = await requireClient().rpc('close_fermentation_window', {
      p_feeding_id: requiredUuid(feedingId, '喂养记录 ID'),
      p_ended_at: at.toISOString(),
      p_detail: detail || null
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('结束本轮失败，请稍后重试。');
    return row;
  });
}
