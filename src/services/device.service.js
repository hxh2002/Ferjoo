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
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createDevice({ name }) {
  const client = requireClient();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error('请先登录。');

  const { data, error } = await client
    .from('devices')
    .insert({ owner_id: authData.user.id, name: name?.trim() || 'Ferjoo Sensor' })
    .select()
    .single();
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
    .upsert(payload, { onConflict: 'device_id,bucket_start' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

function finiteOrNull(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
