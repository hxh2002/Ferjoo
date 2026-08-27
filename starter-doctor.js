'use strict';

/**
 * 酵种医生（Sourdough Starter Doctor）
 * 酵种（天然酵母 / 鲁邦种）培养的规则化诊断引擎
 *
 * 定位：把「当前阶段 / 喂养比例 / 高度状态 / 温度」四要素，
 *       映射为标准化的酵种状态判定与专业级操作建议。
 *
 * 对 agent 暴露三组接口：
 *   1. 标准化识别 —— normalizeStage / normalizeRatio / normalizeHeight / normalizeTemp / parseStarterInput
 *      把用户自然语言（或结构化输入）归一化为标准值，保证规则引擎可精确命中。
 *   2. 规则引擎 —— diagnoseStarter(input) → 结构化诊断结果
 *   3. 输出格式化 —— formatAdvice(result) → Markdown 建议
 *
 * 识别策略：每个维度维护「标准值 + 同义词表」，按「最长别名优先」匹配，
 * 避免「不翻倍」被「翻倍」误命中；标准值（canonical value）可直接透传。
 */

// ============================================================
// 一、维度枚举与同义词表（标准化识别）
// 结构：{ value 标准值, label 展示名, aliases 用户口语/英文同义词 }
// ============================================================

const STAGES = [
  { value: 'start_d1', label: '起种初期（第 1-2 天）', aliases: ['第1天', '第一天', '第 1 天', '第2天', '第二天', '第 2 天', '刚起种', '刚开始养', 'day1', 'day2', 'day 1', 'day 2'] },
  { value: 'start_active', label: '起种活跃期（第 3-5 天）', aliases: ['第3天', '第三天', '第 3 天', '第4天', '第四天', '第 4 天', '第5天', '第五天', '第 5 天', '起种中', '活跃期', 'day3', 'day4', 'day5'] },
  { value: 'start_stable', label: '起种稳定期（第 5-7 天）', aliases: ['第6天', '第六天', '第 6 天', '第7天', '第七天', '第 7 天', '稳定期', '快成熟', '接近成熟', 'day6', 'day7'] },
  { value: 'revive', label: '复活恢复期（冷藏/冷冻后）', aliases: ['复活', '唤醒', '恢复', '解冻', '从冰箱拿出来', '冷藏后拿出来', '刚拿出来'] },
  { value: 'fridge', label: '冷藏休眠期', aliases: ['冷藏', '冰箱', '休眠', '冷藏保存', '放冰箱', '低温保存'] },
  { value: 'mature', label: '成熟期（日常喂养）', aliases: ['成熟', '日常', '日常喂养', '老酵种', '养好了', '已成熟', '稳定', 'mature'] }
];

const RATIOS = [
  { value: '1:1:1', label: '1:1:1（标准）', aliases: ['1:1:1', '1：1：1', '一比一', '1比1', '1比1比1', '标准比例', '等量'] },
  { value: '1:2:2', label: '1:2:2（强活）', aliases: ['1:2:2', '1：2：2', '一比二', '1比2', '1比2比2'] },
  { value: '1:3:3', label: '1:3:3（温和/强活）', aliases: ['1:3:3', '1：3：3', '一比三', '1比3', '1比3比3'] },
  { value: '1:5:5', label: '1:5:5（重置降酸）', aliases: ['1:5:5', '1：5：5', '一比五', '1比5', '1比5比5', '重置'] },
  { value: 'deep_reset', label: '超大比例（深度重置）', aliases: ['1:10:10', '1：10：10', '大比例重置', '深度重置', '超大比例'] },
  { value: '1:2:1', label: '1:2:1（硬种）', aliases: ['1:2:1', '1：2：1', '一比二比一', '硬种', '固态种', '硬酵种', '低水合种', '含水量70', '70%水合', 'stiff'] }
];

