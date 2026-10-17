// 涨幅区间以“最新高度 / 起始高度”的倍率划分，与诊断选项一一对应。
// 边界只定义一次，诊断预填与摘要计算共用，避免两处判断不一致。
export const HEIGHT_BANDS = [
  { value: 'none', label: '几乎没涨', maxRatio: 1.1, range: '≤ 1.10 倍' },
  { value: 'slight', label: '轻微上涨', maxRatio: 1.75, range: '1.10–1.75 倍' },
  { value: 'near', label: '接近翻倍', maxRatio: 2, range: '1.75–2.00 倍' },
  { value: 'double', label: '约 2 倍', maxRatio: 3, range: '2.00–3.00 倍' },
  { value: 'over3', label: '超过 3 倍', maxRatio: Infinity, range: '> 3.00 倍' },
];

export function heightBand(baselineHeightMm, currentHeightMm) {
  const baseline = Number(baselineHeightMm);
  const current = Number(currentHeightMm);
  if (!(baseline > 0) || !(current > 0)) return null;
  const ratio = current / baseline;
  let index = 0;
  if (ratio > 1.1) index = 1;
  if (ratio >= 1.75) index = 2;
  if (ratio >= 2) index = 3;
  if (ratio > 3) index = 4;
  return { ...HEIGHT_BANDS[index], ratio, expansionPercent: (ratio - 1) * 100, baselineHeightMm: baseline, currentHeightMm: current };
}
