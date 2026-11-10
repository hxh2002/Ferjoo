import { heightBand } from '../lib/height-band.js';
import { risePhase } from '../lib/rise-phase.js';
import { READ_MESSAGES, classifyReadError } from '../lib/read-errors.js';
import { coverageGaps, linkCoveringInstant, readPlans, rowInWindows, starterWindows, windowsOverlapping } from '../lib/starter-link-windows.js';
import { roundDeviceWindows } from '../lib/round-device-attribution.js';

// 起始基线取本轮最早的 5 个采样点：首个有效高度即可用，收满 5 个点后用 MAD 剔除离群值再冻结。
const BASELINE_POINTS = 5;
const BASELINE_MIN = 3;
const FRESH_MS = 40 * 60 * 1000;
const MAX_FEEDING_ROWS = 40000;
const time = (value) => value == null || value === '' ? NaN : new Date(value).getTime();
const number = (value) => value == null || value === '' || typeof value === 'boolean' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
export function expansionPercentFrom(heightMm, baselineMm) {
  const height = Number(heightMm);
  const baseline = Number(baselineMm);
  return baseline > 0 && height > 0 ? (height / baseline - 1) * 100 : null;
}
export function expansionSeries(points, baselineMm) {
  return (points || []).map((point) => ({ t: point.t, v: expansionPercentFrom(point.v, baselineMm) }));
}
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * 喂养轮次摘要。设备归属取该酵种的「全部历史关联窗口」：
 * - links：该酵种全部关联（含已关闭窗口），轮次期间任何一段窗口内、且设备一致的读数都计入；
 * - link：兼容旧调用，只给一条关联时等价于 links=[link]。
 * 窗口可以晚于喂养时刻开始（重绑后继续的同一轮），但这时起始基线不再代表真实起点，会标记 coverageStartsLate。
 * @param {{ measurements?: any[], feeding?: any, link?: any, links?: any[], now?: number, nextFeedingAt?: any, windowEndedAt?: any }} [options]
 */
