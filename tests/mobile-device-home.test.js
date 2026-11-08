import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import * as Vue from 'vue';
import { renderToString } from '@vue/server-renderer';
import { summarizeFeedingMeasurements } from '../src/services/feeding-analysis.service.js';
import { CLOSE_REASON_LABELS, roundState } from '../src/lib/mobile-records.js';
import { guestLoginTarget, guestRegisterTarget, isAuthPending, isGuest } from '../src/lib/mobile-guest.js';

const file = new URL('../src/views/mobile/MobileDeviceHome.vue', import.meta.url);
const source = await readFile(file, 'utf8');
const { descriptor, errors } = parse(source);
assert.deepEqual(errors, []);
const compiled = compileScript(descriptor, { id: 'device-home-test' });
assert.equal(compiled.bindings.refresh, 'setup-const');
assert.match(source, /defineOptions\(\{ name: 'MobileDeviceHome' \}\)/);
// 设备页是「喂养摘要 + 三色数据块 + 单一主按钮」，图表下放到数据详情。
assert.match(source, /本次喂养/);
assert.match(source, /当前数据/);
assert.match(source, /膨胀率/);
assert.match(source, /metric-row/);
assert.match(source, /feed-summary/);
assert.match(source, /device-cta/);
assert.match(source, /listMeasurementsRange/);
assert.match(source, /summarizeFeedingMeasurements/);
assert.match(source, /jarLevel/);
assert.match(source, /jar-rise[\s\S]*measured/);
assert.match(source, /fermentation-window\.service\.js/);
assert.match(source, /结束当前发酵/);
assert.match(source, /确认结束/);
assert.match(source, /历史记录已保存/);
assert.match(source, /\/me\/devices\?bind=1/);
assert.match(source, /mode: 'diagnosis'/);
assert.match(source, /linkStarterDevice/);
assert.doesNotMatch(source, /SeriesChart/, 'charts move to the detail page, not the device home');
// 酵种弹层只有 280px：.starter-choice 既是 grid 子项又是 flex 容器，两层都要 min-width:0
// 才能让长酵种名收缩换行；删除键还要压过 .picker-menu button 的 width:100%（0,1,1），
// 否则会占满整行、把名字挤成一字一行的竖排。
assert.match(source, /\.starter-choice\{[^}]*min-width:0/, '.starter-choice must shrink inside the grid popover');
assert.match(source, /\.starter-choice > button:first-child\{[^}]*min-width:0/, 'starter name button must shrink inside the flex row');
assert.match(source, /\.starter-choice \.starter-delete\{[^}]*flex:none;width:auto/, 'delete button keeps its intrinsic width despite .picker-menu button{width:100%}');
assert.doesNotMatch(source, /readDraft|hasDraft|继续本次观察|记录观察/);
const template = compileTemplate({ source: descriptor.template.content, filename: 'MobileDeviceHome.vue', id: 'device-home-test' });
assert.deepEqual(template.errors, []);

const now = Date.now();
const iso = (minutes) => new Date(now - minutes * 60000).toISOString();
const feeding = { id: 'feeding', starter_id: 's1', kind: 'feeding', occurred_at: iso(70), input: {}, ratio: '1:2:2' };
const link = { starter_id: 's1', device_id: 'd1', active_from: iso(80), active_to: null };
const rows = [
  { id: 'a', recorded_at: iso(69), mode: 'fer', sensor_error: false, height_mm: 20, temperature_c: 24, humidity_percent: 65 },
  { id: 'b', recorded_at: iso(20), mode: 'fer', sensor_error: false, height_mm: 30, temperature_c: 25, humidity_percent: 68 },
  { id: 'c', recorded_at: iso(10), mode: 'sleep', sensor_error: false, height_mm: 40, temperature_c: 30, humidity_percent: 70 },
  { id: 'd', recorded_at: iso(5), mode: 'fer', sensor_error: true, height_mm: 50, temperature_c: 31, humidity_percent: 72 }
];
const result = summarizeFeedingMeasurements({ measurements: rows, feeding, link, now });
assert.equal(result.baselineHeightMm, 25, 'baseline starts from the first valid height and averages the points seen so far');
assert.equal(result.baselineIncomplete, true, 'fewer than three valid points is marked incomplete');
assert.equal(result.measurementCount, 2, 'sleep and sensor-error samples are excluded');

