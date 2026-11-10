import assert from 'node:assert/strict';
import { parse, compileScript } from '@vue/compiler-sfc';
import * as Vue from 'vue';
import { readFile } from 'node:fs/promises';
import { useCheckinDraft } from '../src/composables/useCheckinDraft.js';
import { emptyCheckin, generateMobileReport, loadSessionReport, mobileOptions, validateCheckin } from '../src/services/mobile-diagnosis.service.js';
import { planBack, planNext, skipsBackground, locateErrors } from '../src/lib/checkin-flow.js';
import { heightBand } from '../src/lib/height-band.js';
import { guestLoginTarget, guestRegisterTarget, isAuthPending, isGuest } from '../src/lib/mobile-guest.js';

const draftWith = (extra) => ({ ...emptyCheckin(), ...extra });
const HEIGHT = mobileOptions.height[0].value;
const STAGE = mobileOptions.stage[0].value;
const RATIO = mobileOptions.ratio[0].value;

// ---------- 纯决策：下一步 / 上一步 ----------
const plan = (draft, step = 1, observePart = 1) => planNext({ draft, step, observePart, validate: validateCheckin });

// P0：颜色「不确定」、气味没答——直接去核对，绝不产生看不见的 smell 错误。
assert.deepEqual(plan(draftWith({ color: 'unknown' })), { type: 'step', step: 3 });
assert.deepEqual(plan(draftWith({ color: 'suspicious' })), { type: 'step', step: 3 });
assert.deepEqual(plan(draftWith({ color: 'normal', smell: 'unknown' }), 1, 2), { type: 'step', step: 3 }, 'smell page: unknown goes to review');
assert.deepEqual(plan(draftWith({ color: 'normal', smell: 'suspicious' }), 1, 2), { type: 'step', step: 3 }, 'smell page: suspicious goes to review');
// 安全优先路径只校验当前页能看见并回答的那一项。
assert.deepEqual(plan(draftWith({ smell: 'suspicious' }), 1, 1), { type: 'errors', errors: { color: '请先选择一项；无法判断可选“不确定”。' } }, 'visible color must be answered');
// 气味页上，气味本身没回答时错误落在这一页（看得见）；颜色页的错误从不出现在气味页。
assert.deepEqual(Object.keys(plan(draftWith({ color: 'unknown' }), 1, 2).errors), ['smell']);
for (const [draft, part] of [[draftWith({ color: 'unknown' }), 1], [draftWith({ color: 'suspicious' }), 1], [draftWith({ color: 'normal', smell: 'unknown' }), 2]]) {
  assert.notEqual(plan(draft, 1, part).type, 'errors', 'an answered visible field never yields an error');
}
// 常规路径：颜色 → 气味 → 涨幅 → 背景 → 核对。
assert.deepEqual(plan(draftWith({}), 1, 1), { type: 'stay' }, 'nothing answered: stay');
assert.deepEqual(plan(draftWith({ color: 'normal' }), 1, 1), { type: 'part', observePart: 2 });
assert.deepEqual(plan(draftWith({ color: 'normal', smell: 'normal' }), 1, 2), { type: 'part', observePart: 3 });
assert.deepEqual(plan(draftWith({ color: 'normal', smell: 'normal' }), 1, 3).type, 'errors', 'height is required on part 3');
assert.deepEqual(Object.keys(plan(draftWith({ color: 'normal', smell: 'normal' }), 1, 3).errors), ['height'], 'only the visible field is reported');
assert.deepEqual(plan(draftWith({ color: 'normal', smell: 'normal', height: HEIGHT }), 1, 3), { type: 'step', step: 2 });
const backgroundErrors = plan(draftWith({ color: 'normal', smell: 'normal', height: HEIGHT }), 2);
assert.deepEqual(backgroundErrors.type, 'errors');
assert.ok(Object.keys(backgroundErrors.errors).every((key) => ['stage', 'ratio', 'tempC', 'elapsedHours', 'ph'].includes(key)));
assert.deepEqual(plan(draftWith({ color: 'normal', smell: 'normal', height: HEIGHT, stage: STAGE, ratio: RATIO }), 2), { type: 'step', step: 3 });
// 返回键。
assert.deepEqual(planBack({ draft: draftWith({ color: 'unknown' }), step: 3, observePart: 1 }), { step: 1, observePart: 1 }, 'review → the page that triggered the skip');
assert.deepEqual(planBack({ draft: draftWith({ color: 'normal', smell: 'unknown' }), step: 3, observePart: 1 }), { step: 1, observePart: 2 }, 'smell-triggered skip returns to the smell page');
assert.deepEqual(planBack({ draft: draftWith({ color: 'unknown', smell: 'suspicious' }), step: 3, observePart: 1 }), { step: 1, observePart: 1 });
assert.deepEqual(planBack({ draft: draftWith({ color: 'normal', smell: 'normal' }), step: 3, observePart: 1 }), { step: 2, observePart: 1 });
assert.deepEqual(planBack({ draft: draftWith({ color: 'normal', smell: 'normal' }), step: 2, observePart: 1 }), { step: 1, observePart: 3 });
assert.deepEqual(planBack({ draft: draftWith({ color: 'normal' }), step: 1, observePart: 3 }), { step: 1, observePart: 2 });
assert.equal(skipsBackground(draftWith({ color: 'normal', smell: 'normal' })), false);
assert.deepEqual(locateErrors({ smell: 'x' }), { step: 1, observePart: 2 });
assert.deepEqual(locateErrors({ height: 'x' }), { step: 1, observePart: 3 });
assert.deepEqual(locateErrors({ ratio: 'x' }), { step: 2, observePart: 1 });

