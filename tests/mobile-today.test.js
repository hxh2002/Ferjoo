import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import * as Vue from 'vue';
import { renderToString } from '@vue/server-renderer';
import { emptyCheckin, usableDeviceSample } from '../src/services/mobile-diagnosis.service.js';
import { diagnoseFromForm } from '../src/services/diagnosis.service.js';

const source = await readFile(new URL('../src/views/mobile/MobileToday.vue', import.meta.url), 'utf8');
const { descriptor, errors } = parse(source);
assert.deepEqual(errors, []);
const compiled = compileScript(descriptor, { id: 'today-test' });
assert.equal(compiled.bindings.refresh, 'setup-const');
assert.match(source, /defineOptions\(\{ name: 'MobileToday' \}\)/);
assert.ok(!source.includes('/algorithms/'));
const template = compileTemplate({ source: descriptor.template.content, filename: 'MobileToday.vue', id: 'today-test' });
assert.deepEqual(template.errors, []);
const renderCode = template.code.replace(/import \{([^}]+)\} from "vue"/, (_, bindings) => `const { ${bindings.replace(/ as /g, ': ')} } = Vue;`).replace('export function render', 'function render');
const render = new Function('Vue', `${renderCode}; return render;`)(Vue);
const names = ['starters', 'starterId', 'devices', 'records', 'sample', 'link', 'report', 'draft', 'now', 'loading', 'saving', 'error', 'deviceError', 'selectorOpen', 'linkOpen', 'selectedDevice', 'name', 'accountId', 'starter', 'feeding', 'observation', 'currentDevice', 'historical', 'expansion', 'baseline', 'lastAdvice', 'riskAdvice', 'hasDraft', 'mainAction', 'elapsedHours', 'timing', 'refresh', 'selectStarter', 'addStarter', 'openLink', 'saveLink', 'number', 'relative', 'dateTime', 'target'];
const code = descriptor.scriptSetup.content.replace(/^import .*;\n/gm, '').replace(/defineOptions\([^\n]+\);/, '');
const time = Date.now();
const iso = (minutes) => new Date(time - minutes * 60000).toISOString();
const feed = { id: 'feeding', starter_id: 's1', kind: 'feeding', occurred_at: iso(120), ratio: '1:2:2', input: { baseline_height_mm: 20 }, result: {} };
const observe = { id: 'observation', starter_id: 's1', kind: 'observation', occurred_at: iso(10), input: { color: 'normal', smell: 'normal', height: 'slight', stage: 'mature', tempC: 24 }, result: { title: '仍在观察窗口', status: 'normal' } };
const deviceLink = { device_id: 'd1', active_from: iso(180), active_to: null };
const measurement = { recorded_at: iso(1), mode: 'fer', sensor_error: false, temperature_c: 24, height_mm: 30, height_delta_mm: 10, humidity_percent: 68 };
let cloudStarters = [{ id: 's2', name: '较早创建' }, { id: 's1', name: '小橙' }];
let cloudRecords = [observe, feed];
let cloudLink = deviceLink;
let cloudSample = measurement;
let session = null;
let storedDraft = emptyCheckin();
let requestedOwners = [];
let recordGate = null;
let sampleGate = null;
let createGate = null;
let listCalls = 0;
let activeLists = 0;
let maxLists = 0;
let linkCalls = [];
let deviceFailure = false;
let poll;
const user = Vue.ref(null);
const scope = Vue.effectScope();
const deps = {
  ...Vue,
  onMounted: () => {},
  useAuth: () => ({ user, init() {} }),
  useVisiblePolling(callback) { poll = callback; },
  emptyCheckin, usableDeviceSample, diagnoseFromForm,
  readDraft: () => structuredClone(storedDraft),
  loadSessionReport: () => session,
  async listStarters({ userId }) {
    requestedOwners.push(userId); listCalls++; activeLists++; maxLists = Math.max(maxLists, activeLists);
    if (recordGate) await recordGate.promise;
    activeLists--;
    return structuredClone(cloudStarters);
  },
  async listCareRecords({ userId, starterId, kind }) {
    requestedOwners.push(userId);
    return structuredClone(cloudRecords.filter((row) => row.starter_id === starterId && (!kind || row.kind === kind)).sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at)).slice(0, 1));
  },
  mobileDeviceService: async () => ({ async listDevices(owner) { requestedOwners.push(owner); if (deviceFailure) throw new Error('offline'); return [{ device_id: 'd1', name: 'Ferjoo Sensor' }]; } }),
  getStarterDeviceLink: async ({ userId, starterId }) => { requestedOwners.push(userId); return starterId === 's1' ? cloudLink : null; },
  async getLatestMeasurement() { if (sampleGate) await sampleGate.promise; return cloudSample; },
  async createStarter(value) { if (createGate) await createGate.promise; const item = { id: 's3', name: value }; cloudStarters.push(item); return item; },
  async linkStarterDevice(value) { linkCalls.push(value); cloudLink = value.deviceId ? { ...deviceLink, device_id: value.deviceId } : null; }
};
const factory = new Function(...Object.keys(deps), `${code}; return { ${names.join(',')} };`);
const state = scope.run(() => factory(...Object.values(deps)));
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function settled() { for (let i = 0; i < 12; i++) await tick(); }
const gate = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
async function html() {
  const app = Vue.createSSRApp({ setup: () => state, render });
  app.component('RouterLink', { props: ['to'], setup: (_, { slots }) => () => Vue.h('a', slots.default?.()) });
  return renderToString(app);
}

