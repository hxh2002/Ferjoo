import assert from 'node:assert/strict';
import { parse, compileScript } from '@vue/compiler-sfc';
import * as Vue from 'vue';
import { readFile } from 'node:fs/promises';
import { EMPTY_CURVE_COPY, NO_SAMPLE_HINT, clipRoundMeasurements, curveCopy, formatRoundDuration, roundDurationText, roundWindow } from '../src/lib/record-detail.js';
import { expansionSeries } from '../src/services/feeding-analysis.service.js';
import { starterDisambiguation } from '../src/lib/starter-labels.js';
import { CLOSE_REASON_LABELS, feedingEvidenceCacheKey, roundState } from '../src/lib/mobile-records.js';

// 解绑场景：设备在 10/25 23:05 喂养后很快解绑，summary.elapsedHours 被 unlinkedAt 截成 0；
// 轮次实际在 10/29 14:37 的下一次喂养时结束。
const FED = '2026-10-25T23:05:00+08:00';
const NEXT = '2026-10-29T14:37:00+08:00';
const record = { id: 'f1', kind: 'feeding', starter_id: 's1', occurred_at: FED, ratio: '1:2:2', input: {} };
const unlinkSummary = {
  windowFrom: new Date(FED).toISOString(), windowTo: new Date(FED).toISOString(), windowClosed: true, windowStatus: 'closed',
  windowClosedAt: new Date(NEXT).toISOString(), windowEndReason: 'next_feeding', elapsedHours: 0, measurementCount: 0
};
assert.equal(roundDurationText(unlinkSummary, record), '87 小时 32 分钟', 'closed round uses windowClosedAt - windowFrom, not the unlink-capped elapsedHours');
assert.equal(roundDurationText({ ...unlinkSummary, windowClosedAt: null, windowTo: new Date(NEXT).toISOString() }, record), '87 小时 32 分钟', 'windowTo is the fallback end');
const now = Date.parse('2026-10-26T04:05:10+08:00');
assert.equal(roundDurationText({ windowFrom: unlinkSummary.windowFrom, windowStatus: 'in_progress', windowClosed: false, elapsedHours: 0 }, record, now), '5 小时', 'in-progress uses now - windowFrom');
assert.equal(roundDurationText(null, record), '—');
assert.equal(roundDurationText({ windowStatus: 'not_started' }, record), '—');
assert.equal(formatRoundDuration(0, 25 * 60000), '25 分钟');
assert.equal(formatRoundDuration(0, 90 * 60000), '1 小时 30 分钟');
assert.equal(formatRoundDuration(5, 0), '—');
assert.ok(Number.isNaN(roundWindow({ windowStatus: 'not_started' }, record).to));

// ---------- 曲线裁剪 ----------
const at = (iso, extra = {}) => ({ recorded_at: new Date(iso).toISOString(), height_mm: 30, temperature_c: 25, humidity_percent: 60, mode: 'fer', sensor_error: false, ...extra });
const closed = {
  windowFrom: '2026-10-25T00:00:00Z', windowTo: '2026-10-25T10:00:00Z', windowClosed: true, windowStatus: 'closed',
  windowClosedAt: '2026-10-25T10:00:00Z'
};
const rows = [
  at('2026-10-24T23:50:00Z'),
  at('2026-10-25T00:00:00Z'),
  at('2026-10-25T01:00:00Z', { mode: 'sleep' }),
  at('2026-10-25T02:00:00Z', { sensor_error: true }),
  at('2026-10-25T03:00:00Z', { mode: undefined }),
  at('2026-10-25T04:00:00Z', { mode: null }),
  at('2026-10-25T10:00:00Z'),
  at('2026-10-25T10:30:00Z'),
  { recorded_at: 'bad' }
].reverse();
const clipped = clipRoundMeasurements(rows, closed, record, Date.parse('2026-10-26T00:00:00Z'));
assert.deepEqual(clipped.map((row) => row.recorded_at), ['2026-10-25T00:00:00.000Z', '2026-10-25T03:00:00.000Z', '2026-10-25T04:00:00.000Z', '2026-10-25T10:00:00.000Z'], 'before window, after close, sleep, sensor_error and bad rows are dropped; null/undefined mode stays; result is sorted');
// 进行中：终点是 now。
const running = clipRoundMeasurements(rows, { windowFrom: '2026-10-25T00:00:00Z', windowStatus: 'in_progress', windowClosed: false }, record, Date.parse('2026-10-25T05:00:00Z'));
assert.deepEqual(running.map((row) => row.recorded_at), ['2026-10-25T00:00:00.000Z', '2026-10-25T03:00:00.000Z', '2026-10-25T04:00:00.000Z']);

