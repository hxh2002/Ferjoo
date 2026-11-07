import assert from 'node:assert/strict';
import { parse, compileScript } from '@vue/compiler-sfc';
import * as Vue from 'vue';
import { readFile } from 'node:fs/promises';
import { useCheckinDraft } from '../src/composables/useCheckinDraft.js';
import { localDateTimeValue, parseLocalDateTime } from '../src/lib/localDateTime.js';
import { computeWeights, ratioParts, weightFields } from '../src/lib/feeding-weights.js';
import { randomUuid, isUuid } from '../src/lib/uuid.js';
import { guestLoginTarget, guestRegisterTarget, isAuthPending, isGuest } from '../src/lib/mobile-guest.js';

// 已确认的喂养留在 saved，直到用户点「开始下一条」。待确认草稿仍保持锁定。
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
const modules = {
  vue: { ...Vue },
  'vue-router': { useRoute: () => route },
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

const confirmed = mountAs('account-confirmed', draftOf({ confirmed: true }));
assert.equal(confirmed.vm.draft.confirmed, true, 'a confirmed draft stays until the user starts the next record');
assert.equal(confirmed.vm.draft.ratio, '1:2:2', 'the saved ratio remains visible after refresh');
assert.equal(confirmed.vm.phase, 'saved', 'refresh keeps the saved banner');
assert.equal(confirmed.vm.draft.starterId, STARTER, 'the starter stays with the confirmed draft');
confirmed.stop();

const pending = mountAs('account-pending', draftOf({ confirmed: false }));
assert.equal(pending.vm.locked, true, 'an unconfirmed submission stays locked');
assert.equal(pending.vm.draft.ratio, '1:2:2', 'the frozen draft keeps its content');
pending.stop();

const blank = mountAs('account-empty', null);
assert.equal(blank.vm.draft.ratio, '');
assert.equal(blank.vm.locked, false);
blank.stop();

route.query = { starter: STARTER };
const saved = mountAs('account-save', null);
saved.vm.draft.ratio = '1:1:1';
await saved.vm.save();
await Vue.nextTick();
assert.equal(saved.vm.draft.confirmed, true, 'a saved feeding stays visible for the current visit');
assert.equal(saved.vm.error, '');
saved.vm.startNext(saved.vm.draft.starterId);
assert.equal(saved.vm.draft.confirmed, false, 'starting the next feeding clears the confirmation');
assert.equal(saved.vm.draft.ratio, '', 'starting the next feeding clears the ratio');
assert.notEqual(saved.vm.status, '', 'the explicit action explains what happened');
saved.stop();

delete globalThis.localStorage;
console.log('mobile feeding: confirmed drafts stay saved, pending drafts stay locked, and startNext clears them');

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
custom.vm.setCustomPart('starter', '50');
assert.equal(custom.vm.weights.water, 100);
assert.equal(custom.vm.weights.flour, 100);
custom.stop();
const customBlank = mountAs('account-custom-blank', null);
customBlank.vm.selectCustom();
assert.equal(customBlank.vm.draft.ratio, '', 'opening custom does not invent a ratio');
customBlank.vm.setCustomPart('starter', '50');
assert.equal(customBlank.vm.draft.ratio, '1:1:1');
assert.equal(customBlank.vm.weights.water, 50);
customBlank.stop();
assert.match(source, /<strong>已保存<\/strong>/);
assert.match(source, />开始下一条</);

delete globalThis.localStorage;
console.log('mobile feeding: six-phase state machine (editing/validating/saving/pending/saved/next) contracts passed');
