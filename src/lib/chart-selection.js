export const CHART_GAP_MS = 30 * 60 * 1000;
export const CHART_RELEASE_MS = 1200;

// 有限采样按空值和超时断开。调用方传入的空值必须留在序列里，否则短空档仍会被连上。
export function chartSegments(points, gapMs = CHART_GAP_MS) {
  const sorted = (points || [])
    .filter((point) => Number.isFinite(Date.parse(point?.t)))
    .slice()
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const segments = [];
  let current = [];
  let previousTime = null;
  let skippedNull = false;
  for (const point of sorted) {
    if (!Number.isFinite(point?.v)) {
      if (current.length) skippedNull = true;
      continue;
    }
    const time = Date.parse(point.t);
    if (current.length && (skippedNull || (previousTime != null && time - previousTime > gapMs))) {
      segments.push(current);
      current = [];
    }
    skippedNull = false;
    previousTime = time;
    current.push(point);
  }
  if (current.length) segments.push(current);
  return segments;
}

export function moveSampleIndex(current, length, key) {
  if (!length) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  if (key === 'ArrowRight') return Math.min(length - 1, current == null ? 0 : current + 1);
  if (key === 'ArrowLeft') return Math.max(0, current == null ? 0 : current - 1);
  return null;
}

// 把指针在绘图区的横向比例吸附到最近的有效采样。空值不参与吸附。
export function nearestSampleIndex(samples, ratio) {
  const usable = (samples || [])
    .map((sample, index) => ({ sample, index }))
    .filter(({ sample }) => Number.isFinite(sample?.x) && Number.isFinite(sample?.v));
  if (!usable.length || !Number.isFinite(Number(ratio))) return null;
  const xs = usable.map(({ sample }) => sample.x);
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const clamped = Math.min(1, Math.max(0, Number(ratio)));
  const target = min + (max - min) * clamped;
  return usable.reduce((best, item) => (
    Math.abs(item.sample.x - target) < Math.abs(best.sample.x - target) ? item : best
  )).index;
}
