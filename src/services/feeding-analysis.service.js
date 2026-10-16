const BASELINE_MS = 50 * 60 * 1000;
const FRESH_MS = 40 * 60 * 1000;
const MAX_FEEDING_ROWS = 40000;
const time = (value) => value == null || value === '' ? NaN : new Date(value).getTime();
const number = (value) => value == null || value === '' || typeof value === 'boolean' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function summarizeFeedingMeasurements({ measurements = [], feeding, link, now = Date.now(), nextFeedingAt } = {}) {
  const fedAt = time(feeding?.occurred_at);
  const currentTime = time(now);
  const nextAt = time(nextFeedingAt);
  const linkedAt = time(link?.active_from);
  const unlinkedAt = time(link?.active_to);
  const matches = !!link?.device_id && Number.isFinite(fedAt) && Number.isFinite(linkedAt)
    && linkedAt <= fedAt && (!Number.isFinite(unlinkedAt) || fedAt < unlinkedAt)
    && (!link.starter_id || link.starter_id === feeding?.starter_id);
  const end = Math.min(currentTime, Number.isFinite(nextAt) ? nextAt : Infinity, Number.isFinite(unlinkedAt) ? unlinkedAt : Infinity);
  const rows = matches ? measurements.filter((row) => {
    const at = time(row.recorded_at);
    return at >= fedAt && at >= linkedAt && at <= currentTime && at < (Number.isFinite(nextAt) ? nextAt : Infinity)
      && at < (Number.isFinite(unlinkedAt) ? unlinkedAt : Infinity)
      && (!row.device_id || row.device_id === link.device_id) && row.mode === 'fer' && !row.sensor_error;
  }).sort((a, b) => time(a.recorded_at) - time(b.recorded_at)) : [];
  const heights = rows.filter((row) => number(row.height_mm) > 0);
  const baselineRows = heights.filter((row) => time(row.recorded_at) <= fedAt + BASELINE_MS);
  const values = baselineRows.map((row) => number(row.height_mm));
  let excluded = [];
  if (values.length >= 3) {
    const center = median(values);
    const mad = median(values.map((value) => Math.abs(value - center)));
    const threshold = Math.max(5, center * 0.25, 3 * 1.4826 * mad);
    excluded = values.map((value, index) => ({ index, distance: Math.abs(value - center) }))
      .filter(({ distance }) => distance > threshold).sort((a, b) => b.distance - a.distance).slice(0, 2).map(({ index }) => index);
  }
  const retained = values.filter((_, index) => !excluded.includes(index));
  const automaticBaseline = retained.length >= 3 ? mean(retained) : null;
  const manualBaseline = feeding?.input?.baseline_source === 'manual' ? number(feeding.input.baseline_height_mm) : null;
  const baselineHeightMm = manualBaseline > 0 ? manualBaseline : automaticBaseline;
  const baselineSource = manualBaseline > 0 ? 'manual' : automaticBaseline != null ? 'sensor-window' : null;
  const baselinePending = Number.isFinite(fedAt) && Number.isFinite(currentTime) && currentTime >= fedAt && currentTime < fedAt + BASELINE_MS
    && (!Number.isFinite(nextAt) || currentTime < nextAt) && (!Number.isFinite(unlinkedAt) || currentTime < unlinkedAt);
  const latest = heights.filter((row) => time(row.recorded_at) > fedAt + BASELINE_MS).at(-1);
  const latestAt = time(latest?.recorded_at);
  const historicalRound = Number.isFinite(nextAt) && nextAt <= currentTime;
  const heightStale = !!latest && !historicalRound && Number.isFinite(currentTime) && currentTime - latestAt > FRESH_MS;
  const currentHeightMm = latest && !heightStale ? number(latest.height_mm) : null;
  const expansionPercent = baselineHeightMm > 0 && currentHeightMm != null ? (currentHeightMm / baselineHeightMm - 1) * 100 : null;
  // 只映射实测涨幅；峰值、回落或液层需要用户确认。
  const height = expansionPercent == null ? '' : expansionPercent > 200 ? 'over3' : expansionPercent >= 100 ? 'double' : expansionPercent >= 75 ? 'near' : expansionPercent > 10 ? 'slight' : 'none';
  const temperatureRows = rows.filter((row) => number(row.temperature_c) != null);
  const temperatures = temperatureRows.map((row) => number(row.temperature_c));
  const latestTemperature = temperatureRows.at(-1);
  const temperatureStale = !!latestTemperature && !historicalRound && Number.isFinite(currentTime)
    && currentTime - time(latestTemperature.recorded_at) > FRESH_MS;
  const meanTempC = mean(temperatures);
  // 轮次均温用于估时必须覆盖起点、终点及中间区间，任一缺口不得超过 40 分钟。
  const temperatureCoverageReliable = temperatureRows.length > 0 && end >= fedAt
    && time(temperatureRows[0].recorded_at) - fedAt <= FRESH_MS
    && end - time(latestTemperature.recorded_at) <= FRESH_MS
    && temperatureRows.every((row, index) => !index || time(row.recorded_at) - time(temperatureRows[index - 1].recorded_at) <= FRESH_MS);
  return {
    baselineHeightMm, baselinePending, baselineSource, expansionPercent, height, currentHeightMm,
    tempC: temperatureStale || !temperatureCoverageReliable ? null : meanTempC, meanTempC, temperatureCoverageReliable, heightStale, temperatureStale, staleEvidence: heightStale || temperatureStale,
    elapsedHours: Number.isFinite(fedAt) && end >= fedAt ? (end - fedAt) / 3600000 : null,
    measurementCount: rows.length, heightCount: heights.length, temperatureCount: temperatures.length,
    baselineSampleCount: values.length, baselineUsedCount: retained.length, baselineExcludedCount: excluded.length,
    latestMeasurementAt: latest?.recorded_at || null,
    latestTemperatureAt: latestTemperature?.recorded_at || null,
    historicalRound, windowFrom: matches ? new Date(fedAt).toISOString() : null,
    windowTo: matches && Number.isFinite(end) && end >= fedAt ? new Date(end).toISOString() : null,
    baselineWindowTruncated: Number.isFinite(fedAt) && end < fedAt + BASELINE_MS,
  };
}

