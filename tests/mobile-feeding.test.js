import assert from 'node:assert/strict';
import { parse, compileScript } from '@vue/compiler-sfc';
import * as Vue from 'vue';
import { readFile } from 'node:fs/promises';
import { useCheckinDraft } from '../src/composables/useCheckinDraft.js';
import { localDateTimeValue, parseLocalDateTime } from '../src/lib/localDateTime.js';
import { computeWeights, ratioParts, weightFields } from '../src/lib/feeding-weights.js';
import { randomUuid, isUuid } from '../src/lib/uuid.js';
import { guestLoginTarget, guestRegisterTarget, isAuthPending, isGuest } from '../src/lib/mobile-guest.js';

// 保存确认后自动回设备首页；再次进入本页才开启下一条。待确认草稿始终锁定。
const file = new URL('../src/views/mobile/MobileFeeding.vue', import.meta.url);
const source = await readFile(file, 'utf8');
const { descriptor, errors } = parse(source);
assert.deepEqual(errors, []);
const compiled = compileScript(descriptor, { id: 'feeding-test' });

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key)
};

const STARTER = '11111111-1111-4111-8111-111111111111';
const draftOf = (extra) => ({
  starterId: STARTER,
  occurredAt: localDateTimeValue(),
  ratio: '1:2:2',
  weightField: '',
  weightValue: '',
  baselineHeightMm: '',
  baselineSource: '',
  deviceId: '',
  step: 1,
  requestId: randomUuid(),
  submission: { requestId: randomUuid(), starterId: STARTER },
  confirmed: false,
  ...extra
});

const user = Vue.ref({ id: 'account-confirmed' });
const route = { query: {} };
let routeUpdateHook = null;
let mountedHook = null;
const navigations = [];
const tracked = [];
const modules = {
  vue: { ...Vue, onMounted: (hook) => { mountedHook = hook; } },
  'vue-router': {
    useRoute: () => route,
    useRouter: () => ({ replace: async (to) => { navigations.push(to); } }),
    onBeforeRouteUpdate: (hook) => { routeUpdateHook = hook; }
  },
  '../../composables/useAuth.js': { useAuth: () => ({ user }) },
  '../../composables/useCheckinDraft.js': { useCheckinDraft },
  '../../services/care.service.js': { saveFeeding: async () => ({ id: 'saved-id' }) },
  '../../composables/useStarterName.js': { useStarterName: () => ({ starterName: Vue.ref('一号') }) },
  '../../lib/uuid.js': { randomUuid, isUuid },
  '../../lib/mobile-guest.js': { guestLoginTarget, guestRegisterTarget, isAuthPending, isGuest },
  '../../lib/localDateTime.js': { localDateTimeValue, parseLocalDateTime },
  '../../lib/feeding-weights.js': { computeWeights, ratioParts, weightFields },
  '../../services/height-alert.service.js': { HEIGHT_ALERT_TARGETS: [2, 2.5, 3] },
  '../../services/web-push.service.js': { loadHeightTargets: async () => [], saveHeightTargets: async () => {} },
  // 埋点只做副作用，测试用桩捕获调用，避免真实服务在 node 环境触碰 Supabase 配置。
  '../../services/analytics.service.js': { trackEvent: (name, properties, options) => { tracked.push({ name, properties, options }); return Promise.resolve({ recorded: true }); } },
  '../../components/mobile/MRecordCard.vue': {},
  '../../components/mobile/MCalendar.vue': {},
  '../../components/mobile/MWheelPicker.vue': {}
};
const setupCode = compiled.content.replace(/import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/g, (_, bindings, from) => {
  if (bindings.trim().startsWith('{')) return `const ${bindings.replace(/\bas\b/g, ':')} = modules[${JSON.stringify(from)}];`;
  return `const ${bindings.trim()} = modules[${JSON.stringify(from)}];`;
}).replace('export default', 'return');

