import assert from 'node:assert/strict';
import { RISE_RULES, risePhase } from '../src/lib/rise-phase.js';
import { summarizeFeedingMeasurements } from '../src/services/feeding-analysis.service.js';

const minute = 60000;
const series = (values, step = 10) => values.map((v, index) => ({ t: index * step * minute, v }));
const phase = (values) => risePhase(series(values), 20).phase;
// 起点 20mm：2 倍即 40mm（界面膨胀倍数 2.00）。
const climb = [20, 25, 30, 35];

assert.deepEqual(risePhase([], 20), { phase: null, trendHeightMm: null, highHeightMm: null, peakHeightMm: null, peakAt: null });
assert.equal(risePhase(series([20]), null).phase, null, 'no baseline means no phase');
assert.equal(RISE_RULES.prePeakRatio, 2);

// 未到 2 倍：即使涨后明显回落也不判 Peak。
const weak = risePhase(series([...climb, 38, 39, 35, 30, 25]), 20);
assert.equal(weak.phase, 'rising');
assert.equal(weak.highHeightMm, 39);
assert.equal(weak.peakHeightMm, null);
assert.equal(phase([...climb, 39.9]), 'rising', 'just under 2x does not enter');
assert.equal(phase([...climb, 40]), 'pre-peak', 'exactly 2x enters pre-peak');

// 达到 2 倍且最近 n 点整体上升 → pre-peak。
assert.equal(phase([...climb, 42]), 'pre-peak');
// 达到 2 倍但最近 n 点没有净上涨，不进入 pre-peak。
assert.equal(risePhase(series([...climb, 42]), 20, { ...RISE_RULES, trendPoints: 6 }).phase, 'rising', 'needs n points of history');

// 单点回落不锁定；毫米以下的抖动不算回落。
assert.equal(phase([...climb, 42, 44, 43, 45]), 'pre-peak');
assert.equal(phase([...climb, 42, 44, 43, 43.8]), 'pre-peak');
assert.equal(phase([...climb, 42, 46, 45.9, 45.8]), 'pre-peak');

// 连续两点回落 → 锁定回落前的最高点为 last-peak。
const locked = risePhase(series([...climb, 42, 46, 45, 44]), 20);
assert.equal(locked.phase, 'peak');
assert.equal(locked.peakHeightMm, 46);
assert.equal(locked.peakAt, new Date(50 * minute).toISOString());
assert.equal(locked.trendHeightMm, 44, 'the liquid follows the latest raw height');

// 锁定后继续连续两点回落 → 退出 Peak，进入回落，峰值保留。
const fallen = risePhase(series([...climb, 42, 46, 45, 44, 42, 40]), 20);
assert.equal(fallen.phase, 'fallen');
assert.equal(fallen.peakHeightMm, 46);
// 锁定后小幅回升（未破峰值）打断回落计数，但不解除锁定。
assert.equal(phase([...climb, 42, 46, 45, 44, 45, 43]), 'peak');

// 反弹创新高 → 回到 pre-peak，峰值随后按新高重新锁定。
const rebound = risePhase(series([...climb, 42, 46, 45, 44, 42, 40, 43, 47]), 20);
assert.equal(rebound.phase, 'pre-peak');
assert.equal(rebound.peakHeightMm, null);
assert.equal(rebound.highHeightMm, 47);
assert.equal(risePhase(series([...climb, 42, 46, 45, 44, 42, 40, 43, 47, 46, 45]), 20).peakHeightMm, 47);

// 孤立的向上跳点不会被锁成峰值。
const spike = risePhase(series([...climb, 90, 42, 44, 46, 45, 44]), 20);
assert.equal(spike.phase, 'peak');
assert.equal(spike.peakHeightMm, 46);
assert.equal(spike.highHeightMm, 46);

// 摘要直接带出阶段与峰值；传感器异常与休眠点不参与判定。
const now = Date.parse('2026-11-09T12:00:00Z');
const at = (minutes) => new Date(now - minutes * minute).toISOString();
const feeding = { id: 'f', starter_id: 's', kind: 'feeding', occurred_at: at(300), input: {} };
const link = { starter_id: 's', device_id: 'd', active_from: at(400), active_to: null };
const heights = [20, 20, 20, 20, 20, 30, 40, 50, 42, 46, 45, 44, 42, 40];
const measurements = heights.map((height_mm, index) => ({ recorded_at: at(290 - index * 10), mode: 'fer', sensor_error: false, height_mm }));
measurements.splice(11, 0, { recorded_at: at(290 - 10.5 * 10), mode: 'fer', sensor_error: true, height_mm: 99 }, { recorded_at: at(290 - 10.6 * 10), mode: 'sleep', sensor_error: false, height_mm: 70 });
const summary = summarizeFeedingMeasurements({ measurements, feeding, link, now });
assert.equal(summary.baselineHeightMm, 20);
assert.equal(summary.risePhase, 'fallen');
assert.equal(summary.peakHeightMm, 46, 'the sensor-error 99mm reading never becomes the peak');
assert.equal(summary.highHeightMm, 46);
assert.equal(summary.trendHeightMm, 40);
assert.equal(summary.height, 'double', 'the diagnosis height band still comes from the raw current height only');
const offline = summarizeFeedingMeasurements({ measurements: measurements.map((row) => ({ ...row, sensor_error: true })), feeding, link, now });
assert.equal(offline.risePhase, null, 'sensor-error samples never drive the phase');

console.log('rise phase: 2x pre-peak, two-drop lock, continued-fall exit, rebound, spike and sensor-error exclusion passed');
