import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { summarizeFeedingMeasurements } from '../src/services/feeding-analysis.service.js';

const at = (minutes) => new Date(Date.UTC(2026, 0, 1, 0, minutes)).toISOString();
const feeding = { id: 'f1', kind: 'feeding', starter_id: 's1', occurred_at: at(0), input: {} };
const link = { starter_id: 's1', device_id: 'd1', active_from: at(-10), active_to: null };
const row = (minutes, height, extra = {}) => ({ device_id: 'd1', recorded_at: at(minutes), mode: 'fer', sensor_error: false, height_mm: height, temperature_c: 26, ...extra });
const normal = [row(5, 100), row(15, 101), row(25, 99), row(35, 100), row(45, 102), row(70, 150)];
const summarize = (measurements = normal, options = {}) => summarizeFeedingMeasurements({ feeding, link, now: Date.parse(at(100)), measurements, ...options });
let result = summarize();
assert.equal(result.baselineSampleCount, 5);
assert.equal(result.baselineUsedCount, 5, '收满五个点并复核离群值');
assert.equal(result.baselineExcludedCount, 0);
assert.equal(result.baselineHeightMm, 100.4);
assert.equal(result.expansionPercent > 49, true);
assert.equal(result.height, 'slight');
assert.equal(result.temperatureCount, 6);
assert.equal(result.tempC, 26);
assert.equal(result.elapsedHours, 100 / 60);
assert.equal(result.heightStale, false);
assert.equal(result.temperatureStale, false);

result = summarize([...normal, row(46, 500), row(47, 1)]);
assert.equal(result.baselineHeightMm, 100.4, '基线冻结后不再受后段读数影响');
assert.equal(result.baselineUsedCount, 5);
assert.equal(summarize([...normal, row(46, 500), row(47, 1), row(48, 700)]).baselineHeightMm, 100.4);
assert.equal(summarize([row(5, 100), row(10, 100), row(15, 100), row(20, 100), row(25, 200), row(30, 300)]).baselineHeightMm, 100, '最多只扫描前五个点并剔除离群值');

result = summarize([row(5, 100), row(15, 101), row(19, 99)], { now: Date.parse(at(20)) });
assert.equal(result.baselinePending, false, '首个有效高度出现即可用，不再等固定时长');
assert.equal(result.baselineHeightMm, 100);
assert.equal(result.currentHeightMm, 99, '当前高度直接取最近一次有效读数');
assert.equal(result.height, 'none', '首个点即 0%，之后随基线更新显示实测涨幅');
assert.equal(summarize(normal, { now: Date.parse(at(50)) }).baselinePending, false);

result = summarize(normal, { nextFeedingAt: at(40) });
assert.equal(result.measurementCount, 4);
assert.equal(result.latestMeasurementAt, at(35));
assert.equal(result.elapsedHours, 40 / 60);
assert.equal(result.baselineIncomplete, false);
assert.equal(result.baselineHeightMm, 100);
result = summarize([row(5, 100), row(15, 110)], { nextFeedingAt: at(20) });
assert.equal(result.baselineHeightMm, 100, '不足三个有效点时退回前五个点的最低点');
assert.equal(result.baselineSource, 'sensor-min');
assert.equal(result.baselineIncomplete, true);
// 关联晚于喂养时刻开始（重绑后继续的同一轮）：窗口内的读数照常计入，不再因 active_from > fedAt 被整体丢弃；
// 但迟到超过 40 分钟时起始基线不再代表真实起点，必须标记为不完整。
assert.equal(summarize(normal, { link: { ...link, active_from: at(10) } }).measurementCount, 5, 'rows inside a later-starting window are kept');
assert.equal(summarize(normal, { link: { ...link, active_from: at(10) } }).coverageStartsLate, false, 'ten minutes late is still a trustworthy baseline');
result = summarize(normal, { link: { ...link, active_from: at(50) } });
assert.equal(result.measurementCount, 1, 'only the row after the window opens counts');
assert.equal(result.coverageStartsLate, true);
assert.equal(result.baselineIncomplete, true, 'a late first window makes the automatic baseline provisional');
assert.notEqual(result.dataQuality, 'complete');
assert.equal(summarize(normal, { link: { ...link, active_from: at(200) } }).measurementCount, 0, 'a window opening after the round ends contributes nothing');
assert.equal(summarize(normal, { link: { ...link, starter_id: 's2' } }).measurementCount, 0);
assert.equal(summarize(normal, { link: { ...link, active_to: at(25) } }).measurementCount, 2, 'association end is exclusive');
assert.equal(summarize([row(-1, 100), row(121, 100), row(10, 100, { device_id: 'd2' })]).measurementCount, 0);

