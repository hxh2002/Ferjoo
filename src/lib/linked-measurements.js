// 「按本人关联窗口读测量」的客户端封装：调用 list_linked_measurements RPC（migration 025）。
//
// 直读 device_measurements 依赖 RLS 的 device_members 成员资格；用户退出共享后直读会返回空或 42501，
// 但他自己曾经关联过的时间窗内的测量应当仍然可读。该 RPC 只放行 auth.uid() 自己的 link 窗口。
// RPC 不存在（迁移未执行）时抛出 missingSchema 错误，由调用方回退到原直读行为。
import { isMissingSchema } from './read-errors.js';

const missing = new WeakSet();
const time = (value) => new Date(value).getTime();

export function linkedRpcAvailable(client) {
  return !missing.has(client);
}

/**
 * @param {any} client supabase client
 * @param {{ deviceId: string, from: string, to: string, starterId?: string, maxPages?: number, pageSize?: number, inclusiveTo?: boolean }} options
 * @returns {Promise<{ rows: any[], complete: boolean }>}
 */
export async function fetchLinkedMeasurements(client, { deviceId, from, to, starterId, maxPages = 40, pageSize = 1000, inclusiveTo = false }) {
  if (missing.has(client)) { const error = new Error('list_linked_measurements 不可用'); error.code = 'PGRST202'; throw error; }
  const limit = Math.min(pageSize, 1000);
  const rows = [];
  let after = null;
  let complete = false;
  for (let page = 0; page < maxPages; page += 1) {
    const { data, error } = await client.rpc('list_linked_measurements', {
      p_device_id: deviceId, p_from: from, p_to: to, p_starter_id: starterId || null,
      p_after_at: after?.recorded_at ?? null, p_after_id: after?.id ?? null, p_limit: limit
    });
    if (error) {
      if (isMissingSchema(error)) missing.add(client);
      throw error;
    }
    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);
    complete = batch.length < limit;
    if (complete) break;
    after = batch.at(-1);
  }
  const end = time(to);
  const bounded = inclusiveTo ? rows : rows.filter((row) => !(time(row.recorded_at) >= end));
  return { rows: bounded, complete };
}
