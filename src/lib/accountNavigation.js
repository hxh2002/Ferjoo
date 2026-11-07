import { isMobileBrowser } from './device.js';

export function safeRedirect(value, router) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '';
  try {
    const decodedPath = decodeURIComponent(value.split(/[?#]/, 1)[0]);
    if (/[\\\u0000-\u001f\u007f]/.test(decodedPath) || decodedPath.startsWith('//')) return '';
    if (/[\u0000-\u001f\u007f]/.test(value)) return '';
    const resolved = router.resolve(value);
    if (!resolved.matched.length || ['login', 'register', 'mobile-login', 'mobile-register'].includes(resolved.name)) return '';
    return resolved.fullPath;
  } catch {
    return '';
  }
}

// today/records 是迁移前的地址，仍需按移动端渲染以便 redirect 生效。
export function isMobilePath(path) {
  return /^\/(device|diary|today|records|checkin|feeding|reports|devices|doctor|me)(\/|$)/.test(path);
}

export function isSharedAccountPage(route) {
  return ['login', 'register', 'mobile-login', 'mobile-register', 'profile', 'claim'].includes(route.name);
}

export function usesMobileAccountLayout(route, router) {
  // 移动端专用登录/注册路由只存在于 MobileShell 子树里，永远按移动布局渲染。
  if (['mobile-login', 'mobile-register'].includes(route.name)) return true;
  return isSharedAccountPage(route)
    && (isMobileBrowser() || isMobilePath(safeRedirect(route.query.redirect, router)));
}

export function accountDestination(route, router) {
  return safeRedirect(route.query.redirect, router)
    || (usesMobileAccountLayout(route, router) ? '/device' : '/history');
}

export function authLink(name, route, router) {
  const redirect = safeRedirect(route.query.redirect, router);
  return { name, query: redirect ? { redirect } : {} };
}