const HEIGHTS = [
  { value: 'none', label: '几乎无变化（0-20%）', aliases: ['没变化', '没有变化', '不涨', '没涨', '没反应', '没动静', '不翻倍', '没翻倍', '没长', '没长高', '一点没涨', '纹丝不动', '毫无反应', '无变化'] },
  { value: 'slight', label: '轻微上升（20-50%）', aliases: ['稍微涨', '轻微', '涨了一点', '一点点', '小幅', '有点涨', '涨了一点不多', '微微上涨'] },
  { value: 'near', label: '接近翻倍（50-90%）', aliases: ['接近翻倍', '快翻倍', '差不多翻倍', '快两倍', '涨了七八成', '涨了一半以上', '50%', '80%', '90%'] },
  { value: 'double', label: '翻倍（100%，峰值）', aliases: ['翻倍', '两倍', '涨到两倍', '翻了一倍', '涨了一倍', '2倍', '100%', '正好翻倍'] },
  { value: 'peak_plus', label: '2-3 倍（略过峰）', aliases: ['两倍多', '2倍多', '接近三倍', '两到三倍', '2到3倍', '2-3倍', '快三倍', '三倍', '涨到三倍'] },
  { value: 'over3', label: '3 倍以上（过度膨胀）', aliases: ['三倍以上', '超过三倍', '3倍以上', '三倍多', '3倍多', '四五倍', '涨到三倍以上', '远超三倍'] },
  { value: 'fallen', label: '已回落（过峰）', aliases: ['回落', '塌了', '掉下来', '下降', '回缩', '开始回落', '过峰', '涨过又掉', '塌陷', '缩回去', '回落了'] },
  { value: 'hooch', label: '出现液体层（酒精层）', aliases: ['液体层', '水层', '酒精层', '上层有水', '析出液体', '表面有水', '出水', 'hooch', '酒精味', '上层清液', '分泌液体'] }
];

// 温度维度：数值直接映射 + 关键词兜底；coef 为翻倍时间的温度修正系数
const TEMPS = [
  { value: 't_lt15', label: '<15℃', coef: 2.5, note: '近乎休眠', aliases: ['低于15度', '十度', '10度', '11度', '12度', '13度', '14度', '很冷', '零下'] },
  { value: 't_15_18', label: '15-18℃', coef: 2.2, note: '很慢', aliases: ['15度', '16度', '17度'] },
  { value: 't_18_22', label: '18-22℃', coef: 1.8, note: '稍凉', aliases: ['18度', '19度', '20度', '21度'] },
  { value: 't_22_25', label: '22-25℃', coef: 1.3, note: '适中偏凉', aliases: ['22度', '23度', '24度'] },
  { value: 't_25_28', label: '25-28℃', coef: 1.0, note: '标准', aliases: ['25度', '26度', '27度', '常温'] },
  { value: 't_28_32', label: '28-32℃', coef: 0.7, note: '偏快，酸度上升', aliases: ['28度', '29度', '30度', '31度', '32度', '偏热'] },
  { value: 't_gt32', label: '>32℃', coef: 0.5, note: '危险，风味劣化', aliases: ['33度', '34度', '35度', '36度', '37度', '38度', '39度', '40度', '高温', '很热'] }
];

// 比例 → 基准翻倍时间（25-28℃ 下，单位：小时）
const RATIO_BASE_HOURS = {
  '1:1:1': { min: 4, max: 6 },
  '1:2:2': { min: 6, max: 8 },
  '1:3:3': { min: 8, max: 12 },
  '1:5:5': { min: 12, max: 24 },
  deep_reset: { min: 12, max: 36 },
  '1:2:1': { min: 8, max: 12 }
};

// ============================================================
// 二、标准化识别函数
// ============================================================

/** 最长别名优先匹配：返回命中的标准值（value），无命中返回 null */
function matchValue(text, dimension) {
  const t = String(text || '').toLowerCase();
  let best = null;
  let bestLen = 0;
  for (const item of dimension) {
    for (const alias of item.aliases) {
      const a = String(alias).toLowerCase();
      if (a && t.includes(a) && a.length > bestLen) {
        best = item.value;
        bestLen = a.length;
      }
    }
  }
  return best;
}