// ---- 全部历史窗口：换绑 / 解绑 / 重绑后，同一酵种的多段窗口取并集，且互不混入 ----
{
  const closedFirst = { ...link, active_from: at(-10), active_to: at(30) };
  const reopened = { ...link, active_from: at(60), active_to: null };
  const across = summarize(normal, { link: undefined, links: [closedFirst, reopened] });
  // 5/15/25 在第一段，70 在重绑后的第二段；35/45 落在空窗期，归属不明，不计入。
  assert.equal(across.measurementCount, 4, 'rows from both windows of the same starter/device are included');
  assert.deepEqual([across.latestMeasurementAt], [at(70)]);
  assert.equal(across.linkedWindowCount, 2);
  assert.equal(across.coverageGapMs, 30 * 60000, 'the unbound gap is reported, not silently filled');
  assert.equal(across.coverageBroken, false, 'a 30 minute gap is within the sampling tolerance');
  // 另一台设备、别的酵种占用的时段都不会混入。
  const mixed = summarize([...normal, row(40, 777, { device_id: 'd2' })], { link: undefined, links: [closedFirst, reopened, { ...link, device_id: 'd2', starter_id: 's2', active_from: at(30), active_to: at(60) }] });
  assert.equal(mixed.measurementCount, 4, 'another starter window on another device does not contribute');
  // 同一酵种换到另一台设备再换回来：两台设备的窗口按各自设备过滤。
  const swapped = summarize([...normal, row(40, 300, { device_id: 'd2' }), row(50, 301, { device_id: 'd2' }), row(55, 999, { device_id: 'd1' })], {
    link: undefined, links: [closedFirst, { ...link, device_id: 'd2', active_from: at(30), active_to: at(60) }, reopened]
  });
  assert.equal(swapped.measurementCount, 4 + 2, 'rows from d2 count only inside the d2 window; d1 row inside the d2 window is rejected');
  assert.equal(swapped.coverageGapMs, 0, 'contiguous windows across devices leave no gap');
  // 长空窗期会把数据质量降级，而不是假装完整。
  const longGap = summarize(normal, { link: undefined, links: [{ ...link, active_from: at(-10), active_to: at(10) }, { ...link, active_from: at(65), active_to: null }] });
  assert.equal(longGap.coverageBroken, true);
  assert.notEqual(longGap.dataQuality, 'complete');
  // 别的酵种的窗口即使被一起传入也只按本酵种过滤。
  assert.equal(summarize(normal, { link: undefined, links: [{ ...link, starter_id: 's2' }] }).measurementCount, 0);
}

result = summarize([row(5, 0), row(10, ''), row(15, null), row(20, 100, { sensor_error: true }), row(22, 100, { mode: 'sleep' }), row(25, 100), row(35, 101)]);
assert.equal(result.heightCount, 2);
assert.equal(result.baselineHeightMm, null);
assert.equal(result.expansionPercent, null);
assert.equal(result.height, '');
assert.equal(summarize([row(5, 100), row(10, 100), row(15, 500)]).baselineHeightMm, 700 / 3, '收满五个点前不做离群值判定');
assert.equal(summarize([row(5, 100), row(10, 100), row(15, 500), row(20, 100), row(25, 100)]).baselineHeightMm, 100, '收满五个点后剔除离群值');
assert.equal(summarize([]).tempC, null);
assert.equal(summarize([row(5, 100, { temperature_c: '' }), row(15, 100, { temperature_c: null }), row(25, 100, { temperature_c: 0 })], { now: Date.parse(at(60)) }).tempC, 0, 'empty temperatures are missing, measured zero is valid');
assert.equal(summarize(normal, { feeding: { ...feeding, input: { baseline_source: 'manual', baseline_height_mm: 50 } } }).baselineHeightMm, 50);
assert.equal(summarize([], { feeding: { ...feeding, input: { baseline_source: 'device', baseline_height_mm: 50 } } }).baselineHeightMm, null, 'legacy single device baseline is not reused');
for (const [mm, expected] of [[100, 'none'], [125, 'slight'], [180, 'near'], [200, 'double'], [310, 'over3']]) {
  assert.equal(summarize([row(5, 100), row(15, 100), row(25, 100), row(35, 100), row(45, 100), row(70, mm)]).height, expected);
}

