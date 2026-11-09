// 只做定性判断，数值仍以膨胀率与曲线为准。按 n+2 个点判定：
// 上升 → 高度达到起点 2 倍且最近 n 个点整体上升，进入 pre-peak；
// pre-peak 中连续 2 个点回落，锁定回落前的最高点为 last-peak（Peak）；
// 锁定后再连续 2 个点回落，退出 Peak 进入回落；任何时候创下新高都回到 pre-peak。
export const RISE_RULES = Object.freeze({
  // 高度 / 起点 ≥ 2（含正好 2 倍）。界面「膨胀率」是 (高度 / 起点 - 1) × 100，2 倍即显示 100%。
  prePeakRatio: 2,
  // n：确认「整体上升」的点数，首尾净涨幅需超过 dropMinMm。
  trendPoints: 3,
  lockDrops: 2,
  fallDrops: 2,
  // 比上一个点低出该值才算一次回落，避开传感器毫米以下的抖动。
  dropMinMm: 0.3,
  // 孤立的向上跳点（同时高出前后两点「起点 15% 且至少 3mm」）不参与判定，避免把跳点锁成峰值。
  spikeShare: 0.15,
  spikeMinMm: 3
});

function withoutSpikes(points, baseline, rules) {
  const limit = Math.max(rules.spikeMinMm, baseline * rules.spikeShare);
  return points.filter((point, index) => index === 0 || index === points.length - 1
    || point.v - Math.max(points[index - 1].v, points[index + 1].v) <= limit);
}

/** @param {{ t: number, v: number }[]} samples 按时间升序的有效高度 */
export function risePhase(samples, baselineMm, rules = RISE_RULES) {
  const baseline = Number(baselineMm);
  const valid = (samples || []).filter((point) => Number.isFinite(point?.t) && Number(point.v) > 0).map((point) => ({ t: point.t, v: Number(point.v) }));
  if (!(baseline > 0) || !valid.length) return { phase: null, trendHeightMm: null, highHeightMm: null, peakHeightMm: null, peakAt: null };
  const points = withoutSpikes(valid, baseline, rules);
  let phase = 'rising';
  let high = points[0];
  let peak = null;
  let drops = 0;
  points.forEach((point, index) => {
    const previous = points[index - 1];
    if (peak && point.v > peak.v + rules.dropMinMm) {
      phase = 'pre-peak'; peak = null; drops = 0; high = point;
      return;
    }
    if (point.v > high.v) high = point;
    if (phase === 'rising') {
      const start = points[index - rules.trendPoints + 1];
      if (start && point.v - start.v > rules.dropMinMm && point.v / baseline >= rules.prePeakRatio) phase = 'pre-peak';
      return;
    }
    drops = previous && point.v < previous.v - rules.dropMinMm ? drops + 1 : 0;
    if (phase === 'pre-peak' && drops >= rules.lockDrops) { phase = 'peak'; peak = high; drops = 0; }
    else if (phase === 'peak' && drops >= rules.fallDrops) phase = 'fallen';
  });
  const latest = points.at(-1);
  return {
    phase,
    trendHeightMm: latest.v,
    highHeightMm: high.v,
    peakHeightMm: peak?.v ?? null,
    peakAt: peak ? new Date(peak.t).toISOString() : null
  };
}
