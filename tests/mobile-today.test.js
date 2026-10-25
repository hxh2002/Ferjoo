import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import * as Vue from 'vue';
import { renderToString } from '@vue/server-renderer';
import { summarizeFeedingMeasurements } from '../src/services/feeding-analysis.service.js';
import { CLOSE_REASON_LABELS } from '../src/lib/mobile-records.js';

const file = new URL('../src/views/mobile/MobileToday.vue', import.meta.url);
const source = await readFile(file, 'utf8');
const { descriptor, errors } = parse(source);
assert.deepEqual(errors, []);
const compiled = compileScript(descriptor, { id: 'today-test' });
assert.equal(compiled.bindings.refresh, 'setup-const');
assert.match(source, /defineOptions\(\{ name: 'MobileToday' \}\)/);
assert.match(source, /chart-feature/);
assert.match(source, /SeriesChart/);
assert.match(source, /listMeasurementsRange/);
assert.match(source, /summarizeFeedingMeasurements/);
assert.match(source, /fermentation-window\.service\.js/);
assert.match(source, /结束本轮/);
assert.doesNotMatch(source, /readDraft|hasDraft|继续本次观察|记录观察/);
assert.match(source, /\/me\/devices\?bind=1/);
assert.match(source, /mode: 'diagnosis'/);
assert.match(source, /linkStarterDevice/);
const template = compileTemplate({ source: descriptor.template.content, filename: 'MobileToday.vue', id: 'today-test' });
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
assert.equal(result.baselineHeightMm, null, 'less than three baseline samples does not invent a baseline');
assert.equal(result.measurementCount, 2, 'sleep and sensor-error samples are excluded');
assert.equal(result.measurements, undefined, 'analysis result does not expose unrelated device rows');
const isolated = summarizeFeedingMeasurements({ measurements: rows.map((row) => ({ ...row, device_id: 'other' })), feeding, link, now });
assert.equal(isolated.measurementCount, 0, 'measurements from another device never enter the feeding round');

const renderCode = template.code.replace(/import \{([^}]+)\} from "vue"/, (_, bindings) => `const { ${bindings.replace(/ as /g, ': ')} } = Vue;`).replace('export function render', 'function render');
const render = new Function('Vue', `${renderCode}; return render;`)(Vue);
// Execute the compiler's real script-setup output with reactive state and mocked API boundaries.
const setupCode = compiled.content.replace(/import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/g, (_, bindings, path) => {
  if (bindings.trim().startsWith('{')) return `const ${bindings.replace(/\bas\b/g, ':')} = modules[${JSON.stringify(path)}];`;
  return `const ${bindings.trim()} = modules[${JSON.stringify(path)}];`;
}).replace('export default', 'return');
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); await Vue.nextTick(); };
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
    vue: { ...Vue, onMounted: () => {}, onActivated: () => {}, onDeactivated: () => {} },
    '../../composables/useAuth.js': { useAuth: () => ({ user, init() {} }) },
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
    '../../lib/mobile-records.js': { CLOSE_REASON_LABELS, feedingEvidenceCacheKey: () => 'evidence' },
    '../../lib/read-cache.js': { invalidateReadCache: () => {}, cachedRead: (key, loader) => loader(), READ_TTL: { records: 0 } },
    '../../components/MobileMetricChart.vue': {}, '../../components/SeriesChart.vue': {}
  };
  const component = new Function('modules', setupCode)(modules);
  const scope = Vue.effectScope();
  const bindings = scope.run(() => component.setup({}, { expose() {} }));
  async function html() {
    const app = Vue.createSSRApp({ setup: () => ({ ...bindings }), render });
    app.component('RouterLink', { props: ['to'], setup: ({ to }, { slots }) => () => Vue.h('a', { href: typeof to === 'string' ? to : to.path }, slots.default?.()) });
    app.component('MobileMetricChart', { render: () => Vue.h('div') });
    app.component('SeriesChart', { setup: (_, { slots }) => () => Vue.h('div', { class: 'series-chart' }, slots['after-header']?.()) });
    return renderToString(app);
  }
  return { state, user, vm: Vue.proxyRefs(bindings), html, stop: () => scope.stop() };
}
async function login(h, id = 'a') { h.user.value = { id }; await settle(); }