function mountAs(account, draft) {
  user.value = { id: account };
  const key = `ferjoo:mobile:draft:${account}:feeding`;
  if (draft) store.set(key, JSON.stringify(draft));
  else store.delete(key);
  const component = new Function('modules', setupCode)(modules);
  const scope = Vue.effectScope();
  const bindings = scope.run(() => component.setup({}, { expose() {} }));
  return { vm: Vue.proxyRefs(bindings), stop: () => scope.stop() };
}

route.query = { starter: STARTER };
const confirmed = mountAs('account-confirmed', draftOf({ confirmed: true }));
assert.equal(confirmed.vm.draft.confirmed, true, 'confirmed content is intact before navigation entry hooks run');
assert.equal(confirmed.vm.phase, 'saved');
mountedHook();
assert.equal(confirmed.vm.draft.confirmed, false, 'a fresh entry after a confirmed save quietly starts a new record');
assert.equal(confirmed.vm.draft.ratio, '', 'the prior confirmed ratio is cleared');
assert.equal(confirmed.vm.phase, 'editing', 'the old saved banner is not shown on a new entry');
assert.equal(confirmed.vm.status, '', 'route-entry reset stays quiet');
assert.equal(confirmed.vm.draft.starterId, STARTER, 'the requested starter is selected');
confirmed.vm.draft.ratio = '1:1:1';
await Vue.nextTick();
routeUpdateHook({ query: { starter: STARTER } });
assert.equal(confirmed.vm.draft.ratio, '1:1:1', 'reactive edits never reset a new unsaved form');
confirmed.stop();

const pending = mountAs('account-pending', draftOf({ confirmed: false }));
mountedHook();
routeUpdateHook({ query: { starter: '22222222-2222-4222-8222-222222222222' } });
assert.equal(pending.vm.locked, true, 'an unconfirmed submission stays locked');
assert.equal(pending.vm.draft.ratio, '1:2:2', 'the frozen draft keeps its content');
assert.equal(pending.vm.draft.starterId, STARTER, 'route entry cannot replace a pending draft starter');
pending.stop();

const blank = mountAs('account-empty', null);
assert.equal(blank.vm.draft.ratio, '');
assert.equal(blank.vm.locked, false);
blank.stop();

route.query = { starter: STARTER };
const saved = mountAs('account-save', null);
saved.vm.draft.ratio = '1:1:1';
navigations.length = 0;
await saved.vm.save();
await Vue.nextTick();
assert.equal(saved.vm.draft.confirmed, true, 'a saved feeding stays confirmed in the persisted draft');
assert.equal(saved.vm.error, '');
assert.deepEqual(navigations, ['/device'], 'a confirmed save returns straight to the device home');
assert.deepEqual({ ...tracked.at(-1), properties: { ...tracked.at(-1).properties, occurred_at: undefined } }, {
  name: 'feeding_saved',
  properties: { record_id: 'saved-id', starter_id: STARTER, occurred_at: undefined, ratio: '1:1:1', has_baseline: false, has_weights: false },
  options: { page: 'feeding', eventId: saved.vm.draft.requestId }
}, 'a confirmed cloud save reports feeding_saved with the request id as the idempotency key');
assert.equal(tracked.at(-1).properties.occurred_at, parseLocalDateTime(saved.vm.draft.occurredAt).toISOString(), 'the reported time is the confirmed save time, not a later read');
saved.vm.startNext(saved.vm.draft.starterId);
assert.equal(saved.vm.draft.confirmed, false, 'starting the next feeding clears the confirmation');
assert.equal(saved.vm.draft.ratio, '', 'starting the next feeding clears the ratio');
assert.notEqual(saved.vm.status, '', 'the explicit action explains what happened');
saved.stop();

delete globalThis.localStorage;
console.log('mobile feeding: starter entry resets confirmed drafts, pending drafts stay locked, and same-visit saves remain visible');

// --- 六态状态机：editing / validating / saving / pending / saved / next ---
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key)
};

const editing = mountAs('account-phase-editing', null);
assert.equal(editing.vm.phase, 'editing', 'fresh form starts in editing');
assert.equal(editing.vm.phaseLabel, '记录已发生的喂养');
assert.equal(editing.vm.submitLabel, '保存喂养记录');
editing.stop();

