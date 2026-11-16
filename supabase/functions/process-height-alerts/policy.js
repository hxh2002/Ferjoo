export function safePushEndpoint(value) {
  try {
    const url = new URL(value);
    return typeof value === 'string' && value.length < 2048 && /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|web\.push\.apple\.com)\//.test(value) && url.protocol === 'https:' && !url.username && !url.password && !url.port
      && !url.search && !url.hash && url.pathname.length > 1
      && ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'push.services.mozilla.com', 'web.push.apple.com'].includes(url.hostname);
  } catch { return false; }
}

export async function validInternalSecret(received, expected) {
  if (!expected || expected.length < 32 || !received || received.length > 512) return false;
  const digest = async (value) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [left, right] = await Promise.all([digest(received), digest(expected)]);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

export function retryDelay(attempt, retryAfter, now = Date.now()) {
  const seconds = Number(retryAfter);
  const requested = retryAfter == null ? 0 : Number.isFinite(seconds) ? seconds : (Date.parse(retryAfter) - now) / 1000;
  return Math.max(30, Math.min(3600, Math.ceil(Math.max(60 * 2 ** (attempt - 1), Number.isFinite(requested) ? requested : 0))));
}

export function eligibleRatio(summary) {
  if (!summary || summary.baselinePending || summary.historicalRound || summary.heightStale || !(summary.baselineHeightMm > 0) || !(summary.currentHeightMm > 0)) return null;
  const ratio = summary.currentHeightMm / summary.baselineHeightMm;
  return Number.isFinite(ratio) ? ratio : null;
}

// Peak 只在 rise-phase 锁定后出现（峰后已连续回落），所以过峰提醒必然晚于实际峰值。
export function eligiblePeak(summary) {
  if (eligibleRatio(summary) == null || !summary.peakAt || !(summary.peakHeightMm > 0)) return null;
  const peakRatio = summary.peakHeightMm / summary.baselineHeightMm;
  return Number.isFinite(peakRatio) && Number.isFinite(Date.parse(summary.peakAt)) ? { peakAt: summary.peakAt, peakRatio } : null;
}

export function alertPayload(event, now = Date.now()) {
  const url = `/device?starter=${encodeURIComponent(event.starter_id)}`;
  const current = Number(event.ratio).toFixed(2);
  if (event.kind === 'peak') {
    const minutes = Math.max(0, Math.round((now - Date.parse(event.peak_at)) / 60000));
    return {
      title: '酵种已过 Peak',
      body: `约 ${minutes} 分钟前到达 Peak，膨胀至基线的 ${Number(event.peak_ratio).toFixed(2)} 倍；目前为 ${current} 倍，已开始回落。`,
      tag: `ferjoo-peak-${event.feeding_id}`,
      url,
    };
  }
  return {
    title: `高度已达基线的 ${event.target} 倍`,
    body: `当前高度约为基线的 ${current} 倍，可回到今日页查看本轮喂养情况。`,
    tag: `ferjoo-height-${event.feeding_id}-${event.target}`,
    url,
  };
}