assert.equal(summarize([row(5, 100), row(15, 101)], { now: Date.parse(at(20)) }).baselineStatus, 'established', '首个有效点即建立基线');
assert.equal(summarize([row(5, 100), row(15, 101)], { now: Date.parse(at(60)) }).baselineStatus, 'established');
assert.equal(summarize([row(5, 100), row(15, 101)], { now: Date.parse(at(20)) }).dataQuality, 'partial');
assert.equal(summarize([row(5, 100, { sensor_error: true })], { now: Date.parse(at(10)) }).baselineStatus, 'pending');
assert.equal(summarize([row(5, 100, { sensor_error: true })], { now: Date.parse(at(10)) }).heightCount, 0);
assert.equal(summarize().baselineStatus, 'established');
assert.equal(summarize().dataQuality, 'complete');
assert.equal(summarize([]).dataQuality, 'insufficient');

// 自动结束：last-peak 触发后连续两小时无数据。
{
  const flat = [5, 15, 25, 35, 45].map((m) => row(m, 100));
  const peaked = [...flat, row(55, 150), row(65, 190), row(75, 210), row(85, 230), row(95, 225), row(105, 220)];
  const at2 = (m, extra = {}) => summarize(peaked, { now: Date.parse(at(m)), ...extra });
  assert.equal(at2(105).risePhase, 'peak');
  assert.equal(at2(105 + 119).windowClosed, false, '无数据不满两小时仍在进行中');
  let auto = at2(105 + 121);
  assert.equal(auto.windowClosed, true);
  assert.equal(auto.windowEndReason, 'auto');
  assert.equal(auto.windowClosedAt, new Date(Date.parse(at(105)) + 1).toISOString());
  assert.equal(auto.measurementCount, 11, '最后一条读数仍计入本轮');
  assert.equal(auto.currentHeightMm, 220);
  assert.equal(auto.peakHeightMm, 230);
  // 未触发 last-peak（仍在 pre-peak）时，断档不会自动结束。
  const prePeak = [...flat, row(55, 150), row(65, 190), row(75, 210), row(85, 230)];
  assert.equal(summarize(prePeak, { now: Date.parse(at(85 + 300)) }).windowClosed, false);
  // 峰值后数据中断两小时再恢复：在断档起点结束，之后的读数不计入。
  auto = summarize([...peaked, row(105 + 150, 200)], { now: Date.parse(at(105 + 200)) });
  assert.equal(auto.windowEndReason, 'auto');
  assert.equal(auto.measurementCount, 11);
  // 人工结束 / 下一次喂养保持各自的结束原因；末尾断档不改写它们。
  assert.equal(at2(105 + 300, { windowEndedAt: at(105 + 200) }).windowEndReason, 'manual');
  assert.equal(at2(105 + 300, { nextFeedingAt: at(105 + 200) }).windowEndReason, 'next_feeding');
  assert.equal(at2(105 + 300, { windowEndedAt: at(106) }).windowEndReason, 'manual');
  // 已归档的自动结束（closure.reason = 'auto'）：读取后仍是自动结束，手动归档保持手动。
  const archivedAt = new Date(Date.parse(at(105)) + 1).toISOString();
  assert.equal(at2(105 + 300, { windowEndedAt: archivedAt, windowEndedReason: 'auto' }).windowEndReason, 'auto');
  assert.equal(at2(105 + 300, { windowEndedAt: archivedAt, windowEndedReason: 'manual' }).windowEndReason, 'manual');
  assert.equal(at2(105 + 300, { windowEndedAt: archivedAt }).windowEndReason, 'manual');

  const migration = await readFile(new URL('../supabase/migrations/030_auto_window_closure.sql', import.meta.url), 'utf8');
  assert.match(migration, /check \(reason in \('manual', 'auto'\)\)/);
  assert.match(migration, /function public\.auto_close_fermentation_window/);
  assert.match(migration, /'auto', null/, '自动结束写入 reason = auto');
  assert.match(migration, /interval '2 hours'/, '服务端校验缺口至少两小时');
  assert.match(migration, /on conflict \(user_id, feeding_id\) do nothing/, '一轮只有一条结束事实');
}

