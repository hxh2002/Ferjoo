import { isUuid, randomUuid } from '../lib/uuid.js';

const EVENT_NAME = /^[a-z][a-z0-9_]{1,79}$/;
const PAGE_NAME = /^[a-z][a-z0-9_/-]{0,79}$/;
const MAX_PROPERTIES_BYTES = 8192;
const jsonBytes = (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

// 埋点载荷只包含明确给出的业务字段；不接受调用方传入 user_id 或任意事件对象。
export function analyticsPayload({ name, page = 'unknown', properties = {}, sessionId, eventId, occurredAt = new Date() } = {}) {
  if (typeof name !== 'string' || !EVENT_NAME.test(name)) throw new Error('无效的埋点事件名称。');
  if (typeof page !== 'string' || !PAGE_NAME.test(page)) throw new Error('无效的埋点页面名称。');
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) throw new Error('无效的埋点属性。');
  if (jsonBytes(properties) > MAX_PROPERTIES_BYTES) throw new Error('埋点属性过大。');
  const timestamp = new Date(occurredAt);
  if (!Number.isFinite(timestamp.getTime())) throw new Error('无效的埋点时间。');
  return {
    event_name: name,
    page,
    properties: JSON.parse(JSON.stringify(properties)),
    session_id: isUuid(sessionId) ? sessionId : randomUuid('埋点会话编号'),
    client_event_id: isUuid(eventId) ? eventId : randomUuid('埋点事件编号'),
    occurred_at: timestamp.toISOString()
  };
}

export async function recordAnalytics(event, client) {
  let row;
  try { row = analyticsPayload(event); } catch { return { recorded: false }; }
  try {
    const db = client === undefined ? (await import('../lib/supabase.js')).supabase : client;
    if (!db) return { recorded: false };
    // getSession 读取本地已恢复会话，不为每个点击额外请求 Auth 服务。
    const { data, error } = await db.auth.getSession();
    const userId = data?.session?.user?.id;
    if (error || !userId) return { recorded: false };
    const { data: inserted, error: insertError } = await db.from('analytics_events')
      .insert({ ...row, user_id: userId }).select('id').single();
    if (insertError || !inserted?.id) return { recorded: false };
    return { recorded: true, id: inserted.id, eventId: row.client_event_id };
  } catch { return { recorded: false }; }
}

let sessionId;
export function trackEvent(name, properties = {}, { page = 'unknown', eventId, occurredAt } = {}) {
  if (!isUuid(sessionId)) sessionId = randomUuid('埋点会话编号');
  const task = recordAnalytics({ name, properties, page, sessionId, eventId, occurredAt });
  // 产品功能不能因统计失败而中断，也不能产生未处理的 Promise rejection。
  return task.catch(() => ({ recorded: false }));
}

// 前台停留按 performance.now() 计，后台时间不计入；每次隐藏/卸载只结算一次。
export function createForegroundTimer({ now = () => performance.now(), hidden = () => document.hidden } = {}) {
  let total = 0;
  let startedAt = hidden() ? null : now();
  return {
    pause() {
      if (startedAt == null) return;
      total += Math.max(0, now() - startedAt);
      startedAt = null;
    },
    resume() {
      if (!hidden() && startedAt == null) startedAt = now();
    },
    flush() {
      this.pause();
      const duration = Math.round(total);
      total = 0;
      return duration;
    }
  };
}
