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
const gapState = { row: { enabled: false, days: 3 }, saves: [], fail: false };
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
  '../../services/web-push.service.js': {
    FEEDING_GAP_DAYS: [1, 2, 3, 5, 7],
    loadHeightTargets: async () => [],
    saveHeightTargets: async () => {},
    loadFeedingGapAlert: async () => gapState.row,
    saveFeedingGapAlert: async (starterId, enabled, days) => {
      if (gapState.fail) throw new Error('喂养提醒保存失败，请重试。');
      gapState.saves.push({ starterId, enabled, days });
      gapState.row = { enabled, days };
    }
  },
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
assert.equal(custom.vm.showCustom, true, 'custom fields are revealed');
assert.deepEqual(custom.vm.customText, { starter: '1', water: '2', flour: '2' }, 'fields are seeded from the current ratio');
custom.vm.setCustomPart('starter', '2');
assert.equal(custom.vm.draft.ratio, '2:2:2', 'editing rewrites only the chosen part');
assert.equal(custom.vm.weights, null, 'no weight is invented before one is typed');
// 非整数比例：0.5 / 1.5 / 2.25 都应按原样收下，不做整数限制也不截断。
custom.vm.setCustomPart('water', '2.5');
assert.equal(custom.vm.draft.ratio, '2:2.5:2');
custom.vm.setCustomPart('starter', '0.5');
assert.equal(custom.vm.draft.ratio, '0.5:2.5:2', 'a fractional starter is accepted');
assert.equal(custom.vm.customRatioLabel, '0.5 : 2.5 : 2');
// 任一项非法（清空 / 0 / 文本）即清空比例，保存按钮与重量换算据此停用。
custom.vm.setCustomPart('water', '');
assert.equal(custom.vm.draft.ratio, '', 'a blank part clears the ratio instead of saving it');
custom.vm.setCustomPart('water', '0');
assert.equal(custom.vm.draft.ratio, '', 'a zero part is rejected');
custom.vm.setCustomPart('water', 'abc');
assert.equal(custom.vm.draft.ratio, '', 'a non-numeric part is rejected');
custom.vm.setCustomPart('water', '1.5');
assert.equal(custom.vm.draft.ratio, '0.5:1.5:2', 'a corrected value restores the ratio');
custom.stop();

const customBlank = mountAs('account-custom-blank', null);
customBlank.vm.selectCustom();
assert.equal(customBlank.vm.draft.ratio, '1:1:1', 'opening custom falls back to 1:1:1 so the fields have a value');
customBlank.vm.setCustomPart('flour', '3');
assert.equal(customBlank.vm.draft.ratio, '1:1:3');
assert.equal(customBlank.vm.customRatioLabel, '1 : 1 : 3');
customBlank.vm.setCustomPart('water', '2.25');
assert.equal(customBlank.vm.draft.ratio, '1:2.25:3', 'large or fractional values are kept as typed without clamping');
assert.equal(customBlank.vm.ratioSummary, '自定义 1 : 2.25 : 3');
customBlank.vm.setWeight('starter', '50');
assert.equal(customBlank.vm.weights.water, 112.5, 'weights convert against a fractional ratio');
customBlank.stop();

const customLegacy = mountAs('account-custom-legacy', draftOf({ ratio: '1:2', submission: {} }));
customLegacy.vm.selectCustom();
assert.equal(customLegacy.vm.draft.ratio, '1:1:1', 'an unparseable legacy ratio is reset so the fields stay usable');
customLegacy.vm.setCustomPart('water', '0.5');
assert.equal(customLegacy.vm.draft.ratio, '1:0.5:1', 'fractional water below 1 is allowed');
customLegacy.stop();
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

assert.match(source, /距上次喂养超过该天数/);
assert.match(source, /到时提醒一次，喂养后重计/);
assert.match(source, /v-for="day in FEEDING_GAP_DAYS"/);
gapState.row = { enabled: true, days: 5 };
gapState.saves = [];
gapState.fail = false;
const gap = mountAs('account-gap', null);
await Vue.nextTick();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(gap.vm.feedingGapSummary, '5 天', 'a saved reminder shows its day count');
assert.equal(gap.vm.feedingGapDays, 5);
gap.vm.chooseFeedingGapDay(4);
assert.equal(gapState.saves.length, 0, 'days outside 1/2/3/5/7 are ignored');
await gap.vm.chooseFeedingGapDay(7);
assert.deepEqual(gapState.saves.at(-1), { starterId: STARTER, enabled: true, days: 7 });
assert.equal(gap.vm.feedingGapSummary, '7 天');
assert.equal(tracked.at(-1).name, 'feeding_gap_alert_saved');
gapState.fail = true;
await gap.vm.toggleFeedingGap();
assert.equal(gap.vm.feedingGapEnabled, true, 'a failed save restores the previous switch');
assert.match(gap.vm.feedingGapNotice, /保存失败/);
gapState.fail = false;
await gap.vm.toggleFeedingGap();
assert.equal(gap.vm.feedingGapEnabled, false);
assert.equal(gap.vm.feedingGapSummary, '不提醒');
await gap.vm.chooseFeedingGapDay(1);
assert.equal(gap.vm.feedingGapEnabled, false, 'picking a day does not turn the reminder on');
assert.equal(gap.vm.feedingGapDays, 1);
assert.deepEqual(gapState.saves.at(-1), { starterId: STARTER, enabled: false, days: 1 });
const savesBeforeGuest = gapState.saves.length;
user.value = null;
await gap.vm.toggleFeedingGap();
assert.equal(gapState.saves.length, savesBeforeGuest, 'guests keep the choice locally and do not write the cloud setting');
assert.match(gap.vm.feedingGapNotice, /登录/);
gap.stop();
user.value = { id: 'account-confirmed' };

delete globalThis.localStorage;
console.log('mobile feeding: six-phase state machine (editing/validating/saving/pending/saved/next) contracts passed');
