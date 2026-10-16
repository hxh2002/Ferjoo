import { hasSupabaseConfig, supabase } from '../lib/supabase.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function missingSchema(error) {
  return ['42P01', 'PGRST205', 'PGRST202', '42883'].includes(error?.code);
}

async function context(userId, starterId, deviceId) {
  if (!hasSupabaseConfig || !supabase) throw new Error('设备关联服务尚未配置。');
  if (!UUID_RE.test(userId || '') || !UUID_RE.test(starterId || '')) throw new Error('账号或酵种 ID 格式不正确。');
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (data?.user?.id !== userId) throw new Error('请使用当前登录账号管理设备关联。');
  const starter = await supabase.from('starters').select('id').eq('id', starterId).eq('user_id', userId).single();
  if (starter.error) throw starter.error;
  if (deviceId != null) {
    const member = await supabase.from('device_members').select('device_id').eq('device_id', deviceId).eq('user_id', userId).single();
    if (member.error) throw member.error;
  }
  return supabase;
}

function key(userId, starterId) {
  return `ferjoo:starter-device:${userId}:${starterId}`;
}

function localHistory(userId, starterId) {
  const value = JSON.parse(globalThis.localStorage.getItem(key(userId, starterId)) || '[]');
  if (!Array.isArray(value)) throw new Error('本机关联记录格式已过期，请重新关联设备。');
  return value.map((row) => ({ ...row, source: 'local', storage_source: 'local', local_only: true }));
}

function accountLocalHistory(userId) {
  const prefix = `ferjoo:starter-device:${userId}:`;
  const rows = [];
  for (const storageKey of Object.keys(globalThis.localStorage)) {
    if (!storageKey.startsWith(prefix)) continue;
    const value = JSON.parse(globalThis.localStorage.getItem(storageKey) || '[]');
    if (!Array.isArray(value)) throw new Error('本机关联记录格式已过期，请重新关联设备。');
    rows.push(...value);
  }
  return rows.map((row) => ({ ...row, source: 'local', storage_source: 'local', local_only: true }));
}

export async function listStarterDeviceLinks({ userId, starterId } = {}) {
  if (starterId == null) {
    if (!UUID_RE.test(userId || '')) throw new Error('账号 ID 格式不正确。');
    if (!hasSupabaseConfig || !supabase) return accountLocalHistory(userId);
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (authData?.user?.id !== userId) throw new Error('请使用当前登录账号查看设备关联。');
    const { data, error } = await supabase.from('starter_device_links').select('*')
      .eq('user_id', userId).order('active_from', { ascending: false });
    if (error) {
      if (missingSchema(error)) return accountLocalHistory(userId);
      throw error;
    }
    return (data || []).map((row) => ({ ...row, source: 'cloud', storage_source: 'cloud', local_only: false }));
  }
  const client = await context(userId, starterId);
  const { data, error } = await client.from('starter_device_links').select('*')
    .eq('user_id', userId).eq('starter_id', starterId).order('active_from', { ascending: false });
  if (error) {
    if (missingSchema(error)) return localHistory(userId, starterId);
    throw error;
  }
  return (data || []).map((row) => ({ ...row, source: 'cloud', storage_source: 'cloud', local_only: false }));
}

export async function getStarterDeviceLink({ userId, starterId }) {
  const rows = await listStarterDeviceLinks({ userId, starterId });
  return rows.find((row) => row.active_to == null) || null;
}

export async function linkStarterDevice({ userId, starterId, deviceId }) {
  if (deviceId !== null && (typeof deviceId !== 'string' || !deviceId.trim())) throw new Error('请选择有效设备。');
  const client = await context(userId, starterId, deviceId);
  const { data, error } = await client.rpc('link_starter_device', { p_starter_id: starterId, p_device_id: deviceId });
  if (!error) {
    const row = Array.isArray(data) ? data[0] : data;
    return row ? { ...row, source: 'cloud', storage_source: 'cloud', local_only: false } : null;
  }
  if (!missingSchema(error)) throw error;
  const rows = localHistory(userId, starterId);
  const current = rows.find((row) => row.active_to == null);
  if (current?.device_id === deviceId) return current;
  const now = new Date().toISOString();
  const prefix = `ferjoo:starter-device:${userId}:`;
  // Keep closed periods when switching a device to another starter on this account.
  for (const storageKey of Object.keys(globalThis.localStorage)) {
    if (!storageKey.startsWith(prefix)) continue;
    const otherId = storageKey.slice(prefix.length);
    const history = otherId === starterId ? rows : localHistory(userId, otherId);
    for (const row of history) {
      if (row.active_to == null && (otherId === starterId || row.device_id === deviceId)) row.active_to = now;
    }
    globalThis.localStorage.setItem(storageKey, JSON.stringify(history));
  }
  if (deviceId === null) return null;
  const row = { user_id: userId, starter_id: starterId, device_id: deviceId, active_from: now, active_to: null, created_at: now,
    source: 'local', storage_source: 'local', local_only: true };
  rows.unshift(row);
  globalThis.localStorage.setItem(key(userId, starterId), JSON.stringify(rows));
  return row;
}
