import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import postcss from 'postcss';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { isWelcomeHost, isWelcomeRoute, productRedirect, PRODUCT_ORIGIN } from '../src/lib/site-entry.js';
import { desktopNavItems } from '../src/lib/desktop-nav.js';
import { pageTitle } from '../src/lib/page-title.js';
import { safeRedirect, usesMobileAccountLayout, accountDestination } from '../src/lib/accountNavigation.js';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const compile = (file) => {
  const { descriptor, errors } = parse(read(file));
  assert.deepEqual(errors, [], `${file} parses`);
  const script = compileScript(descriptor, { id: file });
  const template = compileTemplate({ source: descriptor.template.content, filename: file, id: file, compilerOptions: { bindingMetadata: script.bindings } });
  assert.deepEqual(template.errors, [], `${file} template compiles`);
  return { source: descriptor.template.content, script: descriptor.scriptSetup?.content || '', code: template.code };
};

// 1. Hostname alone selects the site; width and user agent never do.
for (const host of ['ferjoo.com', 'www.ferjoo.com', 'FERJOO.COM', 'ferjoo.com.', 'ferjoo.localhost', 'www.ferjoo.localhost']) {
  assert.equal(isWelcomeHost(host), true, `${host} serves the welcome page`);
}
for (const host of ['dr.ferjoo.com', 'dr.ferjoo.localhost', 'localhost', '127.0.0.1', '192.168.1.8', 'ferjoo.com.evil.test', 'notferjoo.com', 'ferjoo.vercel.app', '', undefined]) {
  assert.equal(isWelcomeHost(host), false, `${host} serves the product`);
}
assert.equal(isWelcomeRoute({ meta: { welcome: true } }), true);
assert.equal(isWelcomeRoute({ meta: {} }), false);
assert.equal(isWelcomeRoute({ name: 'mobile-device' }), false);
const at = (hostname, pathname, extra = {}) => ({ hostname, pathname, search: '', hash: '', protocol: 'https:', port: '', ...extra });
assert.equal(productRedirect(at('ferjoo.com', '/')), '', 'welcome root stays on the welcome page');
assert.equal(productRedirect(at('www.ferjoo.com', '/device', { search: '?a=1', hash: '#x' })), `${PRODUCT_ORIGIN}/device?a=1#x`, 'other paths go to the product host untouched');
assert.equal(productRedirect(at('ferjoo.localhost', '/me', { protocol: 'http:', port: '5173' })), 'http://dr.ferjoo.localhost:5173/me');
assert.equal(productRedirect(at('dr.ferjoo.com', '/device')), '', 'the product host never redirects');
assert.equal(productRedirect(at('localhost', '/anything')), '');
assert.equal(PRODUCT_ORIGIN, 'https://dr.ferjoo.com');

const router = read('src/router/index.js');
const rootRoute = router.match(/\{\s*path: '\/',\s*name: 'welcome'[\s\S]*?\n  \},/)[0];
assert.match(rootRoute, /meta: \{ welcome: true \}/);
assert.match(rootRoute, /isWelcomeHost\(\) \? true : \{ path: '\/device', query: to\.query, hash: to\.hash, replace: true \}/, 'product hosts open the product body at /');
assert.doesNotMatch(router, /isMobileBrowser|userAgent|innerWidth|matchMedia|view=desktop|view !== 'desktop'/, 'router does not branch on device or width');
assert.doesNotMatch(router, /name: 'doctor'|LoginView|RegisterView|HistoryView|ProfileView/, 'no second desktop UI is routed');
for (const [from, to] of [['/login', 'mobile-login'], ['/register', 'mobile-register']]) {
  assert.match(router, new RegExp(`path: '${from}', redirect: \\(to\\) => \\(\\{ name: '${to}'`), `${from} keeps working through the shared shell`);
}
assert.match(router, /path: '\/history', redirect: legacy\('\/doctor\/records'\)/);
assert.match(router, /path: '\/profile', redirect: legacy\('\/me\/profile'\)/);
assert.match(router, /path: 'claim', name: 'claim'.*requiresAuth: true/, 'QR claim links keep their route inside the shell');
assert.match(router, /return \{ name: 'mobile-login', query \}/, 'guards always send guests to the shared login');
assert.equal(existsSync(new URL('../src/lib/device.js', import.meta.url)), false, 'user-agent helper is gone');
assert.equal(usesMobileAccountLayout({ name: 'claim' }), true);
assert.equal(usesMobileAccountLayout({ name: 'mobile-device' }), false);
assert.equal(accountDestination({ query: {} }, {}), '/device');