const h = harness();
assert.match(await h.html(), /连接设备，开始记录/);
await login(h);
assert.match(await h.html(), /膨胀率/);
assert.match(await h.html(), /已持续/);
assert.doesNotMatch(await h.html(), /高度预约/, 'height alert entry is no longer on the home page');
assert.doesNotMatch(await h.html(), /\/me\/notifications/, 'today no longer carries notification settings links');
const feedingSource = await readFile(new URL('../src/views/mobile/MobileFeeding.vue', import.meta.url), 'utf8');
assert.match(feedingSource, /高度预约/, 'height alert entry is discoverable on the feeding page');
assert.match(feedingSource, /\/me\/notifications/, 'feeding page delegates alert thresholds to notification settings');
// 进入喂养页就是要记下一条：已确认的草稿自动变成空表单，不再提供重复入口。
assert.match(feedingSource, /startNext\(starterId \|\| draft\.value\.starterId, \{ quiet: true \}\)/, 'entering the page starts the next feeding form when the draft is confirmed');
assert.doesNotMatch(feedingSource, /class="m-primary" to="\/today"/, 'the feeding page relies on the header back button instead of a duplicate Today button');
assert.doesNotMatch(feedingSource, /mode: 'diagnosis'/, 'diagnosis stays on the Today page instead of duplicating it here');
assert.match(await h.html(), /jar-status/, 'jar state is rendered as a compact status line');
assert.match(await h.html(), /传感器异常/, 'sensor error is surfaced as an explicit jar state');
assert.equal(h.vm.baselineNote, '自动', 'baseline source is appended to the in-chart baseline tag');
assert.match(source, /:baseline-note="baselineNote"/, 'the chart tag owns the baseline value and source');
assert.doesNotMatch(source, /height-meta/, 'the duplicated baseline line above the chart is gone');
assert.doesNotMatch(await h.html(), /当前高度/, 'the round card no longer repeats the height already shown on the chart');
assert.match(await h.html(), /class="action-card"/, 'main actions are grouped into a dedicated action card');
assert.doesNotMatch(await h.html(), /查看设备曲线/, 'the chart jump link is removed');
assert.match(await h.html(), /未计入膨胀率/, 'chart explains which samples are excluded from the expansion');
assert.match(await h.html(), /段超过 40 分钟无采样/, 'chart states the size of measurement gaps');
assert.doesNotMatch(await h.html(), /开启云端推送/, 'today no longer embeds push setup');
assert.doesNotMatch(await h.html(), /2\.5×/, 'alert thresholds are managed on the settings page');
assert.match(await h.html(), /本轮发酵/, 'current feeding is shown as an explicit round');
assert.match(await h.html(), /compact-range/, 'round card uses a compact time range');
assert.match(await h.html(), /range-separator/, 'round card renders the time range separator');
assert.match(await h.html(), /结束本轮/, 'user can end the round without waiting for the next feeding');
assert.match(await h.html(), /进行中/);
assert.match(await h.html(), /下一次喂养会自动结束本轮/, 'the round card explains what closes the window');
assert.match(await h.html(), /诊断需 3 步/, 'the action note separates ending from diagnosing');
h.vm.contextOpen = true;
const pickerHtml = await h.html();
assert.match(pickerHtml, /仅查看设备数据/, 'not choosing a starter is described by its actual effect');
assert.match(pickerHtml, /已关联其他设备/, 'starters linked to another device stay visible with an explanation');
h.vm.contextOpen = false;
assert.equal(h.vm.deviceId, 'd1', 'oldest valid device is the deterministic default');
assert.equal(h.vm.starterId, 's1', 'linked starter is selected by default');
assert.deepEqual(h.state.selection.at(-1), ['a', 's1'], 'the resolved starter is remembered so the records page opens on the same jar');
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
h.vm.selectStarter('s1'); await settle();
h.state.feeding = null; await h.vm.refresh();
assert.deepEqual(h.vm.evidence, [], 'removing feeding clears stale evidence');
h.state.feeding = feeding; await h.vm.refresh();
h.state.links = []; await h.vm.refresh();
assert.deepEqual(h.vm.evidence, [], 'removing link clears stale evidence');
assert.deepEqual(h.vm.measurements, [], 'unlinked starter cannot retain raw chart data');
const unlinkedHtml = await h.html();
assert.match(unlinkedHtml, /本轮发酵/, 'round card still renders without a device link');
assert.match(unlinkedHtml, /未关联设备/, 'missing device data is described as data quality, not as a finished round');
assert.doesNotMatch(unlinkedHtml, /picker-row/, 'device and starter pickers stay collapsed into the status bar');
h.vm.contextOpen = true;
const expandedHtml = await h.html();
assert.match(expandedHtml, /picker-row/, 'opening the status bar reveals the device and starter pickers');
assert.match(expandedHtml, /关联当前设备/, 'switching and associating stay reachable once expanded');
h.vm.contextOpen = false;
assert.equal(h.vm.summary.windowStatus, 'in_progress', 'a missing device never ends the round');
await h.vm.endRound('fallen'); await settle();
assert.equal(h.state.closed.detail, 'fallen', 'manual end records the selected reason');
assert.equal(h.vm.summary.windowStatus, 'closed', 'manual end closes the round immediately');
const closedHtml = await h.html();
assert.match(closedHtml, /已结束/);
assert.match(closedHtml, /峰值后回落/, 'closed round states the manual end reason');
assert.match(closedHtml, /结束原因：峰值后回落/, 'closed round keeps the reason in a dedicated line');
assert.match(closedHtml, /compact-range/, 'closed round still shows its compact time range');
assert.match(closedHtml, /title="[^"]+–[^"]+"/, 'closed round keeps the full range in the title');
assert.match(closedHtml, /诊断本轮/);
assert.doesNotMatch(closedHtml, /结束本轮/, 'closed round no longer offers manual end');
assert.ok(h.vm.heightMarkers.some((marker) => marker.label === '本轮终点'), 'a closed round marks its end on the chart');
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