export function summarizeFeedingMeasurements({ measurements = [], feeding, link, links, now = Date.now(), nextFeedingAt, windowEndedAt } = {}) {
  const fedAt = time(feeding?.occurred_at);
  const currentTime = time(now);
  const nextAt = time(nextFeedingAt);
  const manualAt = time(windowEndedAt);
  // 业务结束点只来自下一次喂养或用户手动结束；设备断线只缩短可观测范围，不结束本轮。
  const scheduledEnd = Number.isFinite(nextAt) && Number.isFinite(fedAt) && nextAt >= fedAt ? nextAt : NaN;
  const manualEnd = Number.isFinite(manualAt) && Number.isFinite(fedAt) && manualAt >= fedAt ? Math.min(manualAt, currentTime) : NaN;
  const closedAt = Math.min(Number.isFinite(scheduledEnd) ? scheduledEnd : Infinity, Number.isFinite(manualEnd) ? manualEnd : Infinity);
  const windowClosed = Number.isFinite(closedAt) && closedAt <= currentTime;
  const windowEndReason = !windowClosed ? null
    : Number.isFinite(manualEnd) && (!Number.isFinite(scheduledEnd) || manualEnd <= scheduledEnd) ? 'manual' : 'next_feeding';
  const roundEnd = Math.min(currentTime, Number.isFinite(closedAt) ? closedAt : Infinity);
  const allWindows = starterWindows(Array.isArray(links) && links.length ? links : link ? [link] : [], { starterId: feeding?.starter_id ?? null });
  // 只保留与本轮 [喂养时刻, 轮次终点] 有交集的窗口：别的时段的关联与本轮无关。
  const windows = Number.isFinite(fedAt) && Number.isFinite(roundEnd) ? windowsOverlapping(allWindows, fedAt, roundEnd) : [];
  const matches = windows.length > 0;
  const lastWindowEnd = matches ? Math.max(...windows.map((window) => window.to)) : NaN;
  const unlinkedAt = Number.isFinite(lastWindowEnd) ? lastWindowEnd : NaN;
  const end = Math.min(currentTime, Number.isFinite(closedAt) ? closedAt : Infinity, Number.isFinite(unlinkedAt) ? unlinkedAt : Infinity);
  const coverage = matches ? coverageGaps(windows, fedAt, end) : { gaps: [], gapMs: 0, firstCoveredAt: null };
  // 第一段关联晚于喂养超过 40 分钟：起始高度已不是真实起点，膨胀率只能参考。
  const coverageStartsLate = matches && Number.isFinite(coverage.firstCoveredAt) && coverage.firstCoveredAt - fedAt > FRESH_MS;
  const coverageBroken = matches && coverage.gapMs > FRESH_MS;
  const inWindow = (row) => {
    const at = time(row.recorded_at);
    return at >= fedAt && at <= currentTime && at < (Number.isFinite(closedAt) ? closedAt : Infinity) && rowInWindows(row, windows);
  };
  const scoped = matches ? measurements.filter(inWindow).sort((a, b) => time(a.recorded_at) - time(b.recorded_at)) : [];
  const rows = scoped.filter((row) => row.mode === 'fer' && !row.sensor_error);
  const heights = rows.filter((row) => number(row.height_mm) > 0);
  // 基线从本轮最早的采样点开始累计：首个有效高度立即可用，收满五个点后做一次 MAD 复核再冻结。
  const startPoints = scoped.slice(0, BASELINE_POINTS);
  const validStart = startPoints
    .map((row) => ({ row, value: number(row.height_mm) }))
    .filter(({ row, value }) => row.mode === 'fer' && !row.sensor_error && value > 0);
  // 本轮结束或设备关联失效后不再有新点，此时才允许判定点数不足。
  const scanComplete = startPoints.length >= BASELINE_POINTS || windowClosed
    || (Number.isFinite(unlinkedAt) && unlinkedAt <= currentTime);
  const startValues = validStart.map(({ value }) => value);
  // 离群值只在收满五个点后判定：中位数中心 + MAD 阈值，最多剔除到只剩三个有效点。
  let excludedStart = [];
  if (scanComplete && startValues.length > BASELINE_MIN) {
    const center = median(startValues);
    const mad = median(startValues.map((value) => Math.abs(value - center)));
    const threshold = Math.max(5, center * 0.25, 3 * 1.4826 * mad);
    const removable = Math.min(2, startValues.length - BASELINE_MIN);
    excludedStart = startValues.map((value, index) => ({ index, distance: Math.abs(value - center) }))
      .filter(({ distance }) => distance > threshold).sort((a, b) => b.distance - a.distance)
      .slice(0, removable).map(({ index }) => index);
  }
  const retainedStart = validStart.filter((_, index) => !excludedStart.includes(index));
  // 有效点不足三个时，退回前五个点里的最低点：宁可低估起点，也不要漏报膨胀。
  const baselineFallback = scanComplete && retainedStart.length < BASELINE_MIN && startValues.length > 0;
  const automaticBaseline = baselineFallback ? Math.min(...startValues)
    : retainedStart.length ? mean(retainedStart.map(({ value }) => value)) : null;
  const manualBaseline = feeding?.input?.baseline_source === 'manual' ? number(feeding.input.baseline_height_mm) : null;
  const baselineHeightMm = manualBaseline > 0 ? manualBaseline : automaticBaseline;
  const baselineSource = manualBaseline > 0 ? 'manual'
    : automaticBaseline == null ? null
      : baselineFallback ? 'sensor-min' : 'sensor-mean';
  const baselinePending = Number.isFinite(fedAt) && Number.isFinite(currentTime) && currentTime >= fedAt
    && !(manualBaseline > 0) && automaticBaseline == null && !scanComplete
    && (!Number.isFinite(manualEnd) || currentTime < manualEnd);
  const baselineIncomplete = !(manualBaseline > 0) && automaticBaseline != null
    && (!scanComplete || baselineFallback || coverageStartsLate);
  // 当前高度取最近一次有效读数：首个基线点即为 0%，之后缺测也沿用上一个点算出的膨胀率。
  const freshest = heights.at(-1);
  const freshestAt = time(freshest?.recorded_at);
  const historicalRound = windowClosed;
  const heightStale = !!freshest && (historicalRound ? end - freshestAt > FRESH_MS : currentTime - freshestAt > FRESH_MS);
  const currentHeightMm = number(freshest?.height_mm);
  const expansionPercent = expansionPercentFrom(currentHeightMm, baselineHeightMm);
  // 只映射实测涨幅；峰值、回落或液层需要用户确认。
  const height = heightBand(baselineHeightMm, currentHeightMm)?.value || '';
  // 上涨/到顶/回落只给设备页做定性展示，不回填诊断里需要用户确认的「回落」。
  const rise = risePhase(heights.map((row) => ({ t: time(row.recorded_at), v: number(row.height_mm) })), baselineHeightMm);
  const temperatureRows = rows.filter((row) => number(row.temperature_c) != null);
  const temperatures = temperatureRows.map((row) => number(row.temperature_c));
  const latestTemperature = temperatureRows.at(-1);
  const temperatureStale = !!latestTemperature
    && (historicalRound ? end - time(latestTemperature.recorded_at) > FRESH_MS : currentTime - time(latestTemperature.recorded_at) > FRESH_MS);
  const meanTempC = mean(temperatures);
  // 轮次均温用于估时必须覆盖起点、终点及中间区间，任一缺口不得超过 40 分钟。
  const temperatureCoverageReliable = temperatureRows.length > 0 && end >= fedAt
    && time(temperatureRows[0].recorded_at) - fedAt <= FRESH_MS
    && end - time(latestTemperature.recorded_at) <= FRESH_MS
    && temperatureRows.every((row, index) => !index || time(row.recorded_at) - time(temperatureRows[index - 1].recorded_at) <= FRESH_MS);
  // 窗口状态与设备观测状态分开：设备缺测只降低数据质量，不结束本轮。
  const windowStatus = !Number.isFinite(fedAt) ? 'not_started' : windowClosed ? 'closed' : 'in_progress';
  const baselineStatus = !Number.isFinite(fedAt) ? null
    : manualBaseline > 0 ? 'manual'
      : automaticBaseline != null ? 'established'
        : baselinePending ? 'pending' : 'insufficient';
  const dataQuality = !Number.isFinite(fedAt) ? null
    : !matches || !heights.length ? 'insufficient'
      : baselineHeightMm == null ? (baselinePending ? 'partial' : 'insufficient')
        : heightStale ? 'stale'
          : baselineIncomplete || coverageBroken ? 'partial' : 'complete';
  return {
    baselineHeightMm, baselinePending, baselineSource, expansionPercent, height, currentHeightMm,
    tempC: temperatureStale || !temperatureCoverageReliable ? null : meanTempC, meanTempC, temperatureCoverageReliable, heightStale, temperatureStale, staleEvidence: heightStale || temperatureStale,
    elapsedHours: Number.isFinite(fedAt) && end >= fedAt ? (end - fedAt) / 3600000 : null,
    measurementCount: rows.length, heightCount: heights.length, temperatureCount: temperatures.length,
    baselineSampleCount: startPoints.length, baselineUsedCount: baselineFallback ? 0 : retainedStart.length, baselineExcludedCount: excludedStart.length,
    latestMeasurementAt: freshest?.recorded_at || null,
    latestTemperatureAt: latestTemperature?.recorded_at || null,
    historicalRound, windowStatus, windowActive: Number.isFinite(fedAt) && !windowClosed, windowClosed,
    windowFrom: Number.isFinite(fedAt) ? new Date(fedAt).toISOString() : null,
    windowTo: Number.isFinite(end) && Number.isFinite(fedAt) && end >= fedAt ? new Date(end).toISOString() : null,
    windowClosedAt: windowClosed ? new Date(closedAt).toISOString() : null,
    windowEndReason, nextFeedingAt: Number.isFinite(scheduledEnd) ? new Date(scheduledEnd).toISOString() : null,
    baselineStatus, dataQuality, baselineIncomplete,
    linkedWindowCount: windows.length, coverageGapMs: coverage.gapMs, coverageStartsLate, coverageBroken,
    risePhase: rise.phase, trendHeightMm: rise.trendHeightMm, highHeightMm: rise.highHeightMm, peakHeightMm: rise.peakHeightMm, peakAt: rise.peakAt,
  };
}