export async function loadFeedingEvidence(userId, starterId, feedingId) {
  const [{ getCareRecord, listCareRecords }, { listStarterDeviceLinks }, { listMeasurementsRange }] = await Promise.all([
    import('./care.service.js'), import('./starter-device.service.js'), import('./device.service.js'),
  ]);
  const feeding = await getCareRecord(feedingId, { userId });
  if (feeding.kind !== 'feeding' || feeding.starter_id !== starterId) throw new Error('喂养记录与当前酵种不匹配。');
  const now = Date.now();
  const links = await listStarterDeviceLinks({ userId, starterId });
  const fedAt = time(feeding.occurred_at);
  const link = links.find((row) => time(row.active_from) <= fedAt && (row.active_to == null || fedAt < time(row.active_to))) || null;
  let nextFeedingAt = null;
  for (let offset = 0; ; offset += 200) {
    const records = await listCareRecords({ userId, starterId, kind: 'feeding', from: feeding.occurred_at, to: new Date(now + 1).toISOString(), limit: 200, offset });
    for (const row of records) {
      if (row.id !== feeding.id && time(row.occurred_at) >= fedAt && (!nextFeedingAt || time(row.occurred_at) < time(nextFeedingAt))) nextFeedingAt = row.occurred_at;
    }
    if (records.length < 200) break;
    if (offset + records.length >= MAX_FEEDING_ROWS) throw new Error('喂养记录超过 40000 行，请缩短查询范围后重试。');
  }
  let measurements = [];
  let unavailableReason = !link ? '喂养时没有可核实的设备关联，未使用其他关联的读数。' : '';
  // 当前设备权限不能证明原始历史读数在当时的归属。
  if (link?.active_to != null) unavailableReason = '这段设备关联已经结束，现有权限无法核实历史读数归属，请手工确认。';
  if (link && !unavailableReason) {
    const end = Math.min(now, nextFeedingAt ? time(nextFeedingAt) - 1 : Infinity);
    if (end >= fedAt) measurements = await listMeasurementsRange(link.device_id, { from: new Date(fedAt).toISOString(), to: new Date(end).toISOString(), bucketed: false });
    if (measurements.length >= 40000) throw new Error('测量记录达到 40000 行，结果可能不完整，请缩短查询范围后重试。');
  }
  const summary = summarizeFeedingMeasurements({ measurements, feeding, link, now, nextFeedingAt });
  return { feeding, link, measurements, nextFeedingAt, now, summary, unavailableReason };
}