/** 解析单个维度：支持 标准值字符串 / {value} 对象 / 自然语言 */
function resolve(value, dimension) {
  if (value == null || value === '') return null;
  if (typeof value === 'object' && value.value) {
    return dimension.find((d) => d.value === value.value) || null;
  }
  const s = String(value).trim();
  const direct = dimension.find((d) => d.value === s);
  if (direct) return direct;
  const v = matchValue(s, dimension);
  return v ? dimension.find((d) => d.value === v) : null;
}

/** 数值 → 温度区间 */
function tempFromNumber(num) {
  let v;
  if (num < 15) v = 't_lt15';
  else if (num < 18) v = 't_15_18';
  else if (num < 22) v = 't_18_22';
  else if (num < 25) v = 't_22_25';
  else if (num < 28) v = 't_25_28';
  else if (num <= 32) v = 't_28_32';
  else v = 't_gt32';
  const hit = TEMPS.find((t) => t.value === v);
  return { value: v, label: hit.label, coef: hit.coef, note: hit.note, num };
}

/** 温度标准化：支持 标准值 / 纯数字 / 数字+单位 / 关键词 */
function normalizeTemp(input) {
  if (input == null || input === '') return null;
  if (typeof input === 'object' && input.value) {
    const hit = TEMPS.find((t) => t.value === input.value);
    return hit ? { value: hit.value, label: hit.label, coef: hit.coef, note: hit.note } : null;
  }
  if (typeof input === 'number') return tempFromNumber(input);
  const text = String(input).trim();
  if (/^-?\d+(\.\d+)?$/.test(text)) return tempFromNumber(Number(text));
  const direct = TEMPS.find((t) => t.value === text);
  if (direct) return { value: direct.value, label: direct.label, coef: direct.coef, note: direct.note };

  // 数字 + 温度单位
  let m = text.match(/(室温|温度|气温)?\s*(\d+(?:\.\d+)?)\s*(?:度|℃|°C|°c|°)/);
  // 室温/温度 + 数字（无单位）
  if (!m) m = text.match(/(室温|温度|气温)\s*(?:是|为|约|大概|在|有)?\s*(\d+(?:\.\d+)?)/);
  if (m) {
    const num = Number(m[2]);
    if (num >= -10 && num <= 60) return tempFromNumber(num);
  }
  // 关键词兜底
  const v = matchValue(text, TEMPS);
  if (v) {
    const hit = TEMPS.find((t) => t.value === v);
    return { value: hit.value, label: hit.label, coef: hit.coef, note: hit.note };
  }
  return null;
}

const normalizeStage = (v) => resolve(v, STAGES);
const normalizeRatio = (v) => resolve(v, RATIOS);
const normalizeHeight = (v) => resolve(v, HEIGHTS);

/** 从一段自由文本中抽取四要素（供对话式 agent 使用） */
function parseStarterInput(text) {
  const t = String(text || '');
  const out = {};
  const stage = matchValue(t, STAGES);
  if (stage) out.stage = stage;
  const ratio = matchValue(t, RATIOS);
  if (ratio) out.ratio = ratio;
  const height = matchValue(t, HEIGHTS);
  if (height) out.height = height;
  const temp = normalizeTemp(t);
  if (temp) out.temp = temp.value;
  return out;
}

// ============================================================
// 三、规则引擎
// ============================================================

/** 污染判定：气味/颜色/补充描述中出现污染特征即判污染 */
function isContaminated(input) {
  const smell = String(input.smell || '');
  const color = String(input.color || '');
  const note = String(input.notes || '');
  const badSmell = /腐臭|氨味|霉味|馊味/.test(smell + note);
  const badColor = /粉红|橙|黑|绿|发霉|霉斑|长毛|变色/.test(color + note);
  return badSmell || badColor;
}

/** 预期翻倍时间：比例基准 × 温度系数 */
function expectedHours(ratioValue, coef) {
  const base = RATIO_BASE_HOURS[ratioValue] || RATIO_BASE_HOURS['1:1:1'];
  const min = Math.round(base.min * coef * 10) / 10;
  const max = Math.round(base.max * coef * 10) / 10;
  return `${formatHours(min)}~${formatHours(max)}`;
}

function formatHours(h) {
  if (h < 1) return `${Math.round(h * 60)} 分钟`;
  return `${h} 小时`;
}

