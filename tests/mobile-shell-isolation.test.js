import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import postcss from 'postcss';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const mobileCss = read('src/assets/mobile.css');
const desktopCss = read('src/assets/main.css');
const tokens = read('src/assets/tokens.css');
const main = read('src/main.js');
const shell = read('src/components/MobileShell.vue');

postcss.parse(mobileCss).walkRules((rule) => {
  assert.match(rule.selector, /^(?::root\.mobile-mode|body\.mobile-mode|\.mobile-area)/, `unscoped mobile rule: ${rule.selector}`);
});
postcss.parse(tokens).walkDecls((decl) => assert.ok(decl.prop.startsWith('--'), 'shared tokens must not apply layout'));
assert.doesNotMatch(mobileCss, /bg2|url\(/);
assert.doesNotMatch(desktopCss, /\.mobile-area|\.mobile-shell/);
assert.doesNotMatch(main, /import ['"]\.\/assets\/main\.css['"]/);
assert.match(shell, /\['MobileToday', 'MobileRecords', 'MobileMe'\]/);
assert.doesNotMatch(shell, /:key="route\.(fullPath|path)"/);
assert.match(shell, /if \(route\.path !== path\)/);
for (const filename of ['src/components/MobileShell.vue', 'src/App.vue']) {
  const { descriptor, errors } = parse(read(filename));
  assert.deepEqual(errors, []);
  const script = compileScript(descriptor, { id: filename });
  const compiled = compileTemplate({ source: descriptor.template.content, filename, id: filename, compilerOptions: { bindingMetadata: script.bindings } });
  assert.deepEqual(compiled.errors, []);
}

let imports = 0;
let mounted = false;
const elements = [];
const classes = () => ({ values: new Map(), toggle(name, enabled) { this.values.set(name, enabled); } });
const document = {
  head: { append: (element) => elements.push(element) },
  documentElement: { classList: classes() },
  body: { classList: classes() },
  createElement: () => ({ dataset: {} })
};
const hooks = {};
const router = {
  beforeResolve: (hook) => { hooks.before = hook; },
  afterEach: (hook) => { hooks.after = hook; },
  isReady: () => Promise.resolve()
};
const context = vm.createContext({
  document, router, App: {},
  createApp: () => ({ use() {}, mount() { mounted = true; } }),
  isMobilePath: (path) => /^\/(today|records|me)(\/|$)/.test(path),
  usesMobileAccountLayout: (route) => route.mobileAccount,
  loadDesktopCss: async () => { imports++; return { default: desktopCss }; }
});
const executable = main.replace(/^import .*;\n/gm, '').replace("import('./assets/main.css?inline')", 'loadDesktopCss()');
await vm.runInContext(executable, context);
await Promise.resolve();
assert.ok(mounted);
for (const route of [{ path: '/today' }, { path: '/login', mobileAccount: true }]) {
  await hooks.before(route);
  hooks.after(route, {});
  assert.equal(imports, 0, 'mobile and mobile account entry must not request desktop CSS');
  assert.equal(elements.length, 0);
  assert.equal(document.body.classList.values.get('mobile-mode'), true);
}
await hooks.before({ path: '/' });
hooks.after({ path: '/' }, {});
assert.equal(imports, 1);
assert.equal(elements[0].media, 'all');
hooks.after({ path: '/today' }, {});
assert.equal(elements[0].media, 'not all');
assert.equal(document.documentElement.classList.values.get('mobile-mode'), true);
hooks.after({ path: '/' }, {}, new Error('cancelled'));
assert.equal(elements[0].media, 'not all', 'failed navigation must retain current layout');
await hooks.before({ path: '/' });
hooks.after({ path: '/' }, {});
assert.equal(imports, 1, 'desktop CSS must be loaded only once');
assert.equal(elements[0].media, 'all');
console.log('ok - isolated style lifecycle, mobile account entry, scoped tokens/mobile CSS and mobile shell compilation');
