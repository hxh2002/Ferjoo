// 游客 / 成员判定集中在一处：会话恢复前 ready=false，此时既不能当游客（会闪一下「去登录」），
// 也不能当成员（请求必然失败），页面必须先渲染骨架屏。
export function authPhase(auth) {
  if (auth?.user?.value) return 'member';
  if (auth?.ready?.value === false) return 'pending';
  // 只注入 user / init 的旧调用方（含 SSR 测试桩）没有 ready，按已就绪处理，保持既有渲染。
  return 'guest';
}

export const isGuest = (auth) => authPhase(auth) === 'guest';
export const isAuthPending = (auth) => authPhase(auth) === 'pending';

// 回跳地址去掉滚动位置：登录后回到同一屏内容即可，恢复登录前的 scroll 反而会停在空白处。
// 日期、酵种、页码等筛选必须保留，否则登录回来看到的是另一天的记录。
const TRANSIENT_QUERY = new Set(['scroll']);

export function guestRedirectPath(route) {
  const path = route?.path || '/device';
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(route?.query || {})) {
    if (TRANSIENT_QUERY.has(key)) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item != null && item !== '') query.append(key, String(item));
    }
  }
  const search = query.toString();
  return `${path}${search ? `?${search}` : ''}${route?.hash || ''}`;
}

// mobile-login / mobile-register 都挂在 MobileShell 子路由里，用 name 跳转不会被桌面入口截走；
// redirect 交给 accountNavigation.accountDestination 在登录成功后 replace 回来。
export function guestLoginTarget(route) {
  return { name: 'mobile-login', query: { redirect: guestRedirectPath(route) } };
}

export function guestRegisterTarget(route) {
  return { name: 'mobile-register', query: { redirect: guestRedirectPath(route) } };
}