const renderCode = template.code.replace(/import \{([^}]+)\} from "vue"/, (_, bindings) => `const { ${bindings.replace(/ as /g, ': ')} } = Vue;`).replace('export function render', 'function render');
const render = new Function('Vue', `${renderCode}; return render;`)(Vue);
// Execute the compiler's real script-setup output with reactive state and mocked API boundaries.
const setupCode = compiled.content.replace(/import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/g, (_, bindings, path) => {
  if (bindings.trim().startsWith('{')) return `const ${bindings.replace(/\bas\b/g, ':')} = modules[${JSON.stringify(path)}];`;
  return `const ${bindings.trim()} = modules[${JSON.stringify(path)}];`;
}).replace('export default', 'return');
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); await Vue.nextTick(); };
// 刷新的排队批次在上一批结束后才继续，单次 settle 不足以等到它落地。
const drain = async () => { for (let i = 0; i < 8; i++) await settle(); };
function harness() {
  const user = Vue.ref(null);
  const state = { devices: [{ device_id: 'd2', created_at: iso(2) }, { device_id: 'd1', created_at: iso(100) }], starters: [{ id: 's1', name: '一号' }, { id: 's2', name: '二号' }], selection: [], links: [link, { starter_id: 's2', device_id: 'd2', active_from: iso(80), active_to: null }], feeding, rows, closure: null, closed: null, fail: '', calls: [], starterGate: null, createGate: null, linkGate: null, linkFailure: false };
  const api = {
    async listStarters({ userId }) { state.calls.push(userId); if (state.starterGate) return state.starterGate.promise; if (state.fail === 'starter') throw new Error('starter down'); return state.starters.slice(); },
    async listCareRecords({ starterId, kind }) {
      if (kind === 'observation') return [];
      const rows = kind === 'feeding' ? (state.feedings || [state.feeding]) : [state.feeding];
      return rows.filter((row) => row && starterId === row.starter_id);
    },
    async createStarter(name) { if (state.createGate) return state.createGate.promise; if (state.fail === 'create') throw new Error('create down'); const created = { id: 'created', name }; state.starters.push(created); return created; }
  };
  const modules = {
    vue: { ...Vue, onMounted: () => {}, onActivated: () => {}, onDeactivated: () => {}, onScopeDispose: () => {} },
    'vue-router': { useRoute: () => ({ path: '/device', query: {} }) },
    '../../composables/useAuth.js': { useAuth: () => ({ user, init() {} }) },
    '../../lib/mobile-guest.js': { guestLoginTarget, guestRegisterTarget, isAuthPending, isGuest },
    // 游客引导组件只负责结构，测试里用最小桩渲染标题与登录入口。
    '../../components/mobile/MGuestNotice.vue': {
      props: ['title', 'description', 'action', 'loginTo', 'registerTo', 'register', 'hero', 'compact', 'eyebrow'],
      setup: (props) => () => Vue.h('section', { 'data-testid': 'guest-notice' }, [
        Vue.h('strong', props.title),
        Vue.h('p', props.description),
        Vue.h('a', { href: props.loginTo?.name || '/login' }, props.action || '去登录')
      ])
    },
    '../../composables/useVisiblePolling.js': { useVisiblePolling() {} },
    '../../services/care.service.js': api,
    '../../services/device.service.js': { listMeasurementsRange: async () => state.rows },
    '../../services/mobile-device.service.js': { mobileDeviceService: async () => ({ listDevices: async () => { if (state.fail === 'device') throw new Error('device down'); return state.devices.slice(); } }) },
    '../../services/starter-device.service.js': {
      listStarterDeviceLinks: async () => { if (state.fail === 'link') throw new Error('link down'); return state.links.slice(); },
      linkStarterDevice: async (args) => { if (state.linkGate) await state.linkGate.promise; if (state.linkFailure) throw new Error('link down'); state.links.push({ ...link, starter_id: args.starterId, device_id: args.deviceId }); }
    },
    '../../services/feeding-analysis.service.js': { summarizeFeedingMeasurements, loadFeedingEvidence: async () => ({ link: state.links.find(item => item.starter_id === state.feeding?.starter_id), measurements: state.rows }) },
    '../../services/fermentation-window.service.js': {
      loadWindowClosure: async () => state.closure,
      closeFeedingWindow: async (args) => {
        state.closed = args;
        const row = { id: 'closure', feeding_id: args.feedingId, ended_at: args.endedAt, reason: 'manual', detail: args.detail };
        state.closure = row;
        return row;
      }
    },
    '../../services/mobile-diagnosis.service.js': { loadSessionReport: () => null },
    '../../lib/mobile-selection.js': { rememberSelectedStarter: (owner, id) => state.selection.push([owner, id]) },
    '../../lib/mobile-records.js': { CLOSE_REASON_LABELS, roundState, feedingEvidenceCacheKey: () => 'evidence' },
    '../../lib/read-cache.js': { invalidateReadCache: () => {}, cachedRead: (key, loader) => loader(), READ_TTL: { records: 0 } }
  };
  // 图标与插画是构建期资源，测试里用空串占位，断言只关心结构与文案。
  for (const asset of ['icon-thermometer', 'icon-drop', 'icon-chart-up', 'icon-scales', 'icon-timer', 'icon-chevron-down', 'icon-jar', 'jar-body', 'jar-face.png', 'jar-hat.png', 'jar-rise', 'jar-face-small']) {
    modules[`../../assets/device/${asset}`] = `asset:${asset}`;
  }
  const component = new Function('modules', setupCode)(modules);
  const scope = Vue.effectScope();
  const bindings = scope.run(() => component.setup({}, { expose() {} }));
  async function html() {
    const app = Vue.createSSRApp({ setup: () => ({ ...bindings }), render });
    app.component('RouterLink', { props: ['to'], setup: ({ to }, { slots }) => () => Vue.h('a', { href: typeof to === 'string' ? to : to.path }, slots.default?.()) });
    app.component('MGuestNotice', { props: ['title', 'description', 'action', 'loginTo', 'registerTo', 'register', 'hero', 'compact', 'eyebrow'], setup: (props) => () => Vue.h('section', { 'data-testid': 'guest-notice' }, [Vue.h('strong', props.title), Vue.h('p', props.description), Vue.h('a', { href: '/login' }, props.action || '去登录')]) });
    app.component('MConfirmDialog', { props: ['open', 'title', 'message', 'confirmLabel', 'cancelLabel', 'danger'], setup(props) { return () => props.open ? Vue.h('section', [Vue.h('h2', props.title), Vue.h('p', props.message), Vue.h('button', props.cancelLabel), Vue.h('button', { class: props.danger ? 'is-danger' : '' }, props.confirmLabel)]) : null; } });
    return renderToString(app);
  }
  return { state, user, vm: Vue.proxyRefs(bindings), html, stop: () => scope.stop() };
}
async function login(h, id = 'a') { h.user.value = { id }; await settle(); }