const marked = harness(); await login(marked);
marked.state.feedings = [feeding, { ...feeding, id: 'prev-feeding', occurred_at: iso(200) }];
await marked.vm.refresh(); await settle();
const markers = marked.vm.heightMarkers;
assert.deepEqual(markers.map((marker) => marker.label), ['上轮起点', '上轮终点', '本轮起点'], 'the chart marks previous and current feeding boundaries');
assert.equal(Date.parse(markers[1].t), Date.parse(markers[2].t) - 5 * 60000, 'the previous end line keeps five minutes away from the current start line');
assert.equal(markers[2].row, 'top');
assert.ok(Date.parse(marked.vm.chartFrom) <= Date.parse(markers[2].t), 'the chart window starts before the feeding line so it stays visible');
marked.stop();

assert.ok(source.indexOf('class="starter-section"') < source.indexOf('class="chart-card"'));
assert.match(source, /:open="starterOpen" @toggle="starterOpen = \$event.target.open"/);
assert.match(source, /summary::after/); assert.match(source, /:deep\(svg\).*height:76px/);
assert.match(source, /膨胀率/); assert.match(source, /已持续/); assert.match(source, /\/reports\/session/);
assert.match(source, /label="温度"[^>]*:from="chartFrom" :to="chartTo"/, 'temperature follows the height window');
assert.match(source, /label="湿度"[^>]*:from="chartFrom" :to="chartTo"/, 'humidity follows the height window');
console.log('mobile today: real script-setup state tests passed (account isolation, serialized refresh, create/link outcomes, default device, explicit empty selection, API failures and stale evidence)');