const validating = mountAs('account-phase-validating', draftOf({ submission: {} }));
validating.vm.draft.starterId = '';
await validating.vm.save();
await Vue.nextTick();
assert.equal(validating.vm.phase, 'validating', 'validation failure enters validating');
assert.equal(validating.vm.phaseLabel, '请先修正表单');
assert.ok(validating.vm.error, 'error message is present');
validating.stop();

const pendingPhase = mountAs('account-phase-pending', draftOf({ confirmed: false }));
assert.equal(pendingPhase.vm.phase, 'pending', 'locked unconfirmed submission is pending');
assert.equal(pendingPhase.vm.phaseLabel, '待确认 · 内容已锁定');
assert.equal(pendingPhase.vm.submitLabel, '重试确认本次保存');
pendingPhase.stop();

const savingMod = mountAs('account-phase-saving', draftOf({ submission: {} }));
savingMod.vm.draft.ratio = '1:2:2';
// saveFeeding resolves asynchronously; saving flag should be true immediately after call.
const savePromise = savingMod.vm.save();
assert.equal(savingMod.vm.phase, 'saving', 'in-flight save enters saving');
assert.equal(savingMod.vm.submitLabel, '保存中…');
await savePromise;
await Vue.nextTick();
assert.equal(savingMod.vm.phase, 'saved', 'confirmed save enters saved');
assert.equal(savingMod.vm.phaseLabel, '已保存');
savingMod.vm.startNext(savingMod.vm.draft.starterId);
await Vue.nextTick();
assert.equal(savingMod.vm.phase, 'editing', 'startNext returns to editing for next entry');
savingMod.stop();

const custom = mountAs('account-custom-ratio', null);
custom.vm.selectRatio('1:2:2');
custom.vm.selectCustom();
assert.equal(custom.vm.draft.ratio, '1:2:2', 'opening custom keeps the selected preset');
assert.equal(custom.vm.showCustom, true, 'custom sliders are revealed');
custom.vm.setCustomSlider('starter', '2');
assert.equal(custom.vm.draft.ratio, '2:2:2', 'sliders rewrite only the chosen part');
assert.equal(custom.vm.weights, null, 'no weight is invented before one is typed');
custom.stop();
const customBlank = mountAs('account-custom-blank', null);
customBlank.vm.selectCustom();
assert.equal(customBlank.vm.draft.ratio, '1:1:1', 'opening custom falls back to 1:1:1 so the sliders have a value');
customBlank.vm.setCustomSlider('flour', '3');
assert.equal(customBlank.vm.draft.ratio, '1:1:3');
assert.equal(customBlank.vm.customRatioLabel, '1 : 1 : 3');
customBlank.vm.setCustomSlider('water', '99');
assert.equal(customBlank.vm.draft.ratio, '1:10:3', 'slider input is clamped to its range');
assert.equal(customBlank.vm.ratioSummary, '自定义 1 : 10 : 3');
customBlank.vm.setWeight('starter', '50');
assert.equal(customBlank.vm.weights.water, 500);
customBlank.stop();
assert.match(source, /<strong>已保存<\/strong>/);
assert.match(source, />开始下一条</);
assert.match(source, /router\.replace\('\/device'\)/, 'a confirmed save replaces the form with the device home');

// 高度提醒摘要与通知设置页同为「N×」写法，存储值不变（2 / 2.5 / 3）。
const alertCard = mountAs('account-alert-summary', null);
assert.equal(alertCard.vm.alertSummary, '不提醒');
for (const [stored, label] of [['2', '2×'], ['2.5', '2.5×'], ['3', '3×']]) {
  alertCard.vm.draft.heightAlert = stored;
  assert.equal(alertCard.vm.alertSummary, label, `heightAlert ${stored} is summarised as ${label}`);
  assert.equal(alertCard.vm.draft.heightAlert, stored, 'the stored value is untouched');
}
alertCard.vm.draft.heightAlert = '';
assert.equal(alertCard.vm.alertSummary, '不提醒');
alertCard.stop();

delete globalThis.localStorage;
console.log('mobile feeding: six-phase state machine (editing/validating/saving/pending/saved/next) contracts passed');