assert.match(await html(), /登录后开始记录/);
user.value = { id: 'account-a' };
await settled();
assert.deepEqual(state.starters.value.map((item) => item.id), ['s1', 's2'], 'order by activity, not starter creation');
assert.equal(state.starterId.value, 's1');
assert.equal(state.expansion.value, 50);
assert.ok(state.timing.value?.display, 'confirmed mature round estimates through diagnosis service');
assert.equal(state.mainAction.value.label, '记录观察并获取建议');
assert.ok(requestedOwners.every((owner) => owner === 'account-a'));
assert.match(await html(), /膨胀率/);
assert.match(await html(), /50%/);
state.selectorOpen.value = true;
assert.match(await html(), /按最近喂养或观察时间排序/);
assert.match(await html(), /最近观察.*已关联设备/);
state.selectorOpen.value = false;

state.records.value = [{ ...feed, input: {} }, observe];
assert.equal(state.expansion.value, null);
assert.match(await html(), /Δ \+10 mm/);
state.records.value = [feed, observe];
for (const changed of [{ sensor_error: true }, { mode: 'sleep' }, { temperature_c: 33 }, { temperature_c: 7 }, { recorded_at: iso(41) }, { mode: null }]) {
  state.sample.value = { ...measurement, ...changed };
  assert.equal(state.timing.value, null, JSON.stringify(changed));
}
state.sample.value = { ...measurement, sensor_error: true };
assert.equal(state.expansion.value, null);
assert.match(await html(), /传感器故障，读数不可靠/);
state.sample.value = { ...measurement, recorded_at: iso(41) };
assert.equal(state.historical.value, true);
assert.match(await html(), /历史读数/);
state.sample.value = { ...measurement, temperature_c: 33 };
assert.match(await html(), /高温警告/);
state.sample.value = { ...measurement, mode: 'sleep' };
assert.match(await html(), /设备休眠/);
state.sample.value = measurement;
state.records.value = [feed, { ...observe, input: { ...observe.input, height: 'double' } }];
assert.equal(state.timing.value, null);
state.records.value = [feed, { ...observe, input: { ...observe.input, stage: 'young' } }];
assert.equal(state.timing.value, null);
state.records.value = [feed, { ...observe, occurred_at: iso(200) }];
assert.equal(state.timing.value, null, 'old round observations are not reused');
state.records.value = [feed, observe];
state.sample.value = { ...measurement, height_mm: 40 };
assert.equal(state.timing.value, null, 'measured doubling hides estimates');
state.sample.value = measurement;
state.link.value = { ...deviceLink, active_from: iso(60) };
state.records.value = [{ ...feed, input: { baseline_height_mm: 20, baseline_source: 'device' } }, observe];
assert.equal(state.expansion.value, null, 'device baseline from an earlier association is not reused');
state.link.value = deviceLink;
state.records.value = [feed, observe];

