import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import * as Vue from 'vue';
import { renderToString } from '@vue/server-renderer';
import { summarizeFeedingMeasurements } from '../src/services/feeding-analysis.service.js';
import { CLOSE_REASON_LABELS, roundState } from '../src/lib/mobile-records.js';
import { guestLoginTarget, guestRegisterTarget, isAuthPending, isGuest } from '../src/lib/mobile-guest.js';
import * as starterJar from '../src/components/mobile/MStarterJar.js';
import * as linkWindows from '../src/lib/starter-link-windows.js';
import * as linkChange from '../src/lib/link-change.js';
import * as roundAttribution from '../src/lib/round-device-attribution.js';

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
assert.match(source, /:level="jarLevel"/);
assert.match(source, /fermentation-window\.service\.js/);
assert.match(source, /结束当前发酵/);
assert.match(source, /确认结束/);
assert.match(source, /历史记录已保存/);
assert.match(source, /酵种管理/);
assert.match(source, /to="\/me\/devices"/);
assert.doesNotMatch(source, /createStarter|archiveStarter|新增酵种|starter-archive/, 'home only selects starters; all management lives in settings');
assert.doesNotMatch(source, /诊断本轮|诊断需 3 步/, 'diagnosis stays in diary flows rather than the home CTA');
assert.match(source, /listStarterDeviceLinks/);
assert.doesNotMatch(source, /linkStarterDevice/, 'home never mutates device associations');
assert.doesNotMatch(source, /SeriesChart/, 'charts move to the detail page, not the device home');
// 酵种弹层只有 280px：长名称在按钮内收缩换行；新增、归档均只在设置页提供。
assert.match(source, /\.starter-choice\{[^}]*min-width:0/, '.starter-choice must shrink inside the grid popover');
assert.match(source, /\.starter-choice > button:first-child\{[^}]*min-width:0/, 'starter name button must shrink inside the flex row');
assert.doesNotMatch(source, /readDraft|hasDraft|继续本次观察|记录观察/);
const template = compileTemplate({ source: descriptor.template.content, filename: 'MobileDeviceHome.vue', id: 'device-home-test', compilerOptions: { bindingMetadata: compiled.bindings } });
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
  const state = { devices: [{ device_id: 'd2', created_at: iso(2) }, { device_id: 'd1', created_at: iso(100) }], starters: [{ id: 's1', name: '一号' }, { id: 's2', name: '二号' }], selection: [], links: [link, { starter_id: 's2', device_id: 'd2', active_from: iso(80), active_to: null }], feeding, rows, closure: null, closed: null, fail: '', calls: [], starterGate: null };
  const api = {
    async listStarters({ userId }) { state.calls.push(userId); if (state.starterGate) return state.starterGate.promise; if (state.fail === 'starter') throw new Error('starter down'); return state.starters.slice(); },
    async listCareRecords({ starterId, kind }) {
      if (kind === 'observation') return [];
      const rows = kind === 'feeding' ? (state.feedings || [state.feeding]) : [state.feeding];
      return rows.filter((row) => row && starterId === row.starter_id);
    }
  };
  const modules = {
    vue: { ...Vue, onMounted: () => {}, onActivated: () => {}, onDeactivated: () => {}, onScopeDispose: () => {} },
    'vue-router': { useRoute: () => ({ path: '/device', query: {} }) },
    '../../composables/useAuth.js': { useAuth: () => ({ user, init() {} }) },
    '../../lib/mobile-guest.js': { guestLoginTarget, guestRegisterTarget, isAuthPending, isGuest },
    // 游客引导组件只负责结构，测试里用最小桩渲染标题与登录入口。
    '../../components/mobile/MStarterJar.js': starterJar,
    '../../components/mobile/MStarterJar.vue': {
      inheritAttrs: false,
      props: ['mood', 'level', 'animate'],
      setup: (props) => () => Vue.h('span', { class: 'starter-jar', 'data-mood': props.mood, 'data-level': props.level }, props.mood)
    },
    '../../components/mobile/MGuestNotice.vue': {
      props: ['title', 'description', 'action', 'loginTo', 'registerTo', 'register', 'hero', 'compact', 'eyebrow'],
      setup: (props) => () => Vue.h('section', { 'data-testid': 'guest-notice' }, [
        Vue.h('strong', props.title),
        Vue.h('p', props.description),
        Vue.h('a', { href: props.loginTo?.name || '/login' }, props.action || '去登录')
      ])
    },
    '../../components/mobile/MConfirmDialog.vue': {
      props: ['open', 'title', 'message', 'confirmLabel', 'cancelLabel', 'danger'],
      setup(props) { return () => props.open ? Vue.h('section', [Vue.h('h2', props.title), Vue.h('p', props.message), Vue.h('button', props.cancelLabel), Vue.h('button', props.confirmLabel)]) : null; }
    },
    '../../components/mobile/MToast.vue': {
      props: ['open', 'message', 'subtitle', 'tone'],
      setup(props) { return () => props.open ? Vue.h('div', { class: 'm-toast', role: 'status' }, [Vue.h('strong', props.message), props.subtitle ? Vue.h('small', props.subtitle) : null]) : null; }
    },
    '../../composables/useVisiblePolling.js': { useVisiblePolling() {} },
    '../../services/care.service.js': api,
    '../../services/device.service.js': { listMeasurementsRange: async () => state.rows },
    '../../services/mobile-device.service.js': { mobileDeviceService: async () => ({ listDevices: async () => { if (state.fail === 'device') throw new Error('device down'); return state.devices.slice(); } }) },
    '../../services/starter-device.service.js': {
      listStarterDeviceLinks: async () => { if (state.fail === 'link') throw new Error('link down'); return state.links.slice(); }
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
    '../../lib/starter-link-windows.js': linkWindows,
    '../../lib/link-change.js': linkChange,
    '../../lib/round-device-attribution.js': roundAttribution,
    '../../lib/mobile-selection.js': { rememberSelectedStarter: (owner, id) => state.selection.push([owner, id]) },
    '../../lib/mobile-records.js': { CLOSE_REASON_LABELS, roundState, feedingEvidenceCacheKey: () => 'evidence' },
    '../../lib/read-cache.js': { invalidateReadCache: () => {}, cachedRead: (key, loader) => loader(), READ_TTL: { records: 0 } }
  };
  // 图标与插画是构建期资源，测试里用空串占位，断言只关心结构与文案。
  for (const asset of ['icon-thermometer', 'icon-drop', 'icon-chart-up', 'icon-scales', 'icon-timer', 'icon-chevron-down', 'icon-jar']) {
    modules[`../../assets/device/${asset}`] = `asset:${asset}`;
  }
  const component = new Function('modules', setupCode)(modules);
  const scope = Vue.effectScope();
  const bindings = scope.run(() => component.setup({}, { expose() {} }));
  async function html() {
    const app = Vue.createSSRApp({ setup: () => ({ ...bindings }), render });
    app.component('RouterLink', { props: ['to'], setup: ({ to }, { slots }) => () => Vue.h('a', { href: typeof to === 'string' ? to : to.path }, slots.default?.()) });
    app.component('MStarterJar', modules['../../components/mobile/MStarterJar.vue']);
    app.component('MGuestNotice', { props: ['title', 'description', 'action', 'loginTo', 'registerTo', 'register', 'hero', 'compact', 'eyebrow'], setup: (props) => () => Vue.h('section', { 'data-testid': 'guest-notice' }, [Vue.h('strong', props.title), Vue.h('p', props.description), Vue.h('a', { href: '/login' }, props.action || '去登录')]) });
    app.component('MToast', modules['../../components/mobile/MToast.vue']);
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
assert.doesNotMatch(home, /诊断本轮|诊断需 3 步/);
// 心情与液面都来自本轮实测：起点 25mm、最新有效读数 30mm（+20%），一轮进行中 = 吃饭。
assert.match(home, /酵种状态：吃饭 · 正在上涨/, 'the jar describes the live round, not a preview');
assert.match(home, /data-mood="eating" data-level="0\.266/, 'the liquid follows the latest valid height');
assert.doesNotMatch(home, /心情预览|轻点切换/, 'the tap-to-preview mood is gone');
assert.match(source, /:level="jarLevel" :peak-level="jarPeakLevel"/);
assert.match(source, /jarMoodFor\(\{ active: !!summary\.value\?\.windowActive, phase: summary\.value\?\.risePhase \}\)/, 'mood follows the measured rise phase');
assert.match(source, /risePhase === 'fallen' \? levelFor\(summary\.value\.peakHeightMm/, 'the peak trace only appears after a real fall');
assert.match(home, /jar-status/, 'jar state is rendered as a compact status line');
assert.match(home, /传感器异常/, 'the latest sensor-error sample is surfaced as an explicit jar state');
assert.doesNotMatch(home, /未计入膨胀率|段超过 40 分钟无采样/, 'technical sample-quality details stay off the home page');
assert.doesNotMatch(home, /高度预约/, 'height alert entry is no longer on the home page');
assert.doesNotMatch(home, /\/me\/notifications/, 'device home no longer carries notification settings links');
assert.doesNotMatch(home, /开启云端推送/, 'device home no longer embeds push setup');
assert.doesNotMatch(home, /2\.5×/, 'alert thresholds are managed on the settings page');
assert.doesNotMatch(home, /chart-feature|series-chart/, 'the device home keeps charts on the detail page');
assert.doesNotMatch(home, /<h1>今日<\/h1>/, 'the entry screen no longer labels itself 今日');

const feedingSource = await readFile(new URL('../src/views/mobile/MobileFeeding.vue', import.meta.url), 'utf8');
assert.match(feedingSource, /高度预约/, 'height alert entry is discoverable on the feeding page');
assert.match(feedingSource, /\/me\/notifications/, 'feeding page delegates alert thresholds to notification settings');
// 保存确认后自动回设备首页；再次进入本页清空已确认内容，待确认草稿仍锁定。
assert.match(feedingSource, /onMounted\(\(\) => resetConfirmedOnEntry\(\)\)/);
assert.match(feedingSource, /onBeforeRouteUpdate\(\(to\) => \{ resetConfirmedOnEntry\(to\.query\.starter\); \}\)/);
assert.match(feedingSource, /if \(draft\.value\.confirmed\) startNext\(starterId \|\| draft\.value\.starterId, \{ quiet: true \}\)/);
assert.match(feedingSource, /await returnHome\(\)/, 'a confirmed save navigates back to the device home');
assert.match(feedingSource, /router\.replace\('\/device'\)/, 'the feeding form is replaced, so back never returns to a finished form');
assert.doesNotMatch(feedingSource, /watch\([^)]*startNext/, 'reactive draft changes must not auto-start another feeding');
assert.doesNotMatch(feedingSource, /class="m-primary" to="\/device"/, 'the feeding page relies on the header back button instead of a duplicate device button');
assert.doesNotMatch(feedingSource, /mode: 'diagnosis'/, 'diagnosis stays on the device page instead of duplicating it here');

h.vm.contextOpen = true;
const pickerHtml = await h.html();
assert.doesNotMatch(pickerHtml, /酵种罐|仅查看设备数据|新增\/连接酵种罐|新增酵种|>归档</, 'the home sheet contains only starter choices');
assert.match(pickerHtml, /已关联其他设备|已关联 d2/, 'a starter on another device stays selectable');
assert.match(pickerHtml, /酵种管理/);
assert.match(pickerHtml, /href="\/me\/devices"/);
h.vm.contextOpen = false;
{
  // 同一轮继续采样：上涨 → 停涨在高位 → 回落，罐子依次变成吃饭 / Peak / 饿了，并在回落后留下峰值痕迹。
  const saved = h.state.rows;
  const track = (heights) => heights.map((height, index) => ({ id: `r${index}`, recorded_at: iso(68 - index * 3), mode: 'fer', sensor_error: false, height_mm: height, temperature_c: 25, humidity_percent: 66 }));
  const base = [20, 20, 20, 20, 20];
  h.state.rows = track([...base, 26, 32, 38]); await h.vm.refresh(); await drain();
  assert.equal(h.vm.jarMood, 'eating'); assert.match(h.vm.jarMoodLabel, /正在上涨/); assert.equal(h.vm.jarPeakLevel, null);
  const risingLevel = h.vm.jarLevel;
  // 起点 20mm，涨到 2 倍（40mm，膨胀率 +100%）才进入 pre-peak，仍是「吃饭」。
  h.state.rows = track([...base, 26, 32, 38, 40]); await h.vm.refresh(); await drain();
  assert.equal(h.vm.summary.risePhase, 'pre-peak'); assert.equal(h.vm.jarMood, 'eating'); assert.match(h.vm.jarMoodLabel, /接近高点/);
  h.state.rows = track([...base, 26, 32, 38, 42, 46, 45, 44]); await h.vm.refresh(); await drain();
  assert.equal(h.vm.jarMood, 'peak'); assert.match(h.vm.jarMoodLabel, /^Peak · /); assert.equal(h.vm.jarPeakLevel, null);
  assert.ok(h.vm.jarLevel > risingLevel, 'a higher starter fills more of the jar');
  h.state.rows = track([...base, 26, 32, 38, 42, 46, 45, 44, 42, 40]); await h.vm.refresh(); await drain();
  assert.equal(h.vm.jarMood, 'hungry'); assert.match(h.vm.jarMoodLabel, /饿了 · 已过 Peak 回落/);
  assert.equal(h.vm.jarPeakLevel, starterJar.jarLevel(46, 20), 'the trace marks the locked last-peak');
  assert.ok(h.vm.jarLevel < h.vm.jarPeakLevel, 'the fallen level sits below the trace');
  h.state.rows = saved; await h.vm.refresh(); await drain();
}
assert.equal(h.vm.deviceId, 'd1', 'the selected starter determines the active device');
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
h.vm.selectStarter('s2'); await settle(); await drain();
assert.equal(h.vm.deviceId, 'd2', 'selecting a starter switches to its linked device');
assert.equal(h.vm.jarMood, 'idle', 'without a selected starter round the jar rests');
h.state.links.push({ starter_id: 's2', device_id: 'd1', active_from: iso(70), active_to: null });
await h.vm.refresh(); await drain();
assert.equal(h.vm.starterId, 's2', 'explicit starter choice survives polling');
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
assert.doesNotMatch(unlinkedHtml, /picker-row/, 'the starter picker stays collapsed until requested');
h.vm.contextOpen = true;
const expandedHtml = await h.html();
assert.match(expandedHtml, /picker-row/, 'opening the starter switch reveals only the starter picker');
assert.match(expandedHtml, /酵种管理/, 'association and starter management are delegated to settings');
assert.doesNotMatch(expandedHtml, /关联当前设备|酵种罐|新增酵种|>归档</);
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
assert.doesNotMatch(closedHtml, /结束原因/, 'the reason stays in record detail instead of cluttering home');
assert.match(closedHtml, /历史记录已保存/, 'saving the history raises the toast');
assert.match(closedHtml, /本次发酵已结束/);
assert.match(closedHtml, /class="device-cta"/);
assert.doesNotMatch(closedHtml, /结束当前发酵/, 'closed round no longer offers manual end');
assert.match(closedHtml, />喂养</, 'a closed round offers the next feeding instead');
h.state.links = [link]; await h.vm.refresh(); await drain();
h.stop();

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
switched.vm.contextOpen = true;
switched.user.value = { id: 'new' };
assert.equal(switched.vm.contextOpen, false);
assert.deepEqual(switched.vm.starters, []);
switched.state.starters = [{ id: 'new-starter', name: '新账号' }]; switched.state.links = [];
switched.state.starterGate = null; stale.resolve([{ id: 'old-starter', name: '旧账号' }]); await settle();
assert.deepEqual(switched.vm.starters.map(item => item.id), ['new-starter'], 'stale account response is discarded and current account loads');
assert.deepEqual(switched.state.calls, ['old', 'new']); switched.stop();

console.log('mobile device home: starter-only picker, management navigation, linked-device switching, account isolation, serialized refresh, API failures, stale evidence, confirm/end flow and toast passed');

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
  assert.doesNotMatch(home, /可手动诊断/, 'home has no diagnosis entry, so the evidence error never suggests one');
  assert.match(home, /本轮设备证据读取失败，请刷新重试。/);
  assert.match(detail, /Math\.max\(\.\.\.values\)\.toFixed\(1\)/, 'record detail peak keeps one decimal');
  assert.match(diary, /metricText\(peak, '%', 1\)/, 'diary peak keeps one decimal');
  assert.match(draggable, /toFixed\(1\)/, 'the chart tooltip rounds to one decimal');
  assert.doesNotMatch(draggable, /<strong>\{\{ point\.v \}\}/, 'the tooltip never prints the raw sample value');
}
console.log('expansion percent: one decimal everywhere');
