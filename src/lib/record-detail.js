// 轮次详情页的纯逻辑：窗口口径、时长、曲线裁剪、空态文案。
// 与记录页 / 设备首页共用同一套「窗口」定义：已结束 = windowClosedAt（或 windowTo）- windowFrom，进行中 = 现在 - windowFrom。
export const NO_SAMPLE_HINT = '本轮没有可用的设备采样，仅保留喂养事实。';
export const EMPTY_CURVE_COPY = '本轮发酵时间窗内没有有效设备采样，暂无曲线；喂养记录仍会保留。';

/** @returns {{ from: number, to: number, closed: boolean }} to 为 NaN 表示无法确定终点 */
export function roundWindow(summary, record, now = Date.now()) {
  const from = Date.parse(summary?.windowFrom || record?.occurred_at);
  const closed = !!summary?.windowClosed;
  let to = NaN;
  if (closed) to = Date.parse(summary?.windowClosedAt || summary?.windowTo);
  else if (summary?.windowStatus === 'in_progress') to = now;
  return { from, to, closed };
}

// 与记录页一致：不足一小时只写分钟。
export function formatRoundDuration(fromMs, toMs) {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) return '—';
  const minutes = Math.round((toMs - fromMs) / 60000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} 分钟`;
  return m ? `${h} 小时 ${m} 分钟` : `${h} 小时`;
}

// 详情页的「已发酵 / 历时」按窗口计，不用 summary.elapsedHours（它会被设备解绑时间截断，仅用于诊断预填）。
export function roundDurationText(summary, record, now = Date.now()) {
  if (!summary) return '—';
  const { from, to } = roundWindow(summary, record, now);
  return formatRoundDuration(from, to);
}

// 曲线只取本轮窗口内的有效采样：排除传感器故障和非发酵模式（sleep 等），mode 缺省视为正常（与设备首页一致）。
export function clipRoundMeasurements(rows, summary, record, now = Date.now()) {
  const { from, to } = roundWindow(summary, record, now);
  const end = Number.isFinite(to) ? to : now;
  return [...(rows || [])]
    .filter((row) => {
      const at = Date.parse(row?.recorded_at);
      if (!Number.isFinite(at)) return false;
      if (row.sensor_error) return false;
      if (row.mode != null && row.mode !== 'fer') return false;
      if (Number.isFinite(from) && at < from) return false;
      return at <= end;
    })
    .sort((left, right) => Date.parse(left.recorded_at) - Date.parse(right.recorded_at));
}

// 曲线区的提示与空态各只说一次：
// - 读不到证据（含无法核实历史归属）时，只显示这条准确原因，不再声称「没有有效采样」；
// - 有曲线时，提示放在曲线上方；
// - 没曲线也没有特殊原因时，才用通用空态，并略去与之重复的「没有可用采样」提示。
export function curveCopy({ evidence, evidenceError, hint, hasCharts }) {
  const reason = evidenceError || evidence?.unavailableReason || '';
  if (hasCharts) return { hint: hint || '', emptyMessage: '' };
  if (reason) return { hint: '', emptyMessage: reason };
  return { hint: hint === NO_SAMPLE_HINT ? '' : hint || '', emptyMessage: EMPTY_CURVE_COPY };
}