/** 活性不足的排查项（按可能性从高到低） */
function weakReasons(temp, result) {
  if (temp.coef >= 2) {
    result.reasons.push('环境温度过低（<20℃），酵母近乎休眠是首要嫌疑');
    result.actions.push('移入 25-28℃ 环境（发酵箱/烤箱开灯）再观察 4-6 小时');
  }
  result.reasons.push('酵种可能饥饿（超过 12 小时未喂养）');
  result.actions.push('按当前比例及时喂养；长期饥饿用 1:5:5 重置降酸');
  result.reasons.push('水质含氯或面粉过期也会抑制活性');
  result.actions.push('改用过滤水或煮沸晾凉水，更换新鲜面粉');
  result.reasons.push('需排除污染：表面异色/异味则弃用重起');
}

/** 阶段覆盖规则：起种/冷藏/复活 特殊处理；返回 true 表示已接管 */
function applyStageOverride(stageValue, height, temp, result) {
  const hv = height ? height.value : null;
  switch (stageValue) {
    case 'start_d1':
      result.state = '起种初期·观察期';
      result.level = 'info';
      result.reasons.push('第 1-2 天菌群尚未定植，混合后静置为主，无明显变化属正常');
      if (hv === 'hooch') {
        result.reasons.push('第 2-3 天可能出现表面液体与酸臭味（细菌爆发/假性活跃），是起种必经阶段');
        result.actions.push('倒掉液体或搅拌均匀，继续按 1:1:1 喂养');
      }
      result.actions.push('盖湿布，保持 25-28℃ 静置 24 小时');
      result.actions.push('观察是否出现零星气泡与酸香');
      result.actions.push('次日取 50g 旧种 + 50g 面粉 + 50g 水继续喂养');
      return true;

    case 'start_active':
      if (hv === 'none' || hv === 'slight') {
        result.state = '起种活跃期·反应偏弱';
        result.level = 'warn';
        result.reasons.push('第 3-5 天应看到气泡增多、体积增长；若仍无反应，多为温度偏低或面粉/水质问题');
        result.actions.push('检查环境是否 ≥ 20℃，必要时移入 25-28℃');
        result.actions.push('确认使用过滤水/煮沸晾凉水、新鲜面粉');
      } else {
        result.state = '起种活跃期·进展正常';
        result.level = 'ok';
        result.reasons.push('气泡增多、体积 1.5-2 倍，菌群已开始稳定，进展正常');
      }
      result.actions.push('每天早晚各按 1:1:1 喂养一次');
      result.actions.push('此阶段酸臭味会逐步转为清新果香');
      return true;

    case 'start_stable':
      if (hv === 'double' || hv === 'peak_plus') {
        result.state = '起种完成·接近成熟';
        result.level = 'ok';
        result.reasons.push('喂养后 4-6 小时稳定翻倍，酵种已达可用成熟度');
        result.actions.push('可转入日常喂养（1:1:1）或冷藏保存');
        result.actions.push('做面包前用浮水试验确认活性');
      } else {
        result.state = '起种稳定期·尚未成熟';
        result.level = 'warn';
        result.reasons.push('第 5-7 天应能稳定翻倍；仍未翻倍需排查温度/水质/面粉');
        result.actions.push('检查环境温度并移入 25-28℃');
        result.actions.push('确认用过滤水与新鲜面粉，继续规律喂养 2-3 天');
        result.actions.push('若出现异色/异味，弃用重起');
      }
      return true;

    case 'fridge':
      result.state = '冷藏休眠期';
      result.level = 'info';
      result.reasons.push('冷藏（4℃）下酵种近乎休眠，无反应属正常');
      if (hv === 'hooch') {
        result.level = 'warn';
        result.reasons.push('冷藏期仍出现较多液体层，说明饥饿/酸度累积');
        result.actions.push('倒掉液体，按 1:1:1 喂养后再冷藏');
      }
      result.actions.push('每周取出按 1:1:1 喂养一次，喂养后 1-2 小时再放回冷藏');
      result.actions.push('冷藏超过 3 周，使用前先检查活性');
      return true;

    case 'revive':
      if (hv === 'double' || hv === 'peak_plus') {
        result.state = '复活恢复期·已恢复';
        result.level = 'ok';
        result.reasons.push('已恢复到翻倍活性，可正常使用');
        result.actions.push('可按正常节奏继续喂养或直接使用');
      } else {
        result.state = '复活恢复期·待唤醒';
        result.level = 'info';
        result.reasons.push('从冷藏/冷冻取出的酵种需要回暖与连续喂养恢复活性');
        result.actions.push('室温回温 1 小时');
        result.actions.push('连续按 1:1:1 喂养 2-3 次，直到恢复 4-6 小时翻倍');
        result.actions.push('若多次喂养仍无反应，检查是否已饿死或污染');
      }
      return true;

    default:
      return false;
  }
}