const h = harness();
assert.match(await h.html(), /连接设备，开始记录/);
await login(h);
const home = await h.html();
assert.match(home, /我的设备/);
assert.match(home, /膨胀率/);
assert.match(home, /本次喂养/);
assert.match(home, /当前数据/);
assert.match(home, /1 : 2 : 2/, 'feed summary restates the ratio');
assert.match(home, /结束当前发酵/, 'an active round can be ended straight from the home page');
assert.match(home, /诊断本轮/);
assert.match(home, /jar-status/, 'jar state is rendered as a compact status line');
assert.match(home, /传感器异常/, 'the latest sensor-error sample is surfaced as an explicit jar state');
assert.match(home, /未计入膨胀率/, 'data note explains which samples are excluded');
assert.match(home, /段超过 40 分钟无采样/, 'data note states the size of measurement gaps');
assert.doesNotMatch(home, /高度预约/, 'height alert entry is no longer on the home page');
assert.doesNotMatch(home, /\/me\/notifications/, 'device home no longer carries notification settings links');
assert.doesNotMatch(home, /开启云端推送/, 'device home no longer embeds push setup');
assert.doesNotMatch(home, /2\.5×/, 'alert thresholds are managed on the settings page');
assert.doesNotMatch(home, /chart-feature|series-chart/, 'the device home keeps charts on the detail page');
assert.doesNotMatch(home, /<h1>今日<\/h1>/, 'the entry screen no longer labels itself 今日');

