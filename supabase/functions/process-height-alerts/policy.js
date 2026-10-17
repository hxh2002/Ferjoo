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
