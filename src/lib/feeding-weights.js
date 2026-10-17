// 喂养重量换算：比例顺序为 老种 : 水 : 面粉；填任一项或合计，按同一比例推算其余三项。
export const weightFields = ['starter', 'water', 'flour', 'total'];

export function ratioParts(ratio) {
  if (typeof ratio !== 'string') return null;
  const parts = ratio.split(':').map((part) => Number(part.trim()));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part) || part <= 0)) return null;
  return { starter: parts[0], water: parts[1], flour: parts[2], total: parts.reduce((sum, part) => sum + part, 0) };
}

// 返回四项克重（保留一位小数）；比例不可解析、字段不合法或数值不为正时返回 null，不猜测。
export function computeWeights(ratio, field, rawValue) {
  const parts = ratioParts(ratio);
  const value = Number(rawValue);
  if (!parts || !weightFields.includes(field) || rawValue === '' || rawValue == null || !Number.isFinite(value) || value <= 0) return null;
  const unit = value / parts[field];
  const grams = (number) => Math.round(number * 10) / 10;
  return { starter: grams(unit * parts.starter), water: grams(unit * parts.water), flour: grams(unit * parts.flour), total: grams(unit * parts.total) };
}