// ---------- 服务：不确定 + 另一项未答仍是有效的「需要进一步检查」报告 ----------
assert.deepEqual(validateCheckin(draftWith({ color: 'unknown' })), {}, 'unknown color with an unanswered smell has no blocking error');
assert.deepEqual(validateCheckin(draftWith({ smell: 'unknown' })), {});
assert.ok(validateCheckin(draftWith({ color: 'unknown', smell: 'bogus' })).smell, 'unrecognised values are still rejected');
const unanswered = generateMobileReport(draftWith({ color: 'unknown' }), 'acct').report;
assert.equal(unanswered.result.status, 'needs-check');
assert.equal(unanswered.result.timing, undefined, 'no routine conclusion for an unconfirmed safety answer');
assert.equal(generateMobileReport(draftWith({ smell: 'unknown', color: 'normal' }), 'acct').report.result.status, 'needs-check');
assert.equal(generateMobileReport(draftWith({ color: 'suspicious' }), 'acct').report.result.status, 'discard');

// ---------- 执行真实的 MobileCheckin script setup ----------
const source = await readFile(new URL('../src/views/mobile/MobileCheckin.vue', import.meta.url), 'utf8');
const { descriptor, errors: parseErrors } = parse(source);
assert.deepEqual(parseErrors, []);
const compiled = compileScript(descriptor, { id: 'checkin-flow-test' });
const store = new Map();
globalThis.localStorage = { getItem: (key) => (store.has(key) ? store.get(key) : null), setItem: (key, value) => store.set(key, String(value)), removeItem: (key) => store.delete(key) };
const diagnosis = await import('../src/services/mobile-diagnosis.service.js');
const setupCode = compiled.content.replace(/import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/g, (_, bindings, from) => {
  if (bindings.trim().startsWith('{')) return `const ${bindings.replace(/\bas\b/g, ':')} = modules[${JSON.stringify(from)}];`;
  return `const ${bindings.trim()} = modules[${JSON.stringify(from)}];`;
}).replace('export default', 'return');
const flow = await import('../src/lib/checkin-flow.js');