// 手动结束只影响业务边界；设备断线只缩短可观测范围。
result = summarize(normal, { now: Date.parse(at(300)), nextFeedingAt: at(200), windowEndedAt: at(60) });
assert.equal(result.windowStatus, 'closed');
assert.equal(result.windowEndReason, 'manual');
assert.equal(result.windowClosedAt, at(60));
assert.equal(result.windowTo, at(60));
assert.equal(result.measurementCount, 5, '手动结束后的测量不再进入本轮');
result = summarize(normal, { now: Date.parse(at(300)), nextFeedingAt: at(80), windowEndedAt: at(120) });
assert.equal(result.windowEndReason, 'next_feeding', '下一次喂养早于手动结束时以下一次喂养为准');
assert.equal(result.windowClosedAt, at(80));
result = summarize(normal, { now: Date.parse(at(100)), windowEndedAt: at(150) });
assert.equal(result.windowTo, at(100), '手动结束时间不会越过当前时间');
result = summarize(normal, { now: Date.parse(at(100)), link: { ...link, active_to: at(50) } });
assert.equal(result.windowStatus, 'in_progress', '设备断线不结束发酵窗口');
assert.equal(result.windowActive, true);
assert.equal(result.windowTo, at(50), '设备断线只缩短可观测终点');
assert.equal(result.dataQuality, 'stale');

result = summarize(normal, { now: Date.parse(at(120)) });
assert.equal(result.staleEvidence, true);
assert.equal(result.heightStale, true);
assert.equal(result.temperatureStale, true);
assert.equal(result.currentHeightMm, 150, '缺测时沿用上一个点的膨胀倍数');
assert.equal(result.expansionPercent > 49, true);
assert.equal(result.height, 'slight');
assert.equal(result.tempC, null);
assert.equal(result.meanTempC, 26);
assert.equal(result.latestMeasurementAt, at(70));
assert.equal(result.latestTemperatureAt, at(70));
assert.equal(summarize(normal, { now: Date.parse(at(110)) }).heightStale, false, '40 分钟边界仍可用');
assert.equal(summarize(normal, { now: Date.parse(at(110)) + 1 }).tempC, null);
result = summarize(normal, { now: Date.parse(at(300)), nextFeedingAt: at(80) });
assert.equal(result.historicalRound, true);
assert.equal(result.staleEvidence, false);
assert.equal(result.currentHeightMm, 150);
assert.equal(result.elapsedHours, 80 / 60);
assert.equal(result.windowTo, at(80));
assert.equal(result.tempC, 26);
assert.equal(summarize(normal, { nextFeedingAt: at(200), now: Date.parse(at(120)) }).heightStale, true, '未来喂养不能绕过实时新鲜度');
result = summarize([...normal, row(95, 160, { temperature_c: null })], { now: Date.parse(at(120)) });
assert.equal(result.heightStale, false);
assert.equal(result.tempC, null, '新高度不能让旧温度恢复新鲜');
result = summarize([row(5, 100), row(95, 150)]);
assert.equal(result.temperatureCoverageReliable, false);
assert.equal(result.tempC, null, '中间缺口过大时均温不参与估时');
assert.equal(result.meanTempC, 26);
assert.equal(summarize([row(95, 150)]).tempC, null, '缺少轮次开始覆盖时不参与估时');
assert.equal(summarize([row(70, 150, { mode: undefined }), row(75, 160, { mode: null })]).measurementCount, 0);

