import { RATIO_BASE_HOURS, RATIO_PRIOR_BIO_HOURS_26C } from './dimensions.js';
import { clamp, roundDisplay } from './normalization.js';

// Gänzle, Ehmann & Hammes (1998) Table 2, Model 1a, C. milleri LTH H198.
// 只用温度响应形状作为“相对生物时钟速度”，不做罐体高度动力学声明。
function rawPaperYeastRate(tempC) {
  const Tmax = 35.9;
  const aPrime = 0.029;
  const b = 3.0;
  const c = 0.34;

  const x = Tmax - tempC;
  if (x <= 0) return 0;
  return aPrime * Math.pow(x, b) * Math.exp(-c * x);
}

const PAPER_RATE_AT_26 = rawPaperYeastRate(26);

function getTemperatureResponse(tempC) {
  if (!Number.isFinite(tempC)) {
    return { factor: 1, reliable: false, confidencePenalty: 0.10, reason: 'temperature-defaulted-to-26' };
  }
  if (tempC <= 8) {
    return { factor: null, reliable: false, confidencePenalty: 0.30, reason: 'below-paper-practical-domain' };
  }
  if (tempC >= 35) {
    return { factor: null, reliable: false, confidencePenalty: 0.35, reason: 'high-temperature-yeast-inhibition-zone' };
  }
  const factor = rawPaperYeastRate(tempC) / PAPER_RATE_AT_26;
  return {
    factor: Math.max(0.03, Math.min(1.05, factor)),
    reliable: tempC >= 18 && tempC <= 32,
    confidencePenalty: (tempC >= 18 && tempC <= 32) ? 0 : 0.18,
    reason: (tempC >= 18 && tempC <= 32)
      ? 'paper-temperature-model'
      : 'paper-temperature-model-low-confidence-edge'
  };
}

function getRatioPriorBioHours(ratio) {
  return RATIO_PRIOR_BIO_HOURS_26C[ratio] != null ? RATIO_PRIOR_BIO_HOURS_26C[ratio] : RATIO_PRIOR_BIO_HOURS_26C['1:1:1'];
}

function integrateTemperatureSeries(samples) {
  let bioHours = 0;
  if (!Array.isArray(samples) || samples.length < 2) return 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const fa = a && Number.isFinite(Number(a.tempC)) ? getTemperatureResponse(Number(a.tempC)).factor : null;
    const fb = b && Number.isFinite(Number(b.tempC)) ? getTemperatureResponse(Number(b.tempC)).factor : null;
    if (fa == null || fb == null) continue;
    const dt = Number(b.tHours) - Number(a.tHours);
    if (!Number.isFinite(dt) || dt < 0) continue;
    bioHours += ((fa + fb) / 2) * dt;
  }
  return bioHours;
}

function detectFirstDoubleCrossing(samples) {
  if (!Array.isArray(samples) || samples.length < 2) return null;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    if (a.ratio < 2 && b.ratio >= 2) {
      const f = (2 - a.ratio) / (b.ratio - a.ratio);
      return { tHours: Number(a.tHours) + f * (Number(b.tHours) - Number(a.tHours)) };
    }
  }
  return null;
}

function geometricBlend(prior, observed, weight) {
  return Math.exp((1 - weight) * Math.log(prior) + weight * Math.log(observed));
}

function clampObservedBioHours(value, prior) {
  return Math.max(prior * 0.40, Math.min(prior * 4.00, value));
}

function noRiseWeight({ elapsedHours, priorPhysicalHours }) {
  const lateness = elapsedHours / Math.max(priorPhysicalHours, 0.1);
  return clamp((lateness - 0.60) / 1.40, 0, 0.70);
}

const BUCKET_TEMP_REPRESENTATIVE = {
  t_lt15: 12, t_15_18: 17, t_18_22: 20, t_22_25: 24,
  t_25_28: 26, t_28_32: 30, t_gt32: 35
};