// ---------- 空态文案 ----------
const unavailableReason = '这段设备关联已经结束，现有权限无法核实历史读数归属，请手工确认。';
const copyOf = (input) => curveCopy({ evidence: null, evidenceError: '', hint: '', hasCharts: false, ...input });
assert.deepEqual(copyOf({ evidence: { unavailableReason }, hint: unavailableReason }), { hint: '', emptyMessage: unavailableReason }, 'unverifiable history shows only the accurate reason, once');
assert.ok(!copyOf({ evidence: { unavailableReason }, hint: unavailableReason }).emptyMessage.includes('没有有效设备采样'));
assert.deepEqual(copyOf({ evidenceError: '读取失败', hint: '读取失败' }), { hint: '', emptyMessage: '读取失败' });
assert.deepEqual(copyOf({ evidence: {}, hint: NO_SAMPLE_HINT }), { hint: '', emptyMessage: EMPTY_CURVE_COPY }, 'generic empty copy does not repeat the no-sample hint');
assert.deepEqual(copyOf({ evidence: {}, hint: '基线计算中…' }), { hint: '基线计算中…', emptyMessage: EMPTY_CURVE_COPY });
assert.deepEqual(copyOf({ evidence: {}, hint: '基线采样未满，膨胀率仅供参考。', hasCharts: true }), { hint: '基线采样未满，膨胀率仅供参考。', emptyMessage: '' });

// ---------- 执行真实的 MobileRecordDetail script setup ----------
const source = await readFile(new URL('../src/views/mobile/MobileRecordDetail.vue', import.meta.url), 'utf8');
const { descriptor, errors } = parse(source);
assert.deepEqual(errors, []);
const compiled = compileScript(descriptor, { id: 'record-detail-test' });
const setupCode = compiled.content.replace(/import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/g, (_, bindings, from) => {
  if (bindings.trim().startsWith('{')) return `const ${bindings.replace(/\bas\b/g, ':')} = modules[${JSON.stringify(from)}];`;
  return `const ${bindings.trim()} = modules[${JSON.stringify(from)}];`;
}).replace('export default', 'return');
const libs = await import('../src/lib/record-detail.js');
const diagnosis = await import('../src/services/mobile-diagnosis.service.js');

async function mount(evidence) {
  const modules = {
    vue: { ...Vue, inject: () => null },
    '../../assets/device/icon-scales.svg': { default: '' },
    '../../assets/device/icon-timer.svg': { default: '' },
    'vue-router': { useRoute: () => ({ params: { id: 'f1' }, query: {} }), useRouter: () => ({ replace: async () => {} }) },
    '../../composables/useAuth.js': { useAuth: () => ({ user: Vue.ref({ id: 'u1' }) }) },
    '../../services/care.service.js': { getCareRecord: async () => record, listStarters: async () => [{ id: 's1', name: '一号' }] },
    '../../services/feeding-analysis.service.js': { expansionSeries, loadFeedingEvidence: async () => evidence },
    '../../services/mobile-diagnosis.service.js': diagnosis,
    '../../lib/mobile-records.js': { CLOSE_REASON_LABELS, feedingEvidenceCacheKey, roundState },
    '../../lib/read-cache.js': { READ_TTL: { records: 0 }, cachedRead: (_key, load) => load() },
    '../../lib/record-detail.js': libs,
    '../../components/mobile/MDraggableChart.vue': {}
  };
  const component = new Function('modules', setupCode)(modules);
  const scope = Vue.effectScope();
  const vm = Vue.proxyRefs(scope.run(() => component.setup({}, { expose() {} })));
  for (let i = 0; i < 10; i++) await Promise.resolve();
  return { vm, stop: () => scope.stop() };
}

