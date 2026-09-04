export const STAGES = [
  { value: 'mature', label: '成熟酵种', aliases: ['成熟', '稳定成熟', 'mature'] },
  { value: 'start_d1', label: '新起种 · 第 1 天', aliases: ['第一天', '第1天', 'd1', 'day 1'] },
  { value: 'start_active', label: '新起种 · 活跃期', aliases: ['活跃期', '假活跃', 'active'] },
  { value: 'start_stable', label: '新起种 · 稳定期', aliases: ['稳定期', '逐渐稳定', 'stable'] },
  { value: 'revive', label: '复苏中', aliases: ['复苏', '唤醒', 'revive'] },
  { value: 'fridge', label: '冷藏维护', aliases: ['冷藏', '冰箱', 'fridge'] }
];

export const RATIOS = [
  { value: '1:1:1', label: '1 : 1 : 1', aliases: ['1:1:1', '111'] },
  { value: '1:2:2', label: '1 : 2 : 2', aliases: ['1:2:2', '122'] },
  { value: '1:3:3', label: '1 : 3 : 3', aliases: ['1:3:3', '133'] },
  { value: '1:5:5', label: '1 : 5 : 5', aliases: ['1:5:5', '155'] },
  { value: 'deep_reset', label: '大比例刷新', aliases: ['大比例', '深度刷新', 'deep reset'] },
  { value: '1:2:1', label: '1 : 2 : 1', aliases: ['1:2:1', '121'] }
];

export const HEIGHTS = [
  { value: 'none', label: '几乎没涨', aliases: ['没涨', '不涨', '无变化', 'none'] },
  { value: 'slight', label: '轻微上涨', aliases: ['轻微', '一点点', 'slight'] },
  { value: 'near', label: '接近翻倍', aliases: ['接近翻倍', '快翻倍', 'near'] },
  { value: 'double', label: '约 2 倍', aliases: ['翻倍', '2倍', 'double'] },
  { value: 'peak_plus', label: '峰值超过 2 倍', aliases: ['超过2倍', '峰值', 'peak'] },
  { value: 'over3', label: '超过 3 倍', aliases: ['3倍', '超过3倍', 'over3'] },
  { value: 'fallen', label: '已回落', aliases: ['回落', '塌了', 'fallen'] },
  { value: 'hooch', label: '表面有酒精液层', aliases: ['酒精层', '液层', 'hooch'] }
];

export const TEMPS = [
  { value: 'lt15', label: '< 15°C', min: -Infinity, max: 15, coef: 2.5 },
  { value: '15-18', label: '15–18°C', min: 15, max: 18, coef: 2.2 },
  { value: '18-22', label: '18–22°C', min: 18, max: 22, coef: 1.8 },
  { value: '22-25', label: '22–25°C', min: 22, max: 25, coef: 1.3 },
  { value: '25-28', label: '25–28°C', min: 25, max: 28, coef: 1.0 },
  { value: '28-32', label: '28–32°C', min: 28, max: 32, coef: 0.7 },
  { value: 'gt32', label: '> 32°C', min: 32, max: Infinity, coef: null }
];

export const RATIO_BASE_HOURS = {
  '1:1:1': [4, 6],
  '1:2:2': [6, 8],
  '1:3:3': [8, 12],
  '1:5:5': [12, 24],
  deep_reset: [12, 36],
  '1:2:1': [8, 12]
};

export const RATIO_PRIOR_BIO_HOURS_26C = {
  '1:1:1': 5,
  '1:2:2': 7,
  '1:3:3': 10,
  '1:5:5': 18,
  deep_reset: 24,
  '1:2:1': 10
};