// 不依赖云端凭据或网络，验证加载器边界。
const source = await readFile(new URL('../src/services/feeding-analysis.service.js', import.meta.url), 'utf8');
// data URL 无法解析相对 import，把区间模块的真实源码内联进来，避免复制一份判断逻辑。
const bandSource = (await readFile(new URL('../src/lib/height-band.js', import.meta.url), 'utf8'))
  .replace(/export const /g, 'const ').replace(/export function /g, 'function ');
let rawCalls = [];
let queriedLinks = [link];
let selectedFeeding = feeding;
globalThis.__feedingEvidenceMocks = {
  care: {
    async getCareRecord(id, options) { assert.equal(options.userId, 'owner'); return selectedFeeding; },
    async listCareRecords(options) {
      assert.equal(options.userId, 'owner');
      return globalThis.__allFeedings || [feeding, { ...feeding, id: 'f2', occurred_at: at(80) }];
    },
  },
  links: { async listStarterDeviceLinks() { return queriedLinks; } },
  device: {
    async listMeasurementsRange(deviceId, options) {
      rawCalls.push({ deviceId, ...options });
      if (globalThis.__deviceReadError) throw globalThis.__deviceReadError;
      const lo = Date.parse(options.from); const hi = Date.parse(options.to);
      return [...normal, row(90, 900)].map((item) => ({ ...item, device_id: deviceId })).filter((item) => Date.parse(item.recorded_at) >= lo && Date.parse(item.recorded_at) <= hi);
    }
  },
  window: {
    async loadWindowClosure(userId, feedingId) {
      assert.equal(userId, 'owner');
      assert.equal(feedingId, 'f1');
      if (globalThis.__windowClosureFails) throw new Error('closure down');
      return globalThis.__windowClosure || null;
    }
  },
};
const mockSource = (bandSource + source.replace("import { heightBand } from '../lib/height-band.js';", '')
  .replace("'../lib/rise-phase.js'", JSON.stringify(new URL('../src/lib/rise-phase.js', import.meta.url).href))
  .replace("'../lib/starter-link-windows.js'", JSON.stringify(new URL('../src/lib/starter-link-windows.js', import.meta.url).href))
  .replace("'../lib/round-device-attribution.js'", JSON.stringify(new URL('../src/lib/round-device-attribution.js', import.meta.url).href))
  .replace("'../lib/round-device-attribution.js'", JSON.stringify(new URL('../src/lib/round-device-attribution.js', import.meta.url).href))
  .replace("'../lib/read-errors.js'", JSON.stringify(new URL('../src/lib/read-errors.js', import.meta.url).href)))
  .replace("import('./care.service.js')", 'Promise.resolve(globalThis.__feedingEvidenceMocks.care)')
  .replace("import('./starter-device.service.js')", 'Promise.resolve(globalThis.__feedingEvidenceMocks.links)')
  .replace("import('./device.service.js')", 'Promise.resolve(globalThis.__feedingEvidenceMocks.device)')
  .replace("import('./fermentation-window.service.js')", 'Promise.resolve(globalThis.__feedingEvidenceMocks.window)');
