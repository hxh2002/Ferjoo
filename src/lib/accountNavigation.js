import { isMobileBrowser } from './device.js';

export function safeRedirect(value, router) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '';
  try {
    const decodedPath = decodeURIComponent(value.split(/[?#]/, 1)[0]);
    if (/[\\\u0000-\u001f\u007f]/.test(decodedPath) || decodedPath.startsWith('//')) return '';
    if (/[\u0000-\u001f\u007f]/.test(value)) return '';
    const resolved = router.resolve(value);
    if (!resolved.matched.length || ['login', 'register'].includes(resolved.name)) return '';
    return resolved.fullPath;
  } catch {
    return '';
  }
}

export function isMobilePath(path) {
  return /^\/(today|records|checkin|feeding|reports|devices|me)(\/|$)/.test(path);
}

export function isSharedAccountPage(route) {
  return ['login', 'register', 'profile', 'claim'].includes(route.name);
}

export function usesMobileAccountLayout(route, router) {
  return isSharedAccountPage(route)
    && (isMobileBrowser() || isMobilePath(safeRedirect(route.query.redirect, router)));
}

export function accountDestination(route, router) {
  return safeRedirect(route.query.redirect, router)
    || (usesMobileAccountLayout(route, router) ? '/today' : '/history');
}

export function authLink(name, route, router) {
  const redirect = safeRedirect(route.query.redirect, router);
  return { name, query: redirect ? { redirect } : {} };
}