let counter = 0;
function mount(query = {}, nameState = {}, evidenceResult = null) {
  const account = `checkin-flow-${++counter}`;
  const user = Vue.ref({ id: account });
  const pushed = [];
  const route = { query, path: '/checkin' };
  const modules = {
    vue: { ...Vue, inject: () => null },
    'vue-router': { useRoute: () => route, useRouter: () => ({ push: (to) => { pushed.push(to); } }), onBeforeRouteLeave: () => {} },
    '../../composables/useAuth.js': { useAuth: () => ({ user }) },
    '../../composables/useCheckinDraft.js': { useCheckinDraft },
    '../../services/mobile-diagnosis.service.js': diagnosis,
    '../../services/feeding-analysis.service.js': { loadFeedingEvidence: async (owner, starterId, feedingId) => {
      if (!evidenceResult) throw new Error('unused');
      return typeof evidenceResult === 'function' ? evidenceResult(owner, starterId, feedingId) : evidenceResult;
    } },
    '../../lib/height-band.js': { heightBand },
    '../../composables/useStarterName.js': { useStarterName: () => ({ starterName: Vue.ref(nameState.name ?? '一号'), starterNameLoading: Vue.ref(!!nameState.loading) }) },
    '../../lib/checkin-flow.js': flow,
    '../../lib/mobile-guest.js': { guestLoginTarget, guestRegisterTarget, isAuthPending, isGuest },
    '../../components/mobile/MRadioCard.vue': {},
    '../../components/mobile/MGuestNotice.vue': {}
  };
  const component = new Function('modules', setupCode)(modules);
  const scope = Vue.effectScope();
  const vm = Vue.proxyRefs(scope.run(() => component.setup({}, { expose() {} })));
  return { vm, pushed, account, stop: () => scope.stop() };
}

// 观察模式：颜色「不确定」、气味从未回答。
{
  const page = mount();
  page.vm.selectSafety('color', 'unknown');
  assert.equal(page.vm.canAdvance, true);
  await page.vm.next();
  assert.equal(page.vm.step, 3, 'unknown color goes straight to review');
  assert.deepEqual({ ...page.vm.errors }, {}, 'no invisible error');
  assert.equal(page.vm.skipsBackground, true);
  page.vm.generate();
  assert.equal(page.vm.fatal, '');
  assert.deepEqual(page.pushed, ['/reports/session']);
  assert.equal(loadSessionReport(page.account).result.status, 'needs-check', 'smell never answered still yields a needs-check report');
  page.vm.back();
  assert.equal(page.vm.step, 1);
  assert.equal(page.vm.observePart, 1, 'back from review returns to the color page');
  page.stop();
}
// 颜色「可疑」。
{
  const page = mount();
  page.vm.selectSafety('color', 'suspicious');
  await page.vm.next();
  assert.equal(page.vm.step, 3);
  page.vm.generate();
  assert.equal(loadSessionReport(page.account).result.status, 'discard');
  page.stop();
}
// 常规路径：颜色 → 气味（第 2 页）→ 涨幅（第 3 页）→ 背景 → 核对；气味页选「不确定」直接去核对。
{
  const page = mount();
  page.vm.selectSafety('color', 'normal');
  await page.vm.next();
  assert.equal(page.vm.step, 1);
  assert.equal(page.vm.observePart, 2);
  page.vm.selectSafety('smell', 'unknown');
  await page.vm.next();
  assert.equal(page.vm.step, 3, 'unknown on the smell page goes to review');
  page.vm.generate();
  assert.equal(loadSessionReport(page.account).result.status, 'needs-check');
  page.vm.back();
  assert.deepEqual([page.vm.step, page.vm.observePart], [1, 2], 'back returns to the smell page');
  page.vm.selectSafety('smell', 'normal');
  await page.vm.next();
  assert.deepEqual([page.vm.step, page.vm.observePart], [1, 3]);
  await page.vm.next();
  assert.ok(page.vm.errors.height, 'height error is visible on the height page');
  page.vm.selectHeight(HEIGHT);
  await page.vm.next();
  assert.equal(page.vm.step, 2);
  await page.vm.next();
  assert.ok(page.vm.errors.stage && page.vm.errors.ratio, 'background errors are shown on the background step');
  page.vm.selectBackground('stage', STAGE);
  page.vm.selectBackground('ratio', RATIO);
  await page.vm.next();
  assert.equal(page.vm.step, 3);
  page.vm.generate();
  assert.equal(page.pushed.length, 2, 'the normal path generated a second report after the smell-unknown one');
  assert.equal(loadSessionReport(page.account).input.smell, 'normal');
  page.stop();
}
// generate 遇到错误时，把页面送到出错控件所在的位置。
{
  const page = mount();
  page.vm.draft.color = 'normal';
  page.vm.draft.smell = 'normal';
  page.vm.draft.step = 3;
  page.vm.generate();
  await Vue.nextTick();
  assert.deepEqual([page.vm.step, page.vm.observePart], [1, 3], 'a height error lands on the height page');
  assert.ok(page.vm.errors.height);
  page.stop();
}
// 诊断模式（同样的路径，且颜色 / 气味之外的字段不影响安全报告）。
{
  const page = mount({ mode: 'diagnosis' });
  page.vm.selectSafety('color', 'unknown');
  await page.vm.next();
  assert.equal(page.vm.step, 3);
  assert.deepEqual({ ...page.vm.errors }, {});
  page.vm.generate();
  assert.equal(loadSessionReport(page.account).result.status, 'needs-check');
  page.stop();
}

