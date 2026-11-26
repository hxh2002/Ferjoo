import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import postcss from 'postcss';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { isMobilePath } from '../src/lib/accountNavigation.js';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const mobileCss = read('src/assets/mobile.css');
const tokens = read('src/assets/tokens.css');
const main = read('src/main.js');
const shell = read('src/components/MobileShell.vue');

postcss.parse(mobileCss).walkRules((rule) => {
  assert.match(rule.selector, /^(?::root\.mobile-mode|body\.mobile-mode|\.mobile-area)/, `unscoped mobile rule: ${rule.selector}`);
});
postcss.parse(tokens).walkDecls((decl) => assert.ok(decl.prop.startsWith('--'), 'shared tokens must not apply layout'));
assert.doesNotMatch(mobileCss, /bg2|url\(/);
assert.match(mobileCss, /--m-page-max: 42rem/);
assert.match(mobileCss, /\.mobile-main \.m-page \{[^}]*max-width: var\(--m-page-max/, 'every mobile page shares one max width');
assert.doesNotMatch(main, /main\.css/);
assert.doesNotMatch(main, /beforeResolve/);
assert.match(shell, /\['MobileDeviceHome', 'MobileDiary', 'MobileMe'\]/);
assert.doesNotMatch(shell, /:key="route\.(fullPath|path)"/);
assert.match(shell, /if \(route\.path !== path\)/);
for (const filename of ['src/components/MobileShell.vue', 'src/App.vue']) {
  const { descriptor, errors } = parse(read(filename));
  assert.deepEqual(errors, []);
  const script = compileScript(descriptor, { id: filename });
  const compiled = compileTemplate({ source: descriptor.template.content, filename, id: filename, compilerOptions: { bindingMetadata: script.bindings } });
  assert.deepEqual(compiled.errors, []);
}

let mounted = false;
const classes = () => ({ values: new Map(), toggle(name, enabled) { this.values.set(name, enabled); } });
const document = {
  documentElement: { classList: classes() },
  body: { classList: classes() }
};
const hooks = {};
const router = {
  afterEach: (hook) => { hooks.after = hook; },
  isReady: () => Promise.resolve()
};
const context = vm.createContext({
  document, router, App: {},
  createApp: () => ({ use() {}, mount() { mounted = true; } }),
  isMobilePath,
  usesMobileAccountLayout: (route) => route.mobileAccount,
  productRedirect: () => ''
});
const executable = main.replace(/^import .*;\n/gm, '');
await vm.runInContext(executable, context);
await Promise.resolve();
assert.ok(mounted);
for (const route of [{ path: '/device' }, { path: '/login', mobileAccount: true }, { path: '/admin/users' }]) {
  hooks.after(route, {});
  assert.equal(document.body.classList.values.get('mobile-mode'), true, `${route.path} uses the product shell`);
  assert.equal(document.documentElement.classList.values.get('mobile-mode'), true);
}
hooks.after({ path: '/', meta: { welcome: true } }, {});
assert.ok(!document.body.classList.values.get('mobile-mode'), 'welcome route is outside mobile-mode');
hooks.after({ path: '/device' }, {}, new Error('cancelled'));
assert.ok(!document.body.classList.values.get('mobile-mode'), 'failed navigation must retain the current mode');
console.log('ok - isolated style lifecycle, mobile account entry, scoped tokens/mobile CSS and mobile shell compilation');