function extractTemp(tempOrCoef) {
  if (typeof tempOrCoef === 'number' && Number.isFinite(tempOrCoef)) return tempOrCoef;
  if (typeof tempOrCoef === 'string') {
    const trimmed = tempOrCoef.trim();
    if (trimmed === '') return null;
    const n = Number(trimmed);
    if (Number.isFinite(n)) return n;
    if (BUCKET_TEMP_REPRESENTATIVE[trimmed] != null) return BUCKET_TEMP_REPRESENTATIVE[trimmed];
    return null;
  }
  if (tempOrCoef && typeof tempOrCoef === 'object') {
    if (tempOrCoef.num != null && Number.isFinite(Number(tempOrCoef.num))) return Number(tempOrCoef.num);
    if (tempOrCoef.value && BUCKET_TEMP_REPRESENTATIVE[tempOrCoef.value] != null) {
      return BUCKET_TEMP_REPRESENTATIVE[tempOrCoef.value];
    }
  }
  return null;
}

function getCurrentTemperature(temp, temperatureSeries) {
  if (Array.isArray(temperatureSeries) && temperatureSeries.length > 0) {
    const last = temperatureSeries[temperatureSeries.length - 1];
    const n = last && last.tempC;
    if (Number.isFinite(Number(n))) return Number(n);
  }
  return extractTemp(temp);
}