// 诊断模式的证据提示：覆盖不足 / 部分时段无权读取与轮次详情页同一口径。
{
  const summaryBase = {
    baselineHeightMm: 30, currentHeightMm: 60, baselineStatus: 'established', baselineSource: 'device',
    expansionPercent: 100, historicalRound: false, windowTo: '2026-01-01T04:00:00Z', heightStale: false, temperatureStale: false,
    measurementCount: 20, temperatureCount: 20
  };
  const evidence = (summary, extra = {}) => ({
    feeding: { id: 'f1', starter_id: 's1', kind: 'feeding', occurred_at: '2026-01-01T00:00:00Z', ratio: '1:2:2' },
    summary: { ...summaryBase, ...summary }, measurements: [], now: Date.parse('2026-01-01T04:00:00Z'), ...extra
  });
  const check = async (payload, expected) => {
    const page = mount({ mode: 'diagnosis', feeding: 'f1', starter: 's1' }, {}, payload);
    const started = Date.now();
    while (!page.vm.feedingEvidence && Date.now() - started < 1000) await Vue.nextTick();
    await Vue.nextTick();
    assert.equal(page.vm.evidenceHint, expected);
    page.stop();
  };
  await check(evidence({ coverageStartsLate: true }), '设备关联晚于本轮喂养开始，起始高度不是真实起点，膨胀率仅供参考。');
  await check(evidence({ coverageBroken: true }), '本轮中间有一段时间设备未关联（换绑空窗期），这段时间的读数未计入。');
  await check(evidence({}, { readNotice: '部分关联时段的设备读数无权读取，曲线只包含已读到的时段。' }), '部分关联时段的设备读数无权读取，曲线只包含已读到的时段。');
  await check(evidence({}, { unavailableReason: '本轮没有可核实的设备归属，未使用其他酵种轮次的读数。' }), '本轮没有可核实的设备归属，未使用其他酵种轮次的读数。');
  await check(evidence({}), '');
}
assert.ok(source.includes('role="status"') && source.includes('evidenceHint'), 'the hint is announced in the diagnosis card');

assert.match(source, /v-if="draft\.starterId && !\(diagnosisMode && step === 3\) && !starterNameLoading" class="checkin-starter"/);
// 组合式本身：加载中 starterNameLoading=true，读到名称 / 失败后为 false（失败文案保留给徽标显示）。
{
  const nameSource = await readFile(new URL('../src/composables/useStarterName.js', import.meta.url), 'utf8');
  const code = nameSource
    .replace(/import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/g, (_, bindings, from) => `const ${bindings.replace(/\bas\b/g, ':')} = modules[${JSON.stringify(from)}];`)
    .replace('export function useStarterName', 'function useStarterName') + '\nreturn useStarterName;';
  const run = async (listStarters) => {
    const useStarterName = new Function('modules', code)({ vue: Vue, '../services/care.service.js': { listStarters } });
    const scope = Vue.effectScope();
    const result = scope.run(() => useStarterName(Vue.ref('acct'), Vue.ref('s1')));
    const during = { name: result.starterName.value, loading: result.starterNameLoading.value };
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const after = { name: result.starterName.value, loading: result.starterNameLoading.value };
    scope.stop();
    return { during, after };
  };
  const ok = await run(async () => [{ id: 's1', name: '一号' }]);
  assert.deepEqual(ok.during, { name: '正在加载名称…', loading: true }, 'while loading the badge text is a placeholder and the flag is on');
  assert.deepEqual(ok.after, { name: '一号', loading: false });
  const failed = await run(async () => { throw new Error('offline'); });
  assert.deepEqual(failed.after, { name: '名称加载失败，请稍后重试', loading: false }, 'failure text is kept and shown');
}
console.log('mobile checkin flow: safety-priority next/back/generate, visible errors and name badge contracts passed');
delete globalThis.localStorage;