/**
 * 读取一轮喂养的设备证据。设备归属取该酵种的全部历史关联窗口（含已关闭窗口）：
 * 轮次期间每一段窗口各读一次（只读该酵种自己的时段），再按窗口过滤，别的酵种占用的时段不会混入。
 * 读取失败时降级：登录过期直接抛出（需要重新登录）；无权限（已退出共享且 RPC 不可用）给出 unavailableReason。
 */
export async function loadFeedingEvidence(userId, starterId, feedingId) {
  const [{ getCareRecord, listCareRecords }, { listStarterDeviceLinks }, { listMeasurementsRange }, { loadWindowClosure }] = await Promise.all([
    import('./care.service.js'), import('./starter-device.service.js'), import('./device.service.js'),
    import('./fermentation-window.service.js'),
  ]);
  const feeding = await getCareRecord(feedingId, { userId });
  if (feeding.kind !== 'feeding' || feeding.starter_id !== starterId) throw new Error('喂养记录与当前酵种不匹配。');
  const now = Date.now();
  // 关联只是设备可用范围；同账号全部喂养用于判断共享设备何时被另一酵种的轮次接管。
  const [links, feedings] = await Promise.all([
    listStarterDeviceLinks({ userId }),
    listCareRecords({ userId, kind: 'feeding' })
  ]);
  const closure = await loadWindowClosure(userId, feedingId).catch(() => null);
  const fedAt = time(feeding.occurred_at);
  const nextFeedingAt = feedings
    .filter((row) => row.starter_id === starterId && time(row.occurred_at) > fedAt)
    .sort((a, b) => time(a.occurred_at) - time(b.occurred_at))[0]?.occurred_at || null;
  const manualAt = time(closure?.ended_at);
  const end = Math.min(now, nextFeedingAt ? time(nextFeedingAt) - 1 : Infinity, Number.isFinite(manualAt) && manualAt >= fedAt ? manualAt : Infinity);
  const windows = roundDeviceWindows(links, { feeding, feedings, nextFeedingAt, windowEndedAt: closure?.ended_at, now });
  const link = linkCoveringInstant(links, fedAt, { starterId }) || windows[0] || null;
  let measurements = [];
  let readNotice = '';
  let unavailableReason = !windows.length ? '本轮没有可核实的设备归属，未使用其他酵种轮次的读数。' : '';
  if (windows.length && end >= fedAt) {
    const plans = readPlans(windows, { from: fedAt, to: end + 1 });
    const settled = await Promise.allSettled(plans.map((plan) => listMeasurementsRange(plan.deviceId, { from: plan.from, to: plan.to, bucketed: false, starterId })));
    const denied = [];
    settled.forEach((outcome, index) => {
      if (outcome.status === 'fulfilled') {
        measurements.push(...outcome.value.filter((row) => {
          const at = time(row.recorded_at);
          return windows.some((window) => window.deviceId === plans[index].deviceId && at >= window.from && at < window.to);
        }).map((row) => ({ ...row, device_id: row.device_id || plans[index].deviceId })));
        return;
      }
      const kind = classifyReadError(outcome.reason);
      if (kind === 'auth') throw new Error(READ_MESSAGES.authExpired);
      if (kind !== 'denied') throw outcome.reason;
      denied.push(plans[index]);
    });
    if (denied.length === plans.length) unavailableReason = READ_MESSAGES.deniedHistory;
    else if (denied.length) readNotice = '部分关联时段的设备读数无权读取，曲线只包含已读到的时段。';
    measurements.sort((a, b) => time(a.recorded_at) - time(b.recorded_at));
    if (measurements.length >= 40000) throw new Error('测量记录达到 40000 行，结果可能不完整，请缩短查询范围后重试。');
  }
  const summary = summarizeFeedingMeasurements({ measurements, feeding, links: windows, now, nextFeedingAt, windowEndedAt: closure?.ended_at });
  return { feeding, link, links: windows, measurements, nextFeedingAt, now, closure, summary, unavailableReason, readNotice };
}
