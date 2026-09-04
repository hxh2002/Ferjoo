import { STAGES, RATIOS, HEIGHTS, TEMPS } from './dimensions.js';

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

function resolve(value, dimension) {
  if (value == null || value === '') return null;
  if (typeof value === 'object' && value.value) return dimension.find(d => d.value === value.value) || null;
  const s = String(value).trim();
  const direct = dimension.find(d => d.value === s);
  if (direct) return direct;
  const v = matchValue(s, dimension);
  return v ? dimension.find(d => d.value === v) : null;
}

function tempFromNumber(num) {
  let v;
  if (num < 15) v = 't_lt15';
  else if (num < 18) v = 't_15_18';
  else if (num < 22) v = 't_18_22';
  else if (num < 25) v = 't_22_25';
  else if (num < 28) v = 't_25_28';
  else if (num <= 32) v = 't_28_32';
  else v = 't_gt32';
  const hit = TEMPS.find(t => t.value === v);
  return { value:v, label:hit.label, coef:hit.coef, note:hit.note, num:Number(num) };
}

function normalizeTemp(input) {
  if (input == null || input === '') return null;
  if (typeof input === 'object' && input.value) {
    const hit = TEMPS.find(t => t.value === input.value);
    if (!hit) return null;
    const normalized = { value:hit.value, label:hit.label, coef:hit.coef, note:hit.note };
    if (input.num != null && Number.isFinite(Number(input.num))) normalized.num = Number(input.num);
    return normalized;
  }
  if (typeof input === 'number') return tempFromNumber(input);
  const text = String(input).trim();
  if (/^-?\d+(\.\d+)?$/.test(text)) return tempFromNumber(Number(text));
  const direct = TEMPS.find(t => t.value === text);
  if (direct) return { value:direct.value, label:direct.label, coef:direct.coef, note:direct.note };
  let m = text.match(/(室温|温度|气温)?\s*(-?\d+(?:\.\d+)?)\s*(?:度|℃|°C|°c|°)/);
  if (!m) m = text.match(/(室温|温度|气温)\s*(?:是|为|约|大概|在|有)?\s*(-?\d+(?:\.\d+)?)/);
  if (m) {
    const num = Number(m[2]);
    if (num >= -10 && num <= 60) return tempFromNumber(num);
  }
  const v = matchValue(text, TEMPS);
  if (v) {
    const hit = TEMPS.find(t => t.value === v);
    return { value:hit.value, label:hit.label, coef:hit.coef, note:hit.note };
  }
  return null;
}

const normalizeStage = v => resolve(v, STAGES);
const normalizeRatio = v => resolve(v, RATIOS);
const normalizeHeight = v => resolve(v, HEIGHTS);

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
  if (temp) {
    out.temp = temp.num != null ? temp.num : temp.value;
    out.tempBucket = temp.value;
    if (temp.num != null) out.tempC = temp.num;
  }
  const hm = t.match(/(?:喂养后|喂后|过了|经过|已经|已)?\s*(\d+(?:\.\d+)?)\s*(?:小时|hours?|hrs?|h)(?![a-z])/i);
  if (hm) out.elapsedHours = Number(hm[1]);
  const pm = t.match(/p\s*h\s*(?:是|为|约|大概|:|：)?\s*(\d(?:\.\d+)?)/i);
  if (pm) out.ph = Number(pm[1]);
  const colorSignals = [
    [/粉红/, '粉红'], [/橙(?:色)?(?:斑|点|层)/, '橙色'], [/黑(?:色)?(?:斑|点|霉)/, '黑色斑点'],
    [/绿(?:色)?(?:斑|点|霉)/, '绿色斑点'], [/发霉|霉斑|长毛|绒毛/, '发霉长毛']
  ];
  const smellSignals = [[/腐臭|馊味/, '腐臭'], [/氨味/, '氨味'], [/霉味/, '霉味']];
  for (const [pattern, value] of colorSignals) {
    if (isContaminated({ notes:t }) && pattern.test(t)) { out.color = value; break; }
  }
  for (const [pattern, value] of smellSignals) {
    if (isContaminated({ notes:t }) && pattern.test(t)) { out.smell = value; break; }
  }
  if (out.color || out.smell) out.contaminationNotes = t;
  return out;
}

function isContaminated(input = {}) {
  const smell = String(input.smell || '');
  const color = String(input.color || '');
  const note = String(input.notes || '');
  const negation = '(?:没有|并无|无|未见|未发现|不是|不含)';
  const hasUnnegated = (text, signal) => {
    if (!signal.test(text)) return false;
    const source = signal.source;
    const negatedSignal = new RegExp(`${negation}[^，。；;]{0,12}(?:${source})`);
    return !negatedSignal.test(text);
  };
  const badSmell = hasUnnegated(smell, /腐臭|氨味|霉味|馊味/) || hasUnnegated(note, /腐臭|氨味|霉味|馊味/);
  const badColor = hasUnnegated(color, /粉红|橙色|黑色|绿色|发霉|霉斑|长毛|绒毛/) ||
    hasUnnegated(note, /粉红(?:色)?(?:斑|点|层)|橙(?:色)?(?:斑|点|层)|黑(?:色)?(?:斑|点|霉)|绿(?:色)?(?:斑|点|霉)|发霉|霉斑|长毛|绒毛/);
  return badSmell || badColor;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function formatHours(h) {
  if (h == null) return null;
  if (h < 1) return `${Math.round(h * 60)} 分钟`;
  return `${h} 小时`;
}

function roundDisplay(hours) {
  if (hours == null) return null;
  if (hours < 6) return Math.round(hours * 2) / 2;
  if (hours <= 24) return Math.round(hours);
  return Math.round(hours / 2) * 2;
}

export {
  matchValue,
  resolve,
  tempFromNumber,
  normalizeTemp,
  normalizeStage,
  normalizeRatio,
  normalizeHeight,
  parseStarterInput,
  isContaminated,
  clamp,
  formatHours,
  roundDisplay
};