// 2. One responsive shell: no manual switch, no one-shot width lock, one page outlet.
const shell = compile('src/components/MobileShell.vue');
assert.equal((shell.source.match(/<RouterView/g) || []).length, 1, 'a single page outlet for every width');
assert.equal((shell.source.match(/<DesktopNav/g) || []).length, 1);
assert.match(shell.source, /<nav v-if="showTabs" class="mobile-tabbar"/);
assert.doesNotMatch(shell.script, /useDesktopLayout|isDesktop|matchMedia\('\(min-width|innerWidth|userAgent/, 'the shell never measures width');
const app = compile('src/App.vue');
assert.equal((app.source.match(/<RouterView/g) || []).length, 2, 'welcome or product, one outlet each');
assert.doesNotMatch(app.script, /isMobileBrowser|userAgent|innerWidth/);
const manualSwitch = /访问电脑端|访问手机端|切换(到)?(电脑|桌面|手机)|view=desktop|view: 'desktop'|desktop-entry|desktopMode|forceDesktop|setLayout/;
for (const file of ['src/App.vue', 'src/main.js', 'src/router/index.js', 'src/components/MobileShell.vue', 'src/components/DesktopNav.vue', 'src/views/mobile/MobileMe.vue', 'src/views/WelcomeView.vue', 'src/assets/desktop.css', 'src/assets/mobile.css']) {
  assert.doesNotMatch(read(file), manualSwitch, `${file} has no manual layout switch`);
}
for (const file of ['src/components/MobileShell.vue', 'src/components/DesktopNav.vue', 'src/lib/accountNavigation.js', 'src/main.js', 'src/views/ClaimView.vue']) {
  assert.doesNotMatch(read(file), /userAgent|isMobileBrowser|maxTouchPoints/, `${file} does not split by user agent`);
}
// The only live width listener is the shared 768px query, used by the diary's week/month structure.
const layout = read('src/composables/useDesktopLayout.js');
assert.match(layout, /DESKTOP_QUERY = '\(min-width: 768px\)'/);
assert.match(layout, /addEventListener\('change', update\)/, 'breakpoint changes are observed live');
assert.match(read('src/views/mobile/MobileDiary.vue'), /watch\(isDesktop, \(desktop\) => \{ calendarOpen\.value = desktop; \}, \{ immediate: true \}\)/);
assert.match(read('src/views/mobile/MobileMe.vue'), /<main class="m-page mobile-me">/);

// 3. Desktop chrome is hidden below 768px and every desktop rule is gated by the breakpoint.
const desktopCss = postcss.parse(read('src/assets/desktop.css'));
const outsideMedia = [];
let minWidths = new Set();
desktopCss.each((node) => {
  if (node.type === 'rule') outsideMedia.push(node);
  if (node.type === 'atrule' && node.name === 'media') {
    minWidths.add(node.params);
    node.walkRules((rule) => assert.match(rule.selector, /^(?::root\.mobile-mode|body\.mobile-mode|\.mobile-area)/, `unscoped desktop rule: ${rule.selector}`));
  }
});
assert.equal(outsideMedia.length, 1, 'only the base "hide the chrome" rule lives outside a media query');
assert.equal(outsideMedia[0].selector, '.mobile-area .desktop-sidebar, .mobile-area .desktop-topbar');
assert.deepEqual(outsideMedia[0].nodes.map((decl) => `${decl.prop}:${decl.value}`), ['display:none']);
assert.ok([...minWidths].every((query) => Number(query.match(/min-width: (\d+)px/)?.[1]) >= 768), 'every desktop query starts at 768px or wider');
const css = read('src/assets/desktop.css');
assert.match(css, /\.mobile-area \.mobile-shell > :is\(\.mobile-topbar, \.mobile-tabbar\) \{ display: none; \}/, 'phone chrome yields to desktop chrome at 768px');
assert.ok(!/@media[^{]*max-width:\s*(?:[1-6]\d\d|7[0-5]\d|76\d)px/.test(css), 'no media query targets the phone range');
const mobileCss = read('src/assets/mobile.css');
assert.doesNotMatch(mobileCss, /desktop-sidebar|desktop-topbar|min-width: 768px/, 'mobile stylesheet is unchanged by desktop work');

// 4. Desktop shares services, cache and state with the phone pages: it owns none.
const desktopNav = compile('src/components/DesktopNav.vue');
const desktopImports = [...read('src/components/DesktopNav.vue').matchAll(/from '([^']+)'/g)].map((match) => match[1]);
assert.deepEqual(desktopImports.sort(), ['../composables/useAuth.js', '../lib/desktop-nav.js', './DrFerjooMark.vue', 'vue', 'vue-router'].sort(), 'navigation only touches shared auth and routes');
for (const file of ['src/components/DesktopNav.vue', 'src/lib/desktop-nav.js', 'src/lib/page-title.js', 'src/composables/useDesktopLayout.js', 'src/assets/desktop.css']) {
  assert.doesNotMatch(read(file), /services\/|read-cache|localStorage|sessionStorage|indexedDB|fetch\(|supabase|listCareRecords|new Map\(/, `${file} owns no data, cache or requests`);
}
assert.equal(existsSync(new URL('../src/services/desktop.service.js', import.meta.url)), false);
const routeSource = router;
for (const item of desktopNavItems) {
  const child = item.to.slice(1);
  assert.match(routeSource, new RegExp(`path: '${child}'`), `${item.to} is an existing shared route`);
}
const active = (path) => desktopNavItems.filter((item) => item.match(path)).map((item) => item.label);
assert.deepEqual(active('/device'), ['设备']);
assert.deepEqual(active('/devices/d1/trend'), ['设备']);
assert.deepEqual(active('/diary/records/r1'), ['日记']);
assert.deepEqual(active('/doctor/rounds'), ['酵种医生']);
assert.deepEqual(active('/checkin'), ['酵种医生']);
assert.deepEqual(active('/reports/session'), ['酵种医生']);
assert.deepEqual(active('/doctor/records'), ['诊断记录']);
assert.deepEqual(active('/reports/abc'), ['诊断记录']);
assert.deepEqual(active('/feeding'), ['记录喂养']);
assert.deepEqual(active('/me/devices/add'), ['设备绑定']);
assert.deepEqual(active('/claim'), ['设备绑定']);
assert.deepEqual(active('/me/help/faq'), ['我的']);
assert.equal(pageTitle({ path: '/me/devices/add', meta: {} }), '添加设备');
assert.equal(pageTitle({ path: '/doctor/records', meta: { title: '酵种医生' } }), '酵种医生');
assert.equal(pageTitle({ path: '/me/help/privacy', meta: {} }), '隐私与权限');
assert.equal(pageTitle({ path: '/unknown', meta: {} }), '养护详情', 'phone fallback title is preserved');
assert.equal(safeRedirect('/claim?code=ABCD', { resolve: () => ({ matched: [1], name: 'claim', fullPath: '/claim?code=ABCD' }) }), '/claim?code=ABCD');

// 5. Copy: reuse the phone app's plain function names; no coined terms.
const coined = /工作台|养护工作台|发酵工作台|设备中心|个人中心|实时状态|首页与记录|记录与设备|账号与支持|每一次变化，都有迹可循|慢慢理解你的酵种/;
for (const file of ['src/components/DesktopNav.vue', 'src/lib/desktop-nav.js', 'src/lib/page-title.js', 'src/views/WelcomeView.vue', 'src/assets/desktop.css', 'src/router/index.js']) {
  assert.doesNotMatch(read(file), coined, `${file} has no coined product terms`);
}
assert.deepEqual(desktopNavItems.map((item) => item.label), ['设备', '日记', '酵种医生', '诊断记录', '记录喂养', '设备绑定', '我的']);

// 6. Welcome page is the public start screen: carousel, stay-updated, and contact.
const welcome = compile('src/views/WelcomeView.vue');
assert.match(welcome.source, /SourMate/);
assert.match(welcome.source, /Understand your starter\./);
assert.match(welcome.source, /Stay updated/);
assert.match(welcome.script, /Know when your starter is rising, peaking and ready\./);
assert.match(welcome.script, /Look back on every day of your starter’s journey\./);
assert.match(welcome.script, /Your sourdough starter’s personal doctor\./);
assert.match(welcome.script, /See when your starter is expected to peak\./);
for (const label of ['Device', 'Data', 'Journal', 'Doctor', 'Timing']) {
  assert.match(welcome.script, new RegExp(`label: '${label}'`), `${label} is a carousel state`);
}
assert.match(welcome.script, /hash: '#stay'/);
assert.match(welcome.script, /hash: '#contact'/);
assert.match(welcome.source, /Stay updated with Ferjoo/);
assert.match(welcome.source, /Keep me posted/);
assert.match(welcome.source, /Send message/);
assert.match(welcome.source, /Back to home/);
assert.match(welcome.source, /Received\. Your email has been saved\./);
assert.match(welcome.source, /Received\. Your message has been saved\./);
assert.match(welcome.script, /submitWelcomeInquiry/);
assert.doesNotMatch(welcome.script, /fetch\(|from ['"][^'"]*supabase|createClient/, 'the page calls the inquiry service');
assert.doesNotMatch(welcome.source, /https?:\/\//, 'no invented URLs in the template');
assert.doesNotMatch(welcome.source, /产品|关于|Ferment with joy/, 'the old start page is gone');
assert.match(read('src/views/WelcomeView.vue'), /min-width: 900px/, 'wide and narrow layouts are separate');
assert.doesNotMatch(read('src/components/DesktopNav.vue'), /variant="cn"|logoBrand|logo-brand/, 'product navigation uses the default English mark');
assert.match(read('src/components/DesktopNav.vue'), /<DrFerjooMark plain\s*\/>/, 'the sidebar brand is the flat wordmark');
assert.doesNotMatch(read('src/components/MobileShell.vue'), /DrFerjooMark|mobile-brand|variant="cn"|logoBrand|logo-brand/, 'the phone shell does not show the Dr. Ferjoo mark');
assert.match(read('src/components/DrFerjooMark.vue'), /variant === 'cn' \? classicAssets\.logoChinese : classicAssets\.logoEnglish/);
assert.match(read('src/components/DrFerjooMark.vue'), /v-if="!plain"/, 'the moving field is omitted from the flat wordmark');
assert.match(read('src/components/DrFerjooMark.vue'), /--brand-primary/, 'the flat wordmark takes the brand orange');
assert.match(read('src/lib/site-entry.js'), /ferjoo\\\.\(\?:com\|localhost\)/);

// Welcome motion stays on the page: shared tokens, no extra runtime, reduced motion keeps state feedback.
const welcomeFile = read('src/views/WelcomeView.vue');
assert.match(welcomeFile, /--motion-expand/);
assert.match(welcomeFile, /--motion-base/);
assert.match(welcomeFile, /--motion-fast/);
assert.match(welcomeFile, /--press-scale/);
assert.match(welcomeFile, /translate3d\(var\(--motion-overlay\)/);
assert.match(welcomeFile, /@media \(hover: hover\) and \(pointer: fine\)/);
assert.match(welcomeFile, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(welcomeFile, /animation: copy-in-fade var\(--motion-fast\)/);
assert.match(welcome.script, /ArrowRight/);
assert.match(welcome.script, /ArrowLeft/);
assert.match(welcome.script, /const AUTO_MS = 8000/);
assert.match(welcome.script, /addEventListener\('wheel', onWheel, \{ passive: false \}\)/);
assert.match(welcome.script, /prefers-reduced-motion: reduce/);
assert.match(welcome.script, /visibilitychange/);
assert.match(welcome.script, /hash: '#stay'/);
assert.doesNotMatch(welcomeFile, /framer-motion|gsap|animejs|@vueuse\/motion/);
assert.match(welcome.source, /is-current/);
assert.match(welcome.source, /role="tablist"/);

// Desktop feature switcher: labels and the jar glyph share one column edge,
// and every active row uses the same step instead of a per-page nudge.
assert.match(welcome.source, /--switcher-index': index/);
assert.match(welcomeFile, /\.switcher button :is\(span, \.jar-glyph\) \{ grid-column: 1; justify-self: end; text-align: right;/);
assert.match(welcomeFile, /--switcher-step: 39px;/);
assert.match(welcomeFile, /--switcher-anchor: calc\(\(var\(--switcher-count\) - 1\) \/ 2\);/);
assert.match(welcomeFile, /transform: translateY\(calc\(\(var\(--switcher-anchor\) - var\(--switcher-index, var\(--switcher-anchor\)\)\) \* var\(--switcher-step\)\)\);/);
assert.doesNotMatch(welcomeFile, /--switcher-nudge/);
assert.match(welcomeFile, /\.switcher \{ display: none; \}/);
assert.match(welcomeFile, /\.pager \{ display: none; \}/);

console.log('ok - hostname entry, one responsive shell, shared state/cache, desktop-gated CSS, plain copy and welcome navigation');
