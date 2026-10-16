import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import * as Vue from 'vue';
import { renderToString } from '@vue/server-renderer';
import { summarizeFeedingMeasurements } from '../src/services/feeding-analysis.service.js';

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
  const state = { devices: [{ device_id: 'd2', created_at: iso(2) }, { device_id: 'd1', created_at: iso(100) }], starters: [{ id: 's1', name: '一号' }], links: [link], feeding, rows, fail: '', calls: [], starterGate: null, createGate: null, linkGate: null, linkFailure: false };
  const api = {
    async listStarters({ userId }) { state.calls.push(userId); if (state.starterGate) return state.starterGate.promise; if (state.fail === 'starter') throw new Error('starter down'); return state.starters.slice(); },
    async listCareRecords({ starterId, kind }) { return state.feeding && starterId === state.feeding.starter_id && kind !== 'observation' ? [state.feeding] : []; },
    async createStarter(name) { if (state.createGate) return state.createGate.promise; if (state.fail === 'create') throw new Error('create down'); const created = { id: 'created', name }; state.starters.push(created); return created; }
  };
  const modules = {
    vue: { ...Vue, onMounted: () => {} },
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
    '../../services/mobile-diagnosis.service.js': { loadSessionReport: () => null },
    '../../components/MobileMetricChart.vue': {}, '../../components/SeriesChart.vue': {}
  };
  const component = new Function('modules', setupCode)(modules);
  const scope = Vue.effectScope();
  const bindings = scope.run(() => component.setup({}, { expose() {} }));
  async function html() {
    const app = Vue.createSSRApp({ setup: () => ({ ...bindings }), render });
    app.component('RouterLink', { props: ['to'], setup: ({ to }, { slots }) => () => Vue.h('a', { href: typeof to === 'string' ? to : to.path }, slots.default?.()) });
    app.component('MobileMetricChart', { render: () => Vue.h('div') });
    app.component('SeriesChart', { render: () => Vue.h('div') });
    return renderToString(app);
  }
  return { state, user, vm: Vue.proxyRefs(bindings), html, stop: () => scope.stop() };
}
async function login(h, id = 'a') { h.user.value = { id }; await settle(); }

const h = harness();
assert.match(await h.html(), /连接设备，开始记录/);
await login(h);
assert.match(await h.html(), /膨胀率/);
assert.match(await h.html(), /距上次喂养/);
assert.equal(h.vm.deviceId, 'd1', 'oldest valid device is the deterministic default');
assert.equal(h.vm.starterId, 's1', 'linked starter is selected by default');
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

assert.ok(source.indexOf('class="starter-section"') < source.indexOf('class="chart-card"'));
assert.match(source, /:open="starterOpen" @toggle="starterOpen = \$event.target.open"/);
assert.match(source, /summary::after/); assert.match(source, /:deep\(svg\).*height:76px/);
assert.match(source, /膨胀率/); assert.match(source, /距上次喂养/); assert.match(source, /\/reports\/session/);
console.log('mobile today: real script-setup state tests passed (account isolation, serialized refresh, create/link outcomes, default device, explicit empty selection, API failures and stale evidence)');