const feedingSource = await readFile(new URL('../src/views/mobile/MobileFeeding.vue', import.meta.url), 'utf8');
assert.match(feedingSource, /高度预约/, 'height alert entry is discoverable on the feeding page');
assert.match(feedingSource, /\/me\/notifications/, 'feeding page delegates alert thresholds to notification settings');
// 进入喂养页就是要记下一条：已确认的草稿自动变成空表单，不再提供重复入口。
assert.doesNotMatch(feedingSource, /startNext\(starterId \|\| draft\.value\.starterId, \{ quiet: true \}\)/, 'a confirmed feeding stays on screen until the user starts the next one');
assert.doesNotMatch(feedingSource, /class="m-primary" to="\/device"/, 'the feeding page relies on the header back button instead of a duplicate device button');
assert.doesNotMatch(feedingSource, /mode: 'diagnosis'/, 'diagnosis stays on the device page instead of duplicating it here');

h.vm.contextOpen = true;
const pickerHtml = await h.html();
assert.match(pickerHtml, /仅查看设备数据/, 'not choosing a starter is described by its actual effect');
assert.match(pickerHtml, /已关联其他设备/, 'starters linked to another device stay visible with an explanation');
h.vm.contextOpen = false;
assert.equal(h.vm.deviceId, 'd1', 'oldest valid device is the deterministic default');
assert.equal(h.vm.starterId, 's1', 'linked starter is selected by default');
assert.deepEqual(h.state.selection.at(-1), ['a', 's1'], 'the resolved starter is remembered so the diary page opens on the same jar');
assert.equal(h.vm.evidence.length, rows.length);
for (const fail of ['starter', 'device', 'link']) {
  const before = { devices: h.vm.devices, starters: h.vm.starters, selected: h.vm.starterId, evidence: h.vm.evidence };
  h.state.fail = fail; await h.vm.refresh();
  assert.equal(h.vm.devices, before.devices, `${fail} failure retains device list`);
  assert.equal(h.vm.starters, before.starters, `${fail} failure retains starter list`);
  assert.equal(h.vm.starterId, before.selected);
  assert.equal(h.vm.evidence, before.evidence);
}
h.state.fail = '';
h.vm.selectStarter(''); await settle(); await h.vm.refresh();
assert.equal(h.vm.starterId, '', 'explicit empty starter survives polling');
h.vm.selectDevice('d2'); await settle();
h.vm.selectDevice('d1'); await settle();
assert.equal(h.vm.starterId, '', 'explicit empty choice survives device switching');
h.vm.selectStarter('s1'); await settle(); await drain();
h.state.feeding = null; await h.vm.refresh(); await drain();
assert.deepEqual(h.vm.evidence, [], 'removing feeding clears stale evidence');
const noFeedingHtml = await h.html();
assert.match(noFeedingHtml, /还没有开始新一轮/, 'without a round the page offers the first feeding');
assert.doesNotMatch(noFeedingHtml, /结束当前发酵/, 'no round means there is nothing to end');
h.state.feeding = feeding; await h.vm.refresh(); await drain();
h.state.links = []; await h.vm.refresh(); await drain();
assert.deepEqual(h.vm.evidence, [], 'removing link clears stale evidence');
assert.deepEqual(h.vm.measurements, [], 'unlinked starter cannot retain raw sample data');
const unlinkedHtml = await h.html();
assert.match(unlinkedHtml, /未关联设备/, 'missing device data is described as data quality, not as a finished round');
assert.doesNotMatch(unlinkedHtml, /picker-row/, 'device and starter pickers stay collapsed until requested');
h.vm.contextOpen = true;
const expandedHtml = await h.html();
assert.match(expandedHtml, /picker-row/, 'opening the starter switch reveals the device and starter pickers');
assert.match(expandedHtml, /关联当前设备/, 'switching and associating stay reachable once expanded');
h.vm.contextOpen = false;
assert.equal(h.vm.summary.windowStatus, 'in_progress', 'a missing device never ends the round');
// 结束流程先是确认弹层，确认后才写入并给出保存提示。
h.vm.confirmOpen = true;
const confirmHtml = await h.html();
assert.match(confirmHtml, /结束当前发酵？/);
assert.match(confirmHtml, /结束后，本次发酵将停止记录。/);
assert.match(confirmHtml, /继续发酵/);
assert.equal(h.state.closed, null, 'the confirmation layer alone never closes the round');
await h.vm.endRound('fallen'); await settle();
assert.equal(h.state.closed.detail, 'fallen', 'manual end records the selected reason');
assert.equal(h.vm.summary.windowStatus, 'closed', 'manual end closes the round immediately');
const closedHtml = await h.html();
assert.match(closedHtml, /已结束/);
assert.match(closedHtml, /结束原因：峰值后回落/, 'closed round keeps the reason in a dedicated line');
assert.match(closedHtml, /历史记录已保存/, 'saving the history raises the toast');
assert.match(closedHtml, /本次发酵已结束/);
assert.match(closedHtml, /class="device-cta"/);
assert.doesNotMatch(closedHtml, /结束当前发酵/, 'closed round no longer offers manual end');
assert.match(closedHtml, />喂养</, 'a closed round offers the next feeding instead');
h.vm.newName = '新酵种'; h.vm.newStarterOpen = true;
await h.vm.addStarter(); await settle();
assert.equal(h.vm.starterId, 'created'); assert.equal(h.vm.link.device_id, 'd1');
assert.equal(h.vm.newName, ''); assert.equal(h.vm.newStarterOpen, false);
h.stop();

