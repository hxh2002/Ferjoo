import { hasSupabaseConfig, supabase } from '../lib/supabase.js';

function requireClient() {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error('Supabase 尚未配置。');
  }
  return supabase;
}

export function toTenMinuteBucket(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const bucketMs = 10 * 60 * 1000;
  return new Date(Math.floor(date.getTime() / bucketMs) * bucketMs).toISOString();
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

export async function listMeasurements(deviceId, { limit = 120, from, to } = {}) {
  const client = requireClient();
  let query = client
    .from('device_measurements')
    .select('*')
    .eq('device_id', deviceId)
    .order('recorded_at', { ascending: false })
    .limit(limit);
  if (from) query = query.gte('recorded_at', from);
  if (to) query = query.lte('recorded_at', to);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
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