const { loadFeedingEvidence } = await import(`data:text/javascript;base64,${Buffer.from(mockSource).toString('base64')}`);
let evidence = await loadFeedingEvidence('owner', 's1', 'f1');
assert.equal(rawCalls.length, 1);
assert.equal(rawCalls[0].bucketed, false);
assert.equal(rawCalls[0].from, at(0));
assert.equal(rawCalls[0].to, new Date(Date.parse(at(80)) - 1).toISOString());
assert.equal(evidence.summary.currentHeightMm, 150, 'loader summary rejects readings from next round');
globalThis.__windowClosure = { ended_at: at(60), reason: 'manual', detail: 'fallen' };
evidence = await loadFeedingEvidence('owner', 's1', 'f1');
assert.equal(evidence.closure.detail, 'fallen', 'manual closure is returned with the evidence');
assert.equal(evidence.summary.windowEndReason, 'manual');
assert.equal(evidence.summary.windowClosedAt, at(60), 'manual closure ends the round before the next feeding');
delete globalThis.__windowClosure;
globalThis.__windowClosureFails = true;
evidence = await loadFeedingEvidence('owner', 's1', 'f1');
assert.equal(evidence.closure, null, 'closure read failure does not block evidence');
assert.equal(evidence.summary.windowEndReason, 'next_feeding');
globalThis.__windowClosureFails = false;
rawCalls = [];
queriedLinks = [{ ...link, active_to: at(100) }, { ...link, device_id: 'new', active_from: at(100) }];
evidence = await loadFeedingEvidence('owner', 's1', 'f1');
assert.equal(rawCalls.length, 1, 'a closed association still reads its own historical window');
assert.equal(rawCalls[0].deviceId, 'd1');
assert.equal(rawCalls[0].starterId, 's1', 'reads are scoped to the starter so the RPC fallback only returns its own windows');
assert.equal(evidence.unavailableReason, '', 'a closed window is verifiable history, not an unavailable one');
assert.equal(evidence.summary.currentHeightMm, 150);
assert.equal(evidence.summary.dataQuality, 'complete');
// 轮次跨越换绑：d1 关闭，随后同一酵种改绑 d2，再绑回 d1。每段窗口各读一次，只读它自己的时段。
rawCalls = [];
queriedLinks = [
  { ...link, active_from: at(-10), active_to: at(30) },
  { ...link, device_id: 'd2', active_from: at(30), active_to: at(60) },
  { ...link, active_from: at(60), active_to: null },
  { ...link, starter_id: 's2', device_id: 'd3', active_from: at(-100), active_to: null }
];
evidence = await loadFeedingEvidence('owner', 's1', 'f1');
assert.deepEqual(rawCalls.map((call) => [call.deviceId, call.from, call.to]), [
  ['d1', at(0), new Date(Date.parse(at(30)) - 1).toISOString()],
  ['d2', at(30), new Date(Date.parse(at(60)) - 1).toISOString()],
  ['d1', at(60), new Date(Date.parse(at(80)) - 1).toISOString()]
], 'one read per historical window, clipped to the round; other starters devices are never read');
assert.ok(evidence.measurements.every((item) => item.device_id), 'rows are tagged with the device they were read from');
assert.equal(evidence.summary.linkedWindowCount, 3);
assert.equal(evidence.summary.coverageGapMs, 0);
assert.ok(evidence.summary.measurementCount > 0);
// 关联在轮次之后才开始：不读取旧轮次的读数。
rawCalls = [];
queriedLinks = [{ ...link, active_from: at(100) }];
evidence = await loadFeedingEvidence('owner', 's1', 'f1');
assert.equal(rawCalls.length, 0, 'an association that starts after the round never supplies its readings');
assert.equal(evidence.summary.baselineHeightMm, null);
assert.match(evidence.unavailableReason, /没有可核实的设备归属/);
// 读取失败再降级：无权限给出明确原因，登录过期抛出（让页面引导重新登录），空数据不是错误。
queriedLinks = [{ ...link, active_to: at(100) }];
globalThis.__deviceReadError = Object.assign(new Error('permission denied for table device_measurements'), { code: '42501' });
evidence = await loadFeedingEvidence('owner', 's1', 'f1');
assert.match(evidence.unavailableReason, /不是这台设备的成员/);
assert.deepEqual(evidence.measurements, []);
globalThis.__deviceReadError = Object.assign(new Error('JWT expired'), { code: 'PGRST301' });
await assert.rejects(loadFeedingEvidence('owner', 's1', 'f1'), /登录已过期/);
globalThis.__deviceReadError = new Error('network down');
await assert.rejects(loadFeedingEvidence('owner', 's1', 'f1'), /network down/);
delete globalThis.__deviceReadError;
queriedLinks = [link];
globalThis.__feedingEvidenceMocks.device.listMeasurementsRange = async () => Array(40000).fill(row(70, 150));
await assert.rejects(loadFeedingEvidence('owner', 's1', 'f1'), /40000.*缩短/);
selectedFeeding = { ...feeding, starter_id: 's2' };
await assert.rejects(loadFeedingEvidence('owner', 's1', 'f1'), /不匹配/);
delete globalThis.__feedingEvidenceMocks;
console.log('feeding analysis: running baseline, fallback, period isolation, missing evidence and loader boundaries OK');