// 解绑场景：详情页的已发酵 / 历时 = 87 小时 32 分钟，而不是 0 分钟；诊断预填用的 elapsedHours 保持不动。
{
  const evidence = { feeding: record, link: { device_id: 'd1', active_to: '2026-10-25T16:00:00Z' }, measurements: [], unavailableReason, summary: unlinkSummary };
  const page = await mount(evidence);
  assert.equal(page.vm.durationText, '87 小时 32 分钟');
  assert.notEqual(page.vm.durationText, '0 分钟');
  assert.equal(page.vm.summary.elapsedHours, 0, 'elapsedHours (used for diagnosis prefill) is untouched');
  assert.equal(page.vm.roundCharts, null);
  assert.deepEqual({ ...page.vm.curveText }, { hint: '', emptyMessage: unavailableReason });
  // 时分按运行环境本地时区显示（CI 为 UTC），期望值也按本地时区算。
  const closedAt = new Date(NEXT);
  assert.equal(page.vm.windowRange.to, `${String(closedAt.getHours()).padStart(2, '0')}:${String(closedAt.getMinutes()).padStart(2, '0')}`);
  page.stop();
}
// 手动结束的轮次：曲线只到结束点，且排除 sleep / 故障点。
{
  const summary = { ...closed, baselineHeightMm: 30, measurementCount: 3, heightCount: 3, windowEndReason: 'manual', currentHeightMm: 30, elapsedHours: 10 };
  const measurements = [
    at('2026-10-25T00:30:00Z', { height_mm: 30, temperature_c: 24 }),
    at('2026-10-25T01:00:00Z', { mode: 'sleep', height_mm: 99, temperature_c: 99 }),
    at('2026-10-25T02:00:00Z', { sensor_error: true, height_mm: 98, temperature_c: 98 }),
    at('2026-10-25T09:00:00Z', { height_mm: 45, temperature_c: 26 }),
    at('2026-10-25T20:00:00Z', { height_mm: 60, temperature_c: 27 })
  ];
  const page = await mount({ feeding: record, link: { device_id: 'd1', active_to: null }, measurements, unavailableReason: '', summary });
  const charts = page.vm.roundCharts;
  assert.ok(charts, 'charts exist for valid in-window points');
  assert.equal(charts.temperature.length, 2, 'only the two valid in-window points remain');
  assert.deepEqual(charts.temperature.map((point) => point.v), [24, 26]);
  assert.equal(charts.to, '2026-10-25T09:00:00.000Z', 'curve ends at the last in-window point, not now');
  assert.equal(charts.expansion.at(-1).v, 50);
  assert.equal(page.vm.durationText, '10 小时');
  assert.equal(page.vm.curveText.emptyMessage, '');
  page.stop();
}
// 没有任何有效采样（设备关联有效）：通用空态，且不重复「没有可用采样」提示。
{
  const summary = { ...closed, measurementCount: 0, baselineStatus: 'insufficient', heightStale: false };
  const page = await mount({ feeding: record, link: { device_id: 'd1', active_to: null }, measurements: [at('2026-10-25T01:00:00Z', { mode: 'sleep' })], unavailableReason: '', summary: { ...summary, baselineStatus: 'established' } });
  assert.equal(page.vm.roundCharts, null, 'sleep-only rows do not produce curves');
  assert.equal(page.vm.hint, NO_SAMPLE_HINT);
  assert.deepEqual({ ...page.vm.curveText }, { hint: '', emptyMessage: EMPTY_CURVE_COPY });
  page.stop();
}

// 模板：提示只渲染一次（曲线区），不再在「本轮记录」里重复。
assert.equal((descriptor.template.content.match(/class="window-hint"/g) || []).length, 1);
assert.doesNotMatch(descriptor.template.content, /\{\{ hint \}\}/, 'details section no longer repeats the hint');
assert.match(descriptor.template.content, /\{\{ curveText\.emptyMessage \}\}/);

// ---------- 同名酵种的辅助区分（通知设置页） ----------
assert.equal(starterDisambiguation([{ id: 'a', name: '一号' }, { id: 'b', name: '二号' }]).size, 0, 'unique names stay clean');
const dup = starterDisambiguation([
  { id: 'a', name: '一号', created_at: '2026-10-20T08:00:00' },
  { id: 'b', name: '一号', created_at: '2026-11-02T08:00:00' },
  { id: 'c', name: '二号', created_at: '2026-11-02T08:00:00' }
]);
assert.equal(dup.get('a'), '创建于 10 月 20 日');
assert.equal(dup.get('b'), '创建于 11 月 2 日');
assert.equal(dup.has('c'), false, 'only the duplicated names are annotated');
const sameDay = starterDisambiguation([{ id: 'a', name: '一号', created_at: '2026-10-20T08:00:00' }, { id: 'b', name: '一号', created_at: '2026-10-20T21:30:00' }]);
assert.equal(sameDay.get('a'), '创建于 10 月 20 日 08:00');
assert.equal(sameDay.get('b'), '创建于 10 月 20 日 21:30');
const noDate = starterDisambiguation([{ id: 'a', name: '一号', deviceId: 'dev-abcd1234' }, { id: 'b', name: '一号' }]);
assert.equal(noDate.get('a'), '设备 …1234', 'falls back to the linked device suffix without created_at');
assert.equal(noDate.get('b'), '同名酵种 2');
const notifications = await readFile(new URL('../src/views/mobile/MobileNotifications.vue', import.meta.url), 'utf8');
assert.doesNotMatch(notifications, /每个提醒倍数每轮喂养只提醒一次/, 'the duplicate sentence is removed');
assert.match(notifications, /提醒设置即时生效，无需保存。<\/p>/);
assert.match(notifications, /可多选，每轮每个倍数只提醒一次。/, 'the explanation under the heading stays');
assert.match(notifications, /v-if="starterNotes\.get\(row\.id\)" class="starter-note"/);
assert.match(await readFile(new URL('../src/services/care.service.js', import.meta.url), 'utf8'), /select\('id, name, created_at'\)/, 'listStarters exposes created_at');

console.log('mobile record detail: window duration, clipped curves, empty-state copy and starter disambiguation passed');
