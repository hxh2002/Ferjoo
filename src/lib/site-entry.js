// 站点入口只看 hostname：ferjoo.com 是欢迎页，其余（dr.ferjoo.com、本地、预览域名）都是产品主体。
// 宽窄屏由 CSS 断点决定，这里不参与。
export const PRODUCT_ORIGIN = 'https://dr.ferjoo.com';

// *.localhost 在主流浏览器里直接解析到本机，用 ferjoo.localhost 就能本地预览欢迎页。
const WELCOME_HOSTS = /^(?:www\.)?ferjoo\.(?:com|localhost)$/i;

export function isWelcomeHost(hostname = globalThis.location?.hostname) {
  return WELCOME_HOSTS.test(String(hostname || '').replace(/\.$/, ''));
}

export function isWelcomeRoute(route) {
  return route?.meta?.welcome === true;
}

// 欢迎域名只承载 "/"；其它路径（旧书签、认证邮件回跳）原样交给产品域名。
export function productRedirect(location = globalThis.location) {
  if (!location || !isWelcomeHost(location.hostname)) return '';
  if (location.pathname === '/' || location.pathname === '') return '';
  const local = /\.localhost$/i.test(location.hostname);
  const origin = local ? `${location.protocol}//dr.ferjoo.localhost${location.port ? `:${location.port}` : ''}` : PRODUCT_ORIGIN;
  return `${origin}${location.pathname}${location.search}${location.hash}`;
}
