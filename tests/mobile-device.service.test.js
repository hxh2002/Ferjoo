import assert from 'node:assert/strict';
import { bucketMeasurements, deviceStatus, metricGeometry, normalizeBindCode, validateRange } from '../src/services/mobile-device.service.js';

assert.equal(normalizeBindCode(' ab-cd 23! '), 'ABCD23');
assert.deepEqual(deviceStatus({ mode: 'fer', sensor_error: false, height_mm: 30 }), { label: '正常采集', tone: 'ok' });
assert.deepEqual(deviceStatus({ mode: 'fer', sensor_error: false }), { label: '指标缺测', tone: 'warn' });
assert.deepEqual(deviceStatus({ mode: 'sleep', sensor_error: false }), { label: '休眠', tone: 'idle' });
assert.deepEqual(deviceStatus({ mode: 'fer', sensor_error: true }), { label: '传感器故障', tone: 'bad' });
assert.equal(deviceStatus({ mode: 'boost', sensor_error: false }).label, '模式异常');
assert.equal(deviceStatus({}).label, '状态未知');
assert.match(validateRange('2026-01-01T00:00:00Z', '2026-01-01T00:05:00Z', Date.parse('2026-01-01T01:00:00Z')), /至少为十分钟/);
const rows = bucketMeasurements([
  { id: 1, recorded_at: '2026-01-01T00:00:00Z', height_mm: 10, mode: 'fer', sensor_error: false },
  { id: 2, recorded_at: '2026-01-01T00:10:00Z', height_mm: null, mode: 'fer', sensor_error: false },
  { id: 3, recorded_at: '2026-01-01T01:00:00Z', height_mm: 12, mode: 'fer', sensor_error: false },
  { id: 4, recorded_at: '2026-01-01T01:10:00Z', height_mm: 13, mode: 'sleep', sensor_error: false }
]);
assert.equal(rows[1].height_mm, null);
const geometry = metricGeometry(rows, 'height_mm', '2026-01-01T00:00:00Z', '2026-01-01T02:00:00Z');
assert.equal(geometry.segments.length, 2);
assert.equal(geometry.points.length, 4);
console.log('mobile device service tests passed');
