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
  return ['mobile-login', 'mobile-register', 'claim'].includes(route.name);
}

// 登录、注册、绑定设备都在同一个 MobileShell 里，宽窄屏由 CSS 决定，不再按浏览器类型分流。
export function usesMobileAccountLayout(route) {
  return isSharedAccountPage(route);
}

export function accountDestination(route, router) {
  return safeRedirect(route.query.redirect, router) || '/device';
}

export function authLink(name, route, router) {
  const redirect = safeRedirect(route.query.redirect, router);
  return { name, query: redirect ? { redirect } : {} };
}
