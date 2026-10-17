// 高度阈值与浏览器授权辅助；预约与投递由 Supabase 托管服务端处理，页面不再本地发送通知。
export const HEIGHT_ALERT_TARGETS = [2, 2.5, 3];

const STORAGE_KEY = 'ferjoo.height-alerts.v1';
const SERVICE_WORKER_PATH = '/sw.js';
const ICON_PATH = '/assets/logo.svg';

function box(storage) {
  if (storage) return storage;
  return typeof localStorage === 'undefined' ? null : localStorage;
}

export function alertStorageKey(accountId) {
  return `${STORAGE_KEY}:${accountId || 'guest'}`;
}

function normalize(raw) {
  const targets = Array.isArray(raw?.targets) ? raw.targets.filter((target) => HEIGHT_ALERT_TARGETS.includes(target)) : [];
  const notified = {};
  for (const target of HEIGHT_ALERT_TARGETS) {
    const entry = raw?.notified?.[String(target)];
    if (entry && typeof entry.feedingId === 'string') notified[String(target)] = { feedingId: entry.feedingId, at: entry.at || null };
  }
  return { targets: [...new Set(targets)].sort((a, b) => a - b), notified };
}

export function readHeightAlerts(accountId, storage) {
  const target = box(storage);
  if (!target) return normalize(null);
  try {
    return normalize(JSON.parse(target.getItem(alertStorageKey(accountId)) || 'null'));
  } catch {
    return normalize(null);
  }
}

export function writeHeightAlerts(accountId, state, storage) {
  const next = normalize(state);
  const target = box(storage);
  if (target) {
    try {
      target.setItem(alertStorageKey(accountId), JSON.stringify(next));
    } catch {
      // 隐私模式等写入失败场景：保留内存状态，不影响提醒判断。
    }
  }
  return next;
}

export function toggleHeightTarget(state, target) {
  const current = normalize(state);
  if (!HEIGHT_ALERT_TARGETS.includes(target)) return current;
  const targets = current.targets.includes(target)
    ? current.targets.filter((item) => item !== target)
    : [...current.targets, target].sort((a, b) => a - b);
  return { targets, notified: current.notified };
}

// 只返回本轮喂养尚未提醒过的阈值；同一轮内每个阈值只提醒一次，下一次喂养后可再次提醒。
export function pendingHeightAlerts({ state, feedingId, baselineHeightMm, currentHeightMm } = {}) {
  const current = normalize(state);
  if (!current.targets.length || !feedingId) return [];
  if (!(baselineHeightMm > 0) || !(currentHeightMm > 0)) return [];
  const ratio = currentHeightMm / baselineHeightMm;
  return current.targets
    .filter((target) => ratio >= target && current.notified[String(target)]?.feedingId !== feedingId)
    .map((target) => ({ target, ratio }));
}

export function markHeightAlertNotified(state, target, feedingId, at) {
  const current = normalize(state);
  if (!current.targets.includes(target) || !feedingId) return current;
  return {
    targets: current.targets,
    notified: { ...current.notified, [String(target)]: { feedingId, at: at || new Date().toISOString() } }
  };
}

export function heightAlertMessage(target, ratio) {
  return {
    title: `高度已达基线的 ${target} 倍`,
    body: `当前高度约为基线的 ${ratio.toFixed(2)} 倍，可回到今日页查看本轮喂养情况。`
  };
}

export function notificationPermission(scope = globalThis) {
  if (typeof scope?.Notification !== 'function') return 'unsupported';
  return scope.Notification.permission || 'default';
}

export async function enableSystemNotification(scope = globalThis) {
  if (typeof scope?.Notification !== 'function') return 'unsupported';
  if (scope.Notification.permission === 'granted') return 'granted';
  if (scope.Notification.permission === 'denied') return 'denied';
  try {
    return await scope.Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

// 优先进系统级通知（经 Service Worker，页面切到后台也能弹出并留在通知中心）；失败再退回页面通知。
export async function sendSystemNotification({ title, body, tag }, scope = globalThis) {
  if (typeof scope?.Notification !== 'function' || scope.Notification.permission !== 'granted') return false;
  try {
    const registration = scope.navigator?.serviceWorker?.register
      ? await scope.navigator.serviceWorker.register(SERVICE_WORKER_PATH)
      : null;
    if (registration?.showNotification) {
      await registration.showNotification(title, { body, tag, icon: ICON_PATH, badge: ICON_PATH });
      return true;
    }
  } catch {
    // 无 Service Worker 或注册失败时继续尝试页面通知。
  }
  try {
    new scope.Notification(title, { body, tag });
    return true;
  } catch {
    return false;
  }
}