const failed = harness(); await login(failed);
failed.state.linkFailure = true; failed.vm.newName = '保留的新酵种';
await failed.vm.addStarter(); await settle();
assert.equal(failed.vm.starterId, 'created', 'link failure retains created starter');
assert.equal(failed.vm.link, null); assert.match(failed.vm.mutationError, /已新建.*关联失败/);
failed.state.linkFailure = false; await failed.vm.associateSelected(); await settle();
assert.equal(failed.vm.link.device_id, 'd1', 'association can be retried without duplicate creation');
assert.equal(failed.vm.mutationError, '');
failed.state.fail = 'create'; failed.vm.newName = '仍在编辑'; failed.vm.newStarterOpen = true;
await failed.vm.addStarter();
assert.equal(failed.vm.newName, '仍在编辑'); assert.equal(failed.vm.newStarterOpen, true);
assert.match(failed.vm.error, /create down/);
failed.stop();

const serial = harness(); await login(serial);
const gate = deferred(); serial.state.starterGate = gate;
const before = serial.state.calls.length;
const running = serial.vm.refresh(); serial.vm.refresh(); serial.vm.refresh();
assert.equal(serial.state.calls.length, before + 1, 'concurrent refresh requests share the running batch');
serial.state.starterGate = null; gate.resolve(serial.state.starters.slice());
await running; await settle();
assert.equal(serial.state.calls.length, before + 2, 'queued refreshes coalesce into one subsequent batch');
serial.stop();