/** 成熟期：高度 → 活性状态判定 */
function applyActivityJudgment(height, ratio, temp, result) {
  if (!height) {
    result.state = '信息不足';
    result.level = 'info';
    result.reasons.push('未提供高度状态，无法精确判定；默认按成熟期观察');
    result.actions.push('请补充喂养后酵种的体积变化（无变化/翻倍/回落等）');
    return;
  }
  const hv = height.value;
  switch (hv) {
    case 'none':
      result.state = '活性不足';
      result.level = 'danger';
      result.reasons.push(`喂养后未见明显反应，远低于预期翻倍时间（约 ${result.expectedHours}）`);
      weakReasons(temp, result);
      break;
    case 'slight':
      result.state = '活性偏弱/进行中';
      result.level = 'warn';
      result.reasons.push('仅轻微上升，活性偏弱或观察时间不足');
      if (temp.coef >= 1.8) result.reasons.push(`环境温度偏低（${temp.label}），翻倍时间会显著拉长`);
      result.actions.push('延长观察至预期时间，并维持 25-28℃ 环境');
      result.actions.push('连续 1:1:1 规律喂养 2-3 次，稳定后再判断');
      break;
    case 'near':
      result.state = '健康（上升期）';
      result.level = 'ok';
      result.reasons.push('已接近翻倍，菌群活跃，正处于快速产气上升期');
      result.actions.push('继续观察至翻倍即达峰值，可准备使用或续种');
      break;
    case 'double':
      result.state = '巅峰（最佳使用时机）';
      result.level = 'ok';
      result.reasons.push('体积翻倍、顶部微拱，是酵种活性最强、产气最足的时点');
      result.actions.push('立即用于面团（发酵最快），或按原比例续种');
      result.actions.push('错过此刻会开始回落、酸度上升');
      break;
    case 'peak_plus':
      result.state = '强活/略过峰';
      result.level = 'ok';
      result.reasons.push('已越过翻倍（2-3 倍），活性强，但开始向风味转化');
      result.actions.push('做面包可直接使用；追求温和风味可先按 1:3:3 续一次');
      result.actions.push('若想保留活力，尽快使用或喂养，避免继续产酒精');
      break;
    case 'over3':
      result.state = '过度膨胀';
      result.level = 'warn';
      result.reasons.push('膨胀 3 倍以上，已大量产酒精，风味最差（纯酒精味）');
      result.actions.push('尽快使用或立即喂养，避免继续发酵产酒精');
      result.actions.push('下轮改为 1:2:2 或 1:3:3，缩短发酵时间');
      break;
    case 'fallen':
      result.state = '已过峰（回落）';
      result.level = 'warn';
      result.reasons.push('从峰值回落，酸度上升，处于风味转化期');
      result.actions.push('适合追求酸风味或做长时间冷发酵');
      result.actions.push('若要中性风味，先重新按 1:1:1 喂养至翻倍再用');
      break;
    case 'hooch':
      result.state = '饥饿（出现液体层）';
      result.level = 'danger';
      result.reasons.push('表面出现液体层（hooch/酒精层），说明酵种已饥饿、食物耗尽');
      result.actions.push('倒掉液体或搅拌均匀，立即按当前比例喂养');
      result.actions.push('若长期饥饿酸度过高，用 1:5:5 重置降酸');
      break;
    default:
      result.state = '未知状态';
      result.level = 'info';
  }
}