function sanitizeElapsed(elapsedHours) {
  if (elapsedHours == null || elapsedHours === '') return null;
  const n = Number(elapsedHours);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function priorPhysicalWindow(ratioValue, tempResponse) {
  const base = RATIO_BASE_HOURS[ratioValue] || RATIO_BASE_HOURS['1:1:1'];
  const factor = tempResponse ? tempResponse.factor : null;
  if (factor == null) {
    return { min: null, max: null, reliable: false, reason: 'temperature-out-of-domain' };
  }
  return {
    min: base.min / factor,
    max: base.max / factor,
    reliable: true,
    reason: 'ratio-temp-prior'
  };
}

function computeUncertainty({ height, ratio, tempResponse }) {
  let u = 0.18;
  if (height == null) u += 0.15;
  else if (height === 'none') u += 0.18;
  else if (height === 'slight') u += 0.12;
  else if (height === 'near') u += 0.06;
  else if (height === 'double') u += 0.03;
  if (tempResponse && tempResponse.reliable === false) u += 0.18;
  if (ratio === 'deep_reset' || ratio === '1:2:1') u += 0.08;
  return clamp(u, 0.18, 0.48);
}

function inferConfidence({ status, basis, height, tempResponse, elapsed }) {
  if (basis === 'sensor-crossing') return 'high';
  if (height === 'double' || height === 'peak_plus' || height === 'over3') return 'medium';
  if (status === 'crossed' || status === 'crossed-before-now') return 'medium';
  if (height === 'near' && elapsed != null && tempResponse && tempResponse.reliable) return 'medium';
  return 'low';
}

function buildDisplay({ status, totalHours, remainingHours, low, high, elapsed }) {
  switch (status) {
    case 'crossed':
      return `约 ${roundDisplay(totalHours)} 小时`;
    case 'crossed-before-now':
      return `本轮已在 ${roundDisplay(elapsed)} 小时以内达到翻倍`;
    case 'trajectory-insufficient':
      return '已回落；单次高度无法反推出本轮首次翻倍时刻';
    case 'temperature-out-of-domain':
      return '当前温度超出有效域，不提供精确估时';
    case 'forecast':
    default: {
      // 有已观察时长时，用户关心的是“从现在起还剩多久”，而不是“本轮总共多久”。
      if (remainingHours != null && Number.isFinite(remainingHours)) {
        if (remainingHours < 0.5) return '预计即将翻倍';
        return `预计还需约 ${roundDisplay(remainingHours)} 小时`;
      }
      if (low != null && high != null && Number.isFinite(low) && Number.isFinite(high)) {
        return `约 ${roundDisplay(low)}–${roundDisplay(high)} 小时`;
      }
      if (totalHours != null && Number.isFinite(totalHours)) {
        return `约 ${roundDisplay(totalHours)} 小时`;
      }
      return '无法提供精确翻倍时间';
    }
  }
}

function buildForecast({ ratio, height, tempResponse, totalHours, remainingHours, elapsed, basis, bioHoursElapsed, status }) {
  status = status || 'forecast';
  const confidence = inferConfidence({ status, basis, height, tempResponse, elapsed });
  let low = null;
  let high = null;
  if (totalHours != null && Number.isFinite(totalHours)) {
    const u = computeUncertainty({ height, ratio, tempResponse });
    low = totalHours * (1 - u);
    high = totalHours * (1 + u);
    if (status === 'forecast' && elapsed != null) low = Math.max(low, elapsed);
  }
  const display = buildDisplay({ status, totalHours, remainingHours, low, high, elapsed });
  return {
    totalHours: totalHours == null ? null : totalHours,
    remainingHours: remainingHours == null ? null : remainingHours,
    lowHours: low,
    highHours: high,
    confidence,
    status,
    basis,
    bioHoursElapsed: bioHoursElapsed == null ? null : bioHoursElapsed,
    tempFactorNow: tempResponse ? tempResponse.factor : null,
    display,
    trace: [
      { id: `timing:${basis}`, note: `totalHours=${totalHours == null ? 'null' : Number(totalHours).toFixed(2)}; status=${status}` }
    ]
  };
}

function makeObservedCrossingResult(crossing, bioHoursElapsed) {
  const totalHours = crossing.tHours;
  return {
    totalHours,
    remainingHours: 0,
    lowHours: totalHours * 0.9,
    highHours: totalHours * 1.1,
    confidence: 'high',
    status: 'crossed',
    basis: 'sensor-crossing',
    bioHoursElapsed,
    tempFactorNow: null,
    display: `约 ${roundDisplay(totalHours)} 小时`,
    trace: [{ id: 'timing:sensor-crossing', note: `首次 2x 检测于 ${Number(totalHours).toFixed(2)}h` }]
  };
}

function predictDoublingTime({ ratio, temp, height, elapsedHours, temperatureSeries = null, heightSeries = null }) {
  const Bprior = getRatioPriorBioHours(ratio);

  const tempNow = getCurrentTemperature(temp, temperatureSeries);
  const tempResponse = getTemperatureResponse(tempNow);

  const crossing = detectFirstDoubleCrossing(heightSeries);
  if (crossing) {
    const bioHoursElapsed = integrateTemperatureSeries(temperatureSeries);
    return makeObservedCrossingResult(crossing, bioHoursElapsed);
  }

  const elapsed = sanitizeElapsed(elapsedHours);

  const Belapsed = (Array.isArray(temperatureSeries) && temperatureSeries.length >= 2)
    ? integrateTemperatureSeries(temperatureSeries)
    : ((tempResponse.factor == null || elapsed == null) ? null : elapsed * tempResponse.factor);

  if (height === 'double' && elapsed != null) {
    return {
      totalHours: elapsed,
      remainingHours: 0,
      lowHours: Math.max(0, elapsed - 0.5),
      highHours: elapsed + 0.5,
      confidence: 'medium',
      status: 'crossed',
      basis: 'observed-double',
      bioHoursElapsed: Belapsed,
      tempFactorNow: tempResponse.factor,
      display: `约 ${roundDisplay(elapsed)} 小时`,
      trace: [{ id: 'timing:observed-double', note: `用户在 ${elapsed}h 观测到翻倍` }]
    };
  }

  if ((height === 'peak_plus' || height === 'over3') && elapsed != null) {
    return {
      totalHours: null,
      remainingHours: 0,
      lowHours: null,
      highHours: elapsed,
      confidence: 'medium',
      status: 'crossed-before-now',
      basis: 'observed-double',
      bioHoursElapsed: Belapsed,
      tempFactorNow: tempResponse.factor,
      display: `本轮已在 ${roundDisplay(elapsed)} 小时以内达到翻倍`,
      trace: [{ id: 'timing:crossed-before-now', note: `已超过 2x，首次 crossing ≤ ${elapsed}h` }]
    };
  }

  if (height === 'fallen' && !(Array.isArray(heightSeries) && heightSeries.length)) {
    return {
      totalHours: null,
      remainingHours: null,
      lowHours: null,
      highHours: null,
      confidence: 'low',
      status: 'trajectory-insufficient',
      basis: 'ratio-temp-prior',
      bioHoursElapsed: Belapsed,
      tempFactorNow: tempResponse.factor,
      display: '已回落；单次高度无法反推出本轮首次翻倍时刻',
      trace: [{ id: 'timing:trajectory-insufficient', note: '单点回落不足以反推 crossing' }]
    };
  }

  if (tempResponse.factor == null) {
    return {
      totalHours: null,
      remainingHours: null,
      lowHours: null,
      highHours: null,
      confidence: 'low',
      status: 'temperature-out-of-domain',
      basis: 'ratio-temp-prior',
      bioHoursElapsed: Belapsed,
      tempFactorNow: null,
      display: '当前温度超出有效域，不提供精确估时',
      trace: [{ id: 'timing:temperature-out-of-domain', note: tempResponse.reason }]
    };
  }

  if (elapsed == null || Belapsed == null) {
    const priorPhysical = Bprior / tempResponse.factor;
    return buildForecast({
      ratio,
      height,
      tempResponse,
      totalHours: priorPhysical,
      remainingHours: null,
      elapsed: null,
      basis: 'ratio-temp-prior',
      bioHoursElapsed: null,
      status: 'forecast'
    });
  }

  let Bhat = Bprior;
  let basis = 'ratio-temp-prior';

  if (height === 'none') {
    const pMax = Math.log2(1.20);
    const lowerBound = Belapsed / pMax;
    const priorPhysical = Bprior / tempResponse.factor;
    const weight = noRiseWeight({ elapsedHours: elapsed, priorPhysicalHours: priorPhysical });
    if (lowerBound > Bprior && weight > 0) {
      Bhat = geometricBlend(Bprior, clampObservedBioHours(lowerBound, Bprior), weight);
      basis = 'lower-bound-correction';
    }
  } else if (height === 'slight') {
    const p = Math.log2(1.35);
    const Bobs = Belapsed / p;
    Bhat = geometricBlend(Bprior, clampObservedBioHours(Bobs, Bprior), 0.35);
    basis = 'partial-height-correction';
  } else if (height === 'near') {
    const p = Math.log2(1.70);
    const Bobs = Belapsed / p;
    Bhat = geometricBlend(Bprior, clampObservedBioHours(Bobs, Bprior), 0.70);
    basis = 'partial-height-correction';
  }

  if (height !== 'double' && height !== 'peak_plus' && height !== 'over3') {
    Bhat = Math.max(Bhat, Belapsed * 1.03);
  }

  const Bremaining = Math.max(0, Bhat - Belapsed);
  const remaining = Bremaining / tempResponse.factor;
  const total = elapsed + remaining;

  return buildForecast({
    ratio,
    height,
    tempResponse,
    totalHours: total,
    remainingHours: remaining,
    elapsed,
    basis,
    bioHoursElapsed: Belapsed,
    status: 'forecast'
  });
}

function expectedRange(ratioValue, tempOrCoef, context = {}) {
  const timing = predictDoublingTime({
    ratio: ratioValue,
    temp: extractTemp(tempOrCoef),
    height: context.height ?? null,
    elapsedHours: context.elapsedHours ?? null,
    temperatureSeries: context.temperatureSeries ?? null,
    heightSeries: context.heightSeries ?? null
  });
  return {
    min: timing.lowHours,
    max: timing.highHours,
    reliable: timing.status !== 'temperature-out-of-domain' && timing.status !== 'trajectory-insufficient',
    reason: timing.basis
  };
}

export {
  rawPaperYeastRate,
  getTemperatureResponse,
  getRatioPriorBioHours,
  integrateTemperatureSeries,
  detectFirstDoubleCrossing,
  geometricBlend,
  clampObservedBioHours,
  noRiseWeight,
  extractTemp,
  getCurrentTemperature,
  priorPhysicalWindow,
  predictDoublingTime,
  expectedRange
};