const switched = harness(); const stale = deferred(); switched.state.starterGate = stale;
await login(switched, 'old');
switched.vm.newName = '旧账号名字'; switched.vm.newStarterOpen = true; switched.vm.deviceOpen = true; switched.vm.starterOpen = true; switched.vm.mutationError = '旧错误';
switched.user.value = { id: 'new' };
assert.equal(switched.vm.newName, ''); assert.equal(switched.vm.newStarterOpen, false);
assert.equal(switched.vm.deviceOpen, false); assert.equal(switched.vm.starterOpen, false); assert.equal(switched.vm.mutationError, '');
assert.deepEqual(switched.vm.starters, []);
switched.state.starters = [{ id: 'new-starter', name: '新账号' }]; switched.state.links = [];
switched.state.starterGate = null; stale.resolve([{ id: 'old-starter', name: '旧账号' }]); await settle();
assert.deepEqual(switched.vm.starters.map(item => item.id), ['new-starter'], 'stale account response is discarded and current account loads');
assert.deepEqual(switched.state.calls, ['old', 'new']); switched.stop();

const mutation = harness(); await login(mutation);
const createGate = deferred(); mutation.state.createGate = createGate; mutation.vm.newName = '旧账号创建';
const oldCreation = mutation.vm.addStarter();
mutation.user.value = { id: 'new' }; await settle();
mutation.state.createGate = null; mutation.vm.newName = '新账号未提交';
createGate.resolve({ id: 'old-created', name: '旧账号创建' }); await oldCreation; await settle();
assert.equal(mutation.vm.newName, '新账号未提交');
assert.ok(!mutation.vm.starters.some(item => item.id === 'old-created'), 'old mutation cannot populate a new account');
assert.equal(mutation.vm.saving, false); mutation.stop();

const store = new Map();
globalThis.localStorage = { getItem: (key) => (store.has(key) ? store.get(key) : null), setItem: (key, value) => store.set(key, String(value)), removeItem: (key) => store.delete(key) };
const remembered = harness(); await login(remembered, 'a');
remembered.vm.selectDevice('d2'); await settle();
assert.equal(store.get('ferjoo.mobile.today.device:a'), 'd2', 'an explicit device choice is remembered per account');
const restored = harness(); await login(restored, 'a');
assert.equal(restored.vm.deviceId, 'd2', 'reload restores the device the user last chose');
const otherAccount = harness(); await login(otherAccount, 'b');
assert.equal(otherAccount.vm.deviceId, 'd1', 'another account never inherits the remembered device');
remembered.stop(); restored.stop(); otherAccount.stop();
delete globalThis.localStorage;

console.log('mobile device home: layout contracts plus real script-setup state tests passed (account isolation, serialized refresh, create/link outcomes, default device, explicit empty selection, API failures, stale evidence, confirm/end flow and toast)');

// 膨胀率/发酵倍速统一一位小数：曾出现过 108.20189274447944% 这种原始浮点，
// 以及 .toFixed(0) 把 310.9% 显示成 311% 的不一致。
{
  const fs = await import('node:fs');
  const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
  const home = read('../src/views/mobile/MobileDeviceHome.vue');
  const detail = read('../src/views/mobile/MobileRecordDetail.vue');
  const diary = read('../src/views/mobile/MobileDiary.vue');
  const draggable = read('../src/components/mobile/MDraggableChart.vue');
  assert.match(home, /expansionPercent\.toFixed\(1\)/, 'device home shows expansion with one decimal');
  assert.match(detail, /Math\.max\(\.\.\.values\)\.toFixed\(1\)/, 'record detail peak keeps one decimal');
  assert.match(diary, /metricText\(peak, '%', 1\)/, 'diary peak keeps one decimal');
  assert.match(draggable, /toFixed\(1\)/, 'the chart tooltip rounds to one decimal');
  assert.doesNotMatch(draggable, /<strong>\{\{ point\.v \}\}/, 'the tooltip never prints the raw sample value');
}
console.log('expansion percent: one decimal everywhere');