/**
 * 规则引擎主入口
 * @param {{
 *   stage?: string,     // 当前阶段（标准值/自然语言）
 *   ratio?: string,     // 喂养比例
 *   height?: string,    // 高度状态
 *   temp?: string|number, // 温度（可选，默认 25-28℃）
 *   smell?: string,     // 气味（可选，用于污染判定）
 *   color?: string,     // 表面颜色（可选，用于污染判定）
 *   notes?: string      // 补充描述（可选）
 * }} input
 * @returns {{stage, stageLabel, ratio, ratioLabel, height, heightLabel, temp, tempLabel, expectedHours, state, level, reasons, actions, safety}}
 */
function diagnoseStarter(input = {}) {
  const stage = resolve(input.stage, STAGES) || STAGES.find((s) => s.value === 'mature');
  const ratio = resolve(input.ratio, RATIOS) || RATIOS.find((r) => r.value === '1:1:1');
  const height = resolve(input.height, HEIGHTS);
  const temp = normalizeTemp(input.temp) || TEMPS.find((t) => t.value === 't_25_28');

  const result = {
    stage: stage.value,
    stageLabel: stage.label,
    ratio: ratio.value,
    ratioLabel: ratio.label,
    height: height ? height.value : null,
    heightLabel: height ? height.label : null,
    temp: temp.value,
    tempLabel: temp.label,
    expectedHours: expectedHours(ratio.value, temp.coef),
    state: '',
    level: 'info',
    reasons: [],
    actions: [],
    safety: []
  };

  // 1. 污染判定（安全规则，最高优先级）
  if (isContaminated(input)) {
    result.state = '已污染（不可使用）';
    result.level = 'danger';
    result.reasons.push('表面出现粉红/橙/黑/绿色斑点、霉变，或腐臭/氨味');
    result.actions.push('整罐酵种立即弃用，不可刮除表面继续使用');
    result.actions.push('容器与工具用沸水消毒后重新起种');
    result.safety.push('霉菌菌丝可能已深入内部，肉眼可见异色即视为污染');
    return result;
  }

  // 2. 阶段覆盖规则（起种/冷藏/复活 特殊处理）
  if (applyStageOverride(stage.value, height, temp, result)) {
    return result;
  }

  // 3. 成熟期：高度 → 活性状态判定
  applyActivityJudgment(height, ratio, temp, result);

  return result;
}

// ============================================================
// 四、输出格式化
// ============================================================

const LEVEL_LABEL = {
  ok: '✅ 良好',
  warn: '🟡 需注意',
  danger: '🔴 需处理',
  info: 'ℹ️ 观察'
};

/** 结构化结果 → Markdown 建议 */
function formatAdvice(result) {
  const lines = ['## 🩺 酵种医生 · 诊断报告', ''];
  lines.push(`**状态判定**：${result.state}（${LEVEL_LABEL[result.level] || result.level}）`);
  lines.push('');
  lines.push(`- 当前阶段：${result.stageLabel}`);
  lines.push(`- 喂养比例：${result.ratioLabel}`);
  if (result.heightLabel) lines.push(`- 高度状态：${result.heightLabel}`);
  lines.push(`- 环境温度：${result.tempLabel}`);
  lines.push(`- 预期翻倍时间：约 ${result.expectedHours}`);
  lines.push('');
  if (result.reasons.length) {
    lines.push('**原因分析**：');
    result.reasons.forEach((r) => lines.push(`- ${r}`));
    lines.push('');
  }
  if (result.actions.length) {
    lines.push('**操作建议**：');
    result.actions.forEach((a) => lines.push(`- ${a}`));
    lines.push('');
  }
  if (result.safety.length) {
    lines.push('> ⚠️ **安全提醒**：');
    result.safety.forEach((s) => lines.push(`> ${s}`));
  }
  return lines.join('\n');
}

module.exports = {
  STAGES,
  RATIOS,
  HEIGHTS,
  TEMPS,
  RATIO_BASE_HOURS,
  normalizeStage,
  normalizeRatio,
  normalizeHeight,
  normalizeTemp,
  parseStarterInput,
  diagnoseStarter,
  formatAdvice
};
