import { HEIGHTS, RATIOS, STAGES, TEMPS } from './dimensions.js';

export function matchValue(input, options) {
  const text = String(input ?? '').trim().toLowerCase();
  if (!text) return null;
  const candidates = [];
  for (const option of options) {
    for (const alias of [option.value, option.label, ...(option.aliases || [])]) {
      const normalized = String(alias).toLowerCase();
      if (text.includes(normalized)) candidates.push({ value: option.value, length: normalized.length });
    }
  }
  return candidates.sort((a, b) => b.length - a.length)[0]?.value || null;
}

export function resolve(input, options, fallback = null) {
  if (options.some((x) => x.value === input)) return input;
  return matchValue(input, options) || fallback;
}

export function tempFromNumber(tempC) {
  const n = Number(tempC);
  if (!Number.isFinite(n)) return null;
  return TEMPS.find((x) => n >= x.min && n < x.max)?.value || 'gt32';
}

export function normalizeTemp({ tempC, temp } = {}) {
  const n = Number(tempC);
  if (Number.isFinite(n)) return { tempC: n, temp: tempFromNumber(n) };
  const bucket = resolve(temp, TEMPS, '25-28');
  const representative = {
    lt15: 13, '15-18': 16.5, '18-22': 20, '22-25': 23.5,
    '25-28': 26.5, '28-32': 30, gt32: 34
  }[bucket];
  return { tempC: representative, temp: bucket };
}

function parseNumber(text, patterns) {
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

export function parseStarterInput(input = '') {
  const text = String(input);
  const lower = text.toLowerCase();
  const stage = matchValue(lower, STAGES);
  const ratio = matchValue(lower, RATIOS);
  const height = matchValue(lower, HEIGHTS);
  const tempC = parseNumber(lower, [
    /(-?\d+(?:\.\d+)?)\s*(?:°\s*)?c\b/i,
    /(?:温度|室温|环境)\s*[:：]?\s*(-?\d+(?:\.\d+)?)/i
  ]);
  const elapsedHours = parseNumber(lower, [
    /(\d+(?:\.\d+)?)\s*(?:小时|h|hours?)/i,
    /(?:经过|喂养后|刷新后)\s*(\d+(?:\.\d+)?)/i
  ]);
  const ph = parseNumber(lower, [/\bph\s*[:：]?\s*(\d+(?:\.\d+)?)/i]);

  const suspiciousColor = /(粉红|红色|橙色斑|绿色|蓝色|黑色|霉|fuzzy|pink|green|blue|black)/i.test(text);
  const suspiciousSmell = /(腐败|恶臭|腐肉|垃圾|霉味|putrid|rotten|moldy)/i.test(text);
  const negated = /(没有|无|未见|不是|并无).{0,6}(粉红|红色|绿色|蓝色|黑色|霉|恶臭|腐败)/i.test(text);

  return {
    ...(stage ? { stage } : {}),
    ...(ratio ? { ratio } : {}),
    ...(height ? { height } : {}),
    ...(tempC != null ? { tempC, temp: tempFromNumber(tempC) } : {}),
    ...(elapsedHours != null ? { elapsedHours } : {}),
    ...(ph != null ? { ph } : {}),
    ...((suspiciousColor && !negated) ? { color: 'suspicious' } : {}),
    ...((suspiciousSmell && !negated) ? { smell: 'suspicious' } : {})
  };
}

export function isContaminated({ color, smell, notes = '' } = {}) {
  if (color === 'suspicious' || smell === 'suspicious') return true;
  const text = String(notes);
  const negated = /(没有|无|未见|不是|并无).{0,8}(粉红|红色|绿色|蓝色|黑色|霉|绒毛|恶臭|腐败)/i.test(text);
  if (negated) return false;
  return /(粉红|红色|绿色|蓝色|黑色|霉斑|绒毛|fuzzy|putrid|rotten|恶臭|腐败)/i.test(text);
}

export function formatHours(hours) {
  if (!Number.isFinite(hours)) return '—';
  if (hours < 1) return `约 ${Math.max(5, Math.round(hours * 60 / 5) * 5)} 分钟`;
  const rounded = hours < 10 ? Math.round(hours * 10) / 10 : Math.round(hours);
  return `约 ${rounded} 小时`;
}

export function roundDisplay(value, digits = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(digits)) : null;
}
