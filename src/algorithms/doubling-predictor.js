import { RATIO_PRIOR_BIO_HOURS_26C } from './dimensions.js';

const RATE_ANCHORS = [
  [8, 0.08], [12, 0.14], [15, 0.24], [18, 0.42], [20, 0.58],
  [22, 0.72], [24, 0.88], [26, 1.00], [28, 1.12], [30, 1.18],
  [32, 1.05], [34, 0.78], [36, 0.48], [40, 0.18]
];

function interpolate(x, [x0, y0], [x1, y1]) {
  if (x1 === x0) return y0;
  const t = (x - x0) / (x1 - x0);
  return y0 + (y1 - y0) * t;
}

export function getTemperatureResponse(tempC = 26) {
  const t = Number(tempC);
  if (!Number.isFinite(t)) return { temperatureC: 26, rate: 1, reliable: true };
  if (t <= RATE_ANCHORS[0][0]) return { temperatureC: t, rate: RATE_ANCHORS[0][1], reliable: t >= 5 };
  if (t >= RATE_ANCHORS.at(-1)[0]) return { temperatureC: t, rate: RATE_ANCHORS.at(-1)[1], reliable: false };
  for (let i = 1; i < RATE_ANCHORS.length; i++) {
    if (t <= RATE_ANCHORS[i][0]) {
      const rate = interpolate(t, RATE_ANCHORS[i - 1], RATE_ANCHORS[i]);
      return { temperatureC: t, rate, reliable: t <= 32 && t >= 8 };
    }
  }
  return { temperatureC: t, rate: 1, reliable: false };
}

export function integrateTemperatureSeries(series = []) {
  if (!Array.isArray(series) || series.length < 2) return 0;
  const sorted = [...series]
    .map((p) => ({ at: new Date(p.at).getTime(), tempC: Number(p.tempC) }))
    .filter((p) => Number.isFinite(p.at) && Number.isFinite(p.tempC))
    .sort((a, b) => a.at - b.at);
  let bioHours = 0;
  for (let i = 1; i < sorted.length; i++) {
    const hours = Math.max(0, (sorted[i].at - sorted[i - 1].at) / 3600000);
    const r0 = getTemperatureResponse(sorted[i - 1].tempC).rate;
    const r1 = getTemperatureResponse(sorted[i].tempC).rate;
    bioHours += hours * ((r0 + r1) / 2);
  }
  return bioHours;
}

const PROGRESS = {
  none: 0.08,
  slight: 0.28,
  near: 0.72,
  double: 1,
  peak_plus: 1.08,
  over3: 1.16,
  fallen: 1.20,
  hooch: 0.16
};

export function predictDoublingTime({
  ratio = '1:1:1',
  tempC = 26,
  height = 'slight',
  elapsedHours = null
} = {}) {
  const priorBio = RATIO_PRIOR_BIO_HOURS_26C[ratio] ?? 7;
  const temp = getTemperatureResponse(tempC);
  if (!temp.reliable && Number(tempC) > 32) {
    return {
      reliable: false,
      status: 'high-temp',
      display: '高温超出可靠估时范围',
      lowHours: null,
      highHours: null,
      remainingLowHours: null,
      remainingHighHours: null,
      temperatureResponse: temp
    };
  }

  const priorPhysical = priorBio / Math.max(0.08, temp.rate);
  let center = priorPhysical;
  const elapsed = Number(elapsedHours);
  const progress = PROGRESS[height] ?? 0.28;

  // Online correction: observed height/time nudges the prior without letting one visual
  // snapshot completely override the ratio × temperature prior.
  if (Number.isFinite(elapsed) && elapsed > 0 && progress > 0.12 && progress < 1) {
    const observedTotal = elapsed / progress;
    center = Math.sqrt(priorPhysical * Math.max(elapsed, observedTotal));
  }

  const lowHours = Math.max(0.5, center * 0.78);
  const highHours = Math.max(lowHours + 0.5, center * 1.28);

  if (['double', 'peak_plus', 'over3', 'fallen'].includes(height)) {
    return {
      reliable: true,
      status: height === 'fallen' ? 'past-peak' : 'reached',
      display: height === 'fallen' ? '已越过翻倍/峰值窗口' : '已达到或越过翻倍点',
      lowHours, highHours,
      remainingLowHours: 0,
      remainingHighHours: 0,
      temperatureResponse: temp
    };
  }

  if (Number.isFinite(elapsed) && elapsed >= 0) {
    const remainingLowHours = Math.max(0, lowHours - elapsed);
    const remainingHighHours = Math.max(0, highHours - elapsed);
    const display = remainingHighHours <= 0
      ? '已进入预计翻倍窗口'
      : `剩余约 ${pretty(remainingLowHours)}–${pretty(remainingHighHours)} 小时`;
    return {
      reliable: true, status: 'remaining', display,
      lowHours, highHours, remainingLowHours, remainingHighHours,
      temperatureResponse: temp
    };
  }

  return {
    reliable: true,
    status: 'total',
    display: `预计约 ${pretty(lowHours)}–${pretty(highHours)} 小时`,
    lowHours, highHours,
    remainingLowHours: null, remainingHighHours: null,
    temperatureResponse: temp
  };
}

function pretty(n) {
  if (n < 1) return (Math.round(n * 10) / 10).toFixed(1);
  return String(Math.round(n * 10) / 10).replace(/\.0$/, '');
}
