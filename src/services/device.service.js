import { requireSupabase } from '../lib/supabase.js';

function cleanNumber(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function toTenMinuteBucket(value) {
  const date = value ? new Date(value) : new Date();
  const bucketMs = Math.floor(date.getTime() / 600_000) * 600_000;
  return new Date(bucketMs).toISOString();
}

export async function listDevices() {
  const client = requireSupabase();
  const { data, error } = await client
    .from('devices')
    .select('device_id, name, model, firmware_version, last_seen_at, created_at')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createDevice({ deviceId, name, model = '', firmwareVersion = '' }) {
  const client = requireSupabase();
  const { data, error } = await client
    .from('devices')
    .insert({
      device_id: deviceId.trim(),
      name: name.trim() || null,
      model: model.trim() || null,
      firmware_version: firmwareVersion.trim() || null
    })
    .select('device_id, name, model, firmware_version, last_seen_at, created_at')
    .single();

  if (error) throw error;
  return data;
}

export async function listMeasurements(deviceId, { limit = 200, from = null, to = null } = {}) {
  const client = requireSupabase();
  let query = client
    .from('device_measurements')
    .select('id, device_id, recorded_at, bucket_start, temperature_c, height_mm, height_delta_mm, humidity_percent, battery_percent, payload')
    .eq('device_id', deviceId)
    .order('bucket_start', { ascending: false })
    .limit(limit);

  if (from) query = query.gte('bucket_start', new Date(from).toISOString());
  if (to) query = query.lte('bucket_start', new Date(to).toISOString());

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function addMeasurement({
  deviceId,
  recordedAt,
  temperatureC,
  heightMm,
  heightDeltaMm,
  humidityPercent,
  batteryPercent,
  payload = {}
}) {
  const client = requireSupabase();
  const { data, error } = await client
    .from('device_measurements')
    .insert({
      device_id: deviceId,
      recorded_at: toTenMinuteBucket(recordedAt),
      temperature_c: cleanNumber(temperatureC),
      height_mm: cleanNumber(heightMm),
      height_delta_mm: cleanNumber(heightDeltaMm),
      humidity_percent: cleanNumber(humidityPercent),
      battery_percent: cleanNumber(batteryPercent),
      payload
    })
    .select('id, device_id, recorded_at, bucket_start, temperature_c, height_mm, height_delta_mm, humidity_percent, battery_percent, payload')
    .single();

  if (error) throw error;
  return data;
}
