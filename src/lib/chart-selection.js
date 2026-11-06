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
