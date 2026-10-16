const KEY = 'ferjoo:return-intent';
const MAX_AGE = 30 * 60 * 1000;
const ALLOWED = /^\/(?:today|records(?:\/[^/]+)?|me(?:\/devices(?:\/[^/]+)?)?|checkin|feeding|claim|profile|reports\/(?:session|[^/]+)|devices\/[^/]+\/trend)$/;

function safePath(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return null;
  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin || !ALLOWED.test(url.pathname)) return null;
  return `${url.pathname}${url.search}`;
}

export function useReturnIntent(router) {
  function save(path = router.currentRoute.value.fullPath, draftRef = null) {
    const target = safePath(path);
    if (!target) return false;
    sessionStorage.setItem(KEY, JSON.stringify({ path: target, draftRef, createdAt: Date.now() }));
    return true;
  }
  function consume() {
    let value;
    try { value = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { value = null; }
    sessionStorage.removeItem(KEY);
    const target = safePath(value?.path);
    const age = Date.now() - value?.createdAt;
    return target && Number.isFinite(age) && age >= 0 && age <= MAX_AGE ? { ...value, path: target } : null;
  }
  async function restore() {
    const intent = consume();
    await router.replace(intent?.path || '/today');
    return intent;
  }
  return { save, consume, restore };
}
