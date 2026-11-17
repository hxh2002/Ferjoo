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
assert.match(css, /\.mobile-area \.mobile-shell > :is\(\.mobile-topbar, \.mobile-tabbar, \.mobile-brand\) \{ display: none; \}/, 'phone chrome yields to desktop chrome at 768px');
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

// 6. Welcome page: two top-level tabs, an expandable product menu, brief copy.
const welcome = compile('src/views/WelcomeView.vue');
const nav = welcome.source.match(/<nav class="welcome-nav"[\s\S]*?<\/nav>/)[0];
assert.match(nav, /aria-label="主导航"/);
assert.match(nav, /aria-controls="welcome-products"/);
assert.match(nav, /:aria-expanded="open"/);
assert.match(nav, /<ul id="welcome-products"[^>]*:hidden="!open"/);
const menuItems = [...nav.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((match) => match[1]);
assert.equal(menuItems.length, 2, 'product menu is exactly the two products');
assert.match(menuItems[0], />SourMate<\/RouterLink>/);
assert.match(menuItems[1], /aria-label="Dr\. Ferjoo"/);
assert.match(menuItems[1], /<DrFerjooMark\s*\/>/);
assert.doesNotMatch(menuItems[1], /logo-brand|Ferjoo 通用|>Dr\. Ferjoo/);
assert.match(nav, /<RouterLink :to="\{ path: '\/', hash: '#sourmate' \}"[^>]*>SourMate<\/RouterLink>/, 'SourMate points to the on-page section, not an invented site');
assert.match(nav, /<a class="welcome-doctor" :href="PRODUCT_ORIGIN" aria-label="Dr\. Ferjoo"/);
const tabs = nav.replace(/<ul[\s\S]*?<\/ul>/, '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean);
assert.deepEqual(tabs, ['产品', '关于'], 'only 产品 and 关于 sit in the top bar');
assert.match(nav, /hash: '#about'/);
assert.match(welcome.source, /<section id="sourmate"/);
assert.match(welcome.source, /<section id="about"/);
assert.equal((welcome.source.match(/PRODUCT_ORIGIN/g) || []).length, 1, 'no repeated Dr. Ferjoo calls to action');
assert.doesNotMatch(welcome.source, /https?:\/\/(?!www\.facebook|www\.instagram|xhslink)/, 'no invented URLs in the template');
assert.doesNotMatch(welcome.source, /\d+\s*[+%万]|立即|马上|免费|购买|了解更多|Learn more|Get started/, 'no statistics or marketing buttons');
assert.equal((welcome.source.match(/<section/g) || []).length, 3, 'hero, SourMate and about only');
const menuScript = welcome.script;
assert.match(menuScript, /event\.key !== 'Escape'/);
assert.match(menuScript, /menuButton\.value\?\.focus\(\)/, 'Escape returns focus to the trigger');
assert.match(menuScript, /document\.addEventListener\('pointerdown', onDocumentPointerDown\)/);
assert.match(menuScript, /document\.removeEventListener\('pointerdown', onDocumentPointerDown\)/);
assert.match(menuScript, /event\.pointerType === 'mouse'/, 'hover opens only for a real mouse; touch uses click');
assert.match(welcome.source, /@focusin="show" @focusout="onFocusOut"/);
assert.match(welcome.source, /@keydown="onKeydown"/);
const brief = welcome.source.replace(/<[^>]+>/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean).join('');
assert.ok(brief.length < 420, `welcome copy stays brief (${brief.length})`);
assert.match(read('src/lib/site-entry.js'), /ferjoo\\\.\(\?:com\|localhost\)/);

console.log('ok - hostname entry, one responsive shell, shared state/cache, desktop-gated CSS, plain copy and welcome navigation');