storedDraft = { ...emptyCheckin(), starterId: 's1', color: 'normal' };
await state.refresh();
assert.equal(state.mainAction.value.label, '继续本次观察');
state.selectStarter('s2');
assert.equal(state.sample.value, null, 'switch clears sample synchronously');
await settled();
assert.equal(state.hasDraft.value, false, 'other starter draft does not override action');
assert.equal(state.mainAction.value.label, '记录这次喂养');
assert.match(await html(), /手工养护模式/);
state.selectStarter('s1');
await settled();

cloudSample = { ...measurement, recorded_at: iso(181) };
await state.refresh();
assert.equal(state.sample.value, null, 'sample before active_from is hidden');
assert.match(state.deviceError.value, /不在当前关联时间段/);
cloudSample = { ...measurement, recorded_at: iso(5) };
cloudLink = { ...deviceLink, active_to: iso(10) };
await state.refresh();
assert.equal(state.sample.value, null, 'exclusive end boundary enforced');
cloudLink = deviceLink;
cloudSample = null;
await state.refresh();
assert.match(await html(), /已绑定设备，等待首次数据/);
cloudSample = measurement;

cloudLink = null;
await state.refresh();
assert.ok(state.timing.value, 'manual temperature supports full care without devices');
assert.match(await html(), /无需设备也可以完整使用/);
state.records.value = [feed, { ...observe, input: { ...observe.input, sources: { tempC: '设备读取' } } }];
assert.equal(state.timing.value, null, 'detached device temperature is not relabelled manual');
await state.refresh();
state.openLink();
state.selectedDevice.value = 'd1';
await state.saveLink();
await settled();
assert.deepEqual(linkCalls.at(-1), { userId: 'account-a', starterId: 's1', deviceId: 'd1' });
assert.equal(state.link.value.device_id, 'd1');
state.openLink(); state.selectedDevice.value = '';
await state.saveLink(); await settled();
assert.equal(linkCalls.at(-1).deviceId, null);
assert.equal(state.link.value, null);

session = { accountId: 'account-a', starterId: 's1', occurredAt: iso(0), input: {}, result: { status: 'discard', title: '不要使用' } };
await state.refresh();
assert.equal(state.riskAdvice.value, true);
assert.equal(state.timing.value, null);
assert.match(await html(), /查看风险建议/);
assert.match(await html(), /<details[^>]*>/);
assert.doesNotMatch(await html(), /<details[^>]*open/);
session = { ...session, accountId: 'someone-else' };
await state.refresh();
assert.equal(state.report.value, null);
session = null;

deviceFailure = true;
await state.refresh();
assert.equal(state.feeding.value.id, 'feeding', 'device failure does not block manual records');
assert.match(state.deviceError.value, /设备列表读取失败/);
deviceFailure = false;
recordGate = gate();
const running = state.refresh();
void state.refresh(); void poll();
assert.equal(activeLists, 1);
const before = listCalls;
recordGate.resolve(); recordGate = null;
await running; await settled();
assert.equal(maxLists, 1, 'refreshes are serialized');
assert.equal(listCalls, before + 1, 'concurrent refreshes coalesce into one trailing refresh');

cloudLink = deviceLink;
sampleGate = gate();
const oldRequest = state.refresh();
await tick();
user.value = { id: 'account-b' };
assert.equal(state.sample.value, null);
assert.equal(state.report.value, null);
assert.deepEqual(state.starters.value, []);
cloudStarters = [];
cloudRecords = [];
sampleGate.resolve(); sampleGate = null;
await oldRequest; await settled();
assert.equal(state.sample.value, null, 'late old-account sample cannot reappear');
assert.deepEqual(state.starters.value, []);
assert.match(await html(), /添加你的第一份酵种/);
state.name.value = ' 第一份 ';
await state.addStarter(); await settled();
assert.equal(state.starter.value.name, '第一份');
assert.equal(state.starterId.value, 's3');

createGate = gate();
state.name.value = '不应跨账号出现';
const adding = state.addStarter();
user.value = null;
assert.equal(state.name.value, '');
createGate.resolve(); createGate = null;
await adding; await settled();
assert.deepEqual(state.starters.value, []);
assert.equal(state.starterId.value, '');
scope.stop();
console.log('mobile today: component rendering, activity sort, round timing, device states, association periods, drafts, linking, serialized refresh and account isolation OK');
