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
assert.equal(result.baselineUsedCount, 5, 'normal variance is not trimmed');
assert.equal(result.baselineHeightMm, 100.4);
assert.equal(result.expansionPercent > 49, true);
assert.equal(result.height, 'slight');
assert.equal(result.temperatureCount, 6);
assert.equal(result.tempC, 26);
assert.equal(result.elapsedHours, 100 / 60);
assert.equal(result.heightStale, false);
assert.equal(result.temperatureStale, false);

result = summarize([...normal, row(46, 500), row(47, 1)]);
assert.equal(result.baselineExcludedCount, 2);
assert.equal(result.baselineUsedCount, 5);
assert.equal(result.baselineHeightMm, 100.4);
assert.equal(summarize([...normal, row(46, 500), row(47, 1), row(48, 700)]).baselineExcludedCount, 2, 'never remove more than two');

result = summarize([row(5, 100), row(15, 101), row(19, 99)], { now: Date.parse(at(20)) });
assert.equal(result.baselinePending, true);
assert.equal(result.baselineHeightMm, 100);
assert.equal(result.height, '', 'do not compare early-window samples to their own baseline');
assert.equal(summarize(normal, { now: Date.parse(at(50)) }).baselinePending, false);

result = summarize(normal, { nextFeedingAt: at(40) });
assert.equal(result.measurementCount, 4);
assert.equal(result.latestMeasurementAt, null);
assert.equal(result.elapsedHours, 40 / 60);
assert.equal(result.baselineWindowTruncated, true);
assert.equal(summarize(normal, { link: { ...link, active_from: at(10) } }).measurementCount, 0);
assert.equal(summarize(normal, { link: { ...link, starter_id: 's2' } }).measurementCount, 0);
assert.equal(summarize(normal, { link: { ...link, active_to: at(25) } }).measurementCount, 2, 'association end is exclusive');
assert.equal(summarize([row(-1, 100), row(121, 100), row(10, 100, { device_id: 'd2' })]).measurementCount, 0);

result = summarize([row(5, 0), row(10, ''), row(15, null), row(20, 100, { sensor_error: true }), row(22, 100, { mode: 'sleep' }), row(25, 100), row(35, 101)]);
assert.equal(result.heightCount, 2);
assert.equal(result.baselineHeightMm, null);
assert.equal(result.expansionPercent, null);
assert.equal(result.height, '');
assert.equal(summarize([row(5, 100), row(10, 100), row(15, 500)]).baselineHeightMm, null, 'detect outlier but do not invent a third reliable sample');
assert.equal(summarize([]).tempC, null);
assert.equal(summarize([row(5, 100, { temperature_c: '' }), row(15, 100, { temperature_c: null }), row(25, 100, { temperature_c: 0 })], { now: Date.parse(at(60)) }).tempC, 0, 'empty temperatures are missing, measured zero is valid');
assert.equal(summarize(normal, { feeding: { ...feeding, input: { baseline_source: 'manual', baseline_height_mm: 50 } } }).baselineHeightMm, 50);
assert.equal(summarize([], { feeding: { ...feeding, input: { baseline_source: 'device', baseline_height_mm: 50 } } }).baselineHeightMm, null, 'legacy single device baseline is not reused');
for (const [mm, expected] of [[100, 'none'], [125, 'slight'], [180, 'near'], [200, 'double'], [310, 'over3']]) {
  assert.equal(summarize([row(5, 100), row(15, 100), row(25, 100), row(70, mm)]).height, expected);
}

result = summarize(normal, { now: Date.parse(at(120)) });
assert.equal(result.staleEvidence, true);
assert.equal(result.heightStale, true);
assert.equal(result.temperatureStale, true);
assert.equal(result.currentHeightMm, null);
assert.equal(result.expansionPercent, null);
assert.equal(result.height, '');
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
let rawCalls = [];
let queriedLinks = [link];
let selectedFeeding = feeding;
globalThis.__feedingEvidenceMocks = {
  care: {
    async getCareRecord(id, options) { assert.equal(options.userId, 'owner'); return selectedFeeding; },
    async listCareRecords(options) {
      assert.equal(options.userId, 'owner');
      assert.equal(options.starterId, 's1');
      assert.equal(options.from, feeding.occurred_at);
      return [feeding, { ...feeding, id: 'f2', occurred_at: at(80) }];
    },
  },
  links: { async listStarterDeviceLinks() { return queriedLinks; } },
  device: { async listMeasurementsRange(deviceId, options) { rawCalls.push({ deviceId, ...options }); return [...normal, row(90, 900)]; } },
};
const mockSource = source.replace("import('./care.service.js')", 'Promise.resolve(globalThis.__feedingEvidenceMocks.care)')
  .replace("import('./starter-device.service.js')", 'Promise.resolve(globalThis.__feedingEvidenceMocks.links)')
  .replace("import('./device.service.js')", 'Promise.resolve(globalThis.__feedingEvidenceMocks.device)');
const { loadFeedingEvidence } = await import(`data:text/javascript;base64,${Buffer.from(mockSource).toString('base64')}`);
let evidence = await loadFeedingEvidence('owner', 's1', 'f1');
assert.equal(rawCalls.length, 1);
assert.equal(rawCalls[0].bucketed, false);
assert.equal(rawCalls[0].from, at(0));
assert.equal(rawCalls[0].to, new Date(Date.parse(at(80)) - 1).toISOString());
assert.equal(evidence.summary.currentHeightMm, 150, 'loader summary rejects readings from next round');
rawCalls = [];
queriedLinks = [{ ...link, active_to: at(100) }, { ...link, device_id: 'new', active_from: at(100) }];
evidence = await loadFeedingEvidence('owner', 's1', 'f1');
assert.equal(rawCalls.length, 0, 'closed association does not read device data through present permissions');
assert.match(evidence.unavailableReason, /已经结束/);
queriedLinks = [{ ...link, active_from: at(100) }];
evidence = await loadFeedingEvidence('owner', 's1', 'f1');
assert.equal(rawCalls.length, 0, 'new association never supplies old feeding readings');
assert.equal(evidence.summary.baselineHeightMm, null);
queriedLinks = [link];
globalThis.__feedingEvidenceMocks.device.listMeasurementsRange = async () => Array(40000).fill(row(70, 150));
await assert.rejects(loadFeedingEvidence('owner', 's1', 'f1'), /40000.*缩短/);
selectedFeeding = { ...feeding, starter_id: 's2' };
await assert.rejects(loadFeedingEvidence('owner', 's1', 'f1'), /不匹配/);
delete globalThis.__feedingEvidenceMocks;
console.log('feeding analysis: values, outliers, pending window, period isolation, missing evidence and loader boundaries OK');
