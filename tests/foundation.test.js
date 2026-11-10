#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computed, ref, watch } from 'vue';
import { CHART_RELEASE_MS, chartSegments, moveSampleIndex, nearestSampleIndex } from '../src/lib/chart-selection.js';
import { concreteColor, readConcreteColor } from '../src/lib/chart-color.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const device = source('src/services/device.service.js');
assert.match(device, /new Date\(a\.recorded_at\) - new Date\(b\.recorded_at\)/);
const { pickLatestPerBucket } = await import(`data:text/javascript;base64,${Buffer.from(device.replace(/^import[^\n]+\n/gm, '').replace(/^/, 'const hasSupabaseConfig = false; const supabase = null; const fetchLinkedMeasurements = null; const classifyReadError = () => "other"; const incompleteReadError = () => new Error(); const isMissingSchema = () => false; const isPermissionDenied = () => false; const readErrorMessage = () => "";\n')).toString('base64')}`);
const rows = [{ recorded_at: '2026-01-01T00:01:00Z' }, { recorded_at: '2026-01-01T00:09:00Z' }, { recorded_at: '2026-01-01T00:11:00Z' }];
assert.deepEqual(pickLatestPerBucket(rows, 'asc'), [rows[1], rows[2]]);
assert.deepEqual(pickLatestPerBucket(rows, 'desc'), [rows[2], rows[1]]);
assert.match(source('src/composables/useAuth.js'), /onAuthStateChange\(\(_event, nextSession\)/);
assert.doesNotMatch(source('src/composables/useAuth.js'), /onAuthStateChange\(async/);
assert.match(source('src/views/DoctorView.vue'), /elapsedEnabled\.value \? form\.elapsedHours : null/);
assert.match(source('src/views/HistoryView.vue'), /value == null \|\| value === ''\) return NaN/);
const chart = source('src/components/SeriesChart.vue');
assert.match(chart, /tSpan/);
assert.doesNotMatch(chart, /smoothPath| C\$\{/);
for (const [name, sql] of [['018_feed_events.sql', source('supabase/migrations/018_feed_events.sql')], ['019_starter_device_links.sql', source('supabase/migrations/019_starter_device_links.sql')]]) {
  assert.match(sql, /enable row level security/i, `${name} must enable RLS`);
}
const feed = source('supabase/migrations/018_feed_events.sql');
assert.match(feed, /care_record_id uuid not null unique/i);
assert.match(feed, /after insert on public\.care_records/i);
assert.match(feed, /on conflict \(care_record_id\) do nothing/i);
const links = source('supabase/migrations/019_starter_device_links.sql');
assert.match(links, /where active_to is null/i);
assert.match(links, /device_members where device_id = p_device_id and user_id = v_user_id/i);
assert.match(links, /pg_advisory_xact_lock/i);
const service = source('src/services/starter-device.service.js');
for (const fn of ['getStarterDeviceLink', 'listStarterDeviceLinks', 'linkStarterDevice']) assert.match(service, new RegExp(`export async function ${fn}\\(`));
assert.match(service, /local_only: true/);
assert.match(service, /active_from/);
const chartScript = chart.split('<script setup>')[1].split('</script>')[0].replace(/^import[^\n]+\n/gm, '').replace("const emit = defineEmits(['select']);", 'const emit = () => {};');
const renderChartRaw = new Function('defineProps', 'computed', 'ref', 'watch', 'useId', 'onBeforeUnmount', 'onMounted', 'nextTick', 'concreteColor', 'readConcreteColor', 'CHART_RELEASE_MS', 'chartSegments', 'moveSampleIndex', 'nearestSampleIndex', `${chartScript}; return { coords, segments, linePaths, areaPaths, dots, hoverIdx, hoverPoint, stats, baselineY };`);
const renderChart = (defineProps) => renderChartRaw(defineProps, computed, ref, watch, () => 'test', () => {}, () => {}, (fn) => fn(), concreteColor, readConcreteColor, CHART_RELEASE_MS, chartSegments, moveSampleIndex, nearestSampleIndex);
const chartGeometry = (label, unit, values, baseline = null) => renderChart(() => ({ label, unit, points: values.map((v, index) => ({ t: `2026-01-01T00:${String(index * 10).padStart(2, '0')}:00Z`, v })), baseline }), computed, ref, watch, () => 'test');
const points = [
  { t: '2026-01-01T00:00:00Z', v: 1 },
  { t: '2026-01-01T00:10:00Z', v: 2 },
  { t: '2026-01-01T00:20:00Z', v: null },
  { t: '2026-01-01T00:30:00Z', v: 4 },
  { t: '2026-01-01T01:30:00Z', v: 5 },
  { t: '2026-01-01T01:40:00Z', v: 6, sensor_error: true },
  { t: '2026-01-01T01:50:00Z', v: 7 }
];
const geometry = renderChart(() => ({ points }), computed, ref, watch, () => 'test');
assert.equal(geometry.coords.value[1].x, 13.18, 'x must follow real timestamps');
assert.equal(geometry.linePaths.value.length, 2, '空值和超过 30 分钟的空档都会断开，单点不成折线');
assert.equal(geometry.linePaths.value.join('').match(/M/g).length, 2, '每段曲线各自从 M 起笔');
assert.equal(geometry.linePaths.value.join('').match(/L/g).length, 3, '空值两侧不再连线');
assert.equal(geometry.areaPaths.value.length, 2, '面积跟随曲线分段闭合');
assert.equal(geometry.coords.value.length, 6, 'sensor_error 行只要有有效值仍须保留采样点');
assert.equal(geometry.dots.value.length, 2, '空值断开后的孤立点和末点都要单独补点');
geometry.hoverIdx.value = 0;
assert.ok(geometry.hoverPoint.value, '悬停应命中最近的采样点');
assert.equal(geometry.dots.value.length, 2, '悬停时孤立点不得消失');
geometry.hoverIdx.value = null;
assert.equal(geometry.stats.value.dataMax, 7, 'max 文案取数据极值');
assert.doesNotMatch(geometry.linePaths.value.join(''), /C/, 'no Bezier interpolation');
const shortGap = renderChart(() => ({ points: [
  { t: '2026-01-01T00:00:00Z', v: 1 },
  { t: '2026-01-01T00:05:00Z', v: 2 },
  { t: '2026-01-01T00:30:00Z', v: 3 },
  { t: '2026-01-01T00:35:00Z', v: 4 }
] }), computed, ref, watch, () => 'test');
assert.equal(shortGap.linePaths.value.length, 1, '短空白不得断开，直接线性连接');
const isolated = renderChart(() => ({ points: [
  { t: '2026-01-01T00:00:00Z', v: 1 },
  { t: '2026-01-01T02:00:00Z', v: 2 },
  { t: '2026-01-01T02:10:00Z', v: 3 }
] }), computed, ref, watch, () => 'test');
assert.equal(isolated.segments.value.length, 2, '长空档两侧各自成段');
assert.equal(isolated.dots.value.length, 2, '孤立单点必须单独补点，不能消失');
const dense = renderChart(() => ({ points: [
  { t: '2026-01-01T00:00:00Z', v: 1 },
  { t: '2026-01-01T00:10:00Z', v: 2 },
  { t: '2026-01-01T00:20:00Z', v: 3 }
] }), computed, ref, watch, () => 'test');
assert.equal(dense.linePaths.value.length, 1, '连续采样保持单段');
const withBaseline = renderChart(() => ({ points, baseline: 100 }), computed, ref, watch, () => 'test');
assert.equal(withBaseline.stats.value.max, 100, '基线参与绘图范围');
assert.equal(withBaseline.stats.value.dataMax, 7, '基线不得顶掉 max 文案');
const lowHeight = chartGeometry('高度', ' mm', [2, 4]);
assert.equal(lowHeight.stats.value.min, 0, '高度纵轴不能小于零');
assert.equal(lowHeight.stats.value.max, 30, '高度最小纵轴跨度为 30 mm');
const nearCeilingHumidity = chartGeometry('湿度', '%', [96, 98]);
assert.equal(nearCeilingHumidity.stats.value.min, 80, '湿度靠近上限时向下扩展');
assert.equal(nearCeilingHumidity.stats.value.max, 100, '湿度纵轴不能超过 100%');
const lowHumidity = chartGeometry('湿度', '%', [1, 3]);
assert.equal(lowHumidity.stats.value.min, 0, '湿度纵轴不能小于 0%');
assert.equal(lowHumidity.stats.value.max, 20, '湿度最小纵轴跨度为 20%');
const narrowTemperature = chartGeometry('温度', '°C', [23, 25]);
assert.equal(narrowTemperature.stats.value.max - narrowTemperature.stats.value.min, 20, '温度最小纵轴跨度为 20°C');
const wideHeight = chartGeometry('高度', ' mm', [10, 50]);
assert.deepEqual([wideHeight.stats.value.min, wideHeight.stats.value.max], [10, 50], '已有足够跨度的数据不改变纵轴范围');
assert.deepEqual([lowHeight.stats.value.dataMin, lowHeight.stats.value.dataMax], [2, 4], '纵轴扩展不改变真实数据极值');
assert.equal(withBaseline.baselineY.value, 6, '基线贴顶时应落在顶部内边距');
const duplicated = renderChart(() => ({ points: [
  { t: '2026-01-01T00:00:00Z', v: 3 },
  { t: '2026-01-01T00:00:00Z', v: 9 },
  { t: '2026-01-01T00:10:00Z', v: 4 }
] }), computed, ref, watch, () => 'test');
assert.equal(duplicated.coords.value.length, 2, '同一时间戳只保留一条采样');
assert.equal(duplicated.coords.value[0].v, 9, '同一时间戳保留最后一条读数');
assert.equal(new Set(duplicated.coords.value.map((p) => p.x)).size, 2, 'x 不允许重复，避免竖直尖峰');

const userId = '11111111-1111-4111-8111-111111111111';
const starterId = '22222222-2222-4222-8222-222222222222';
const otherStarterId = '33333333-3333-4333-8333-333333333333';
const storage = {};
globalThis.localStorage = {
  getItem: (key) => storage[key] || null,
  setItem(key, value) { storage[key] = value; Object.defineProperty(this, key, { enumerable: true, configurable: true, value }); }
};
globalThis.__starterTestClient = {
  auth: { getUser: async () => ({ data: { user: { id: userId } } }) },
  from(table) {
    const query = { select() { return this; }, eq() { return this; }, single: async () => ({ data: { id: starterId } }),
      order: async () => ({ error: table === 'starter_device_links' ? { code: 'PGRST205' } : null }) };
    return query;
  },
  rpc: async () => ({ error: { code: 'PGRST202' } })
};
// data URL 中无法解析相对导入，这里替换掉全部 import 并注入测试替身。
const starterSource = `const hasSupabaseConfig = true; const supabase = globalThis.__starterTestClient;
const READ_TTL = { links: 0 };
const LOCAL_LINK_NOTICE = '本地回退';
const cachedRead = (key, loader) => loader();
const invalidateReadCache = () => {};
const readCacheKey = (parts) => parts.join(':');
${service.replace(/^import[^\n]+\n/gm, '')}`;
const starterModule = await import(`data:text/javascript;base64,${Buffer.from(starterSource).toString('base64')}`);
assert.equal(await starterModule.getStarterDeviceLink({ userId, starterId }), null);
const firstLink = await starterModule.linkStarterDevice({ userId, starterId, deviceId: 'device-a' });
assert.equal(firstLink.source, 'local');
assert.ok(firstLink.active_from);
await starterModule.linkStarterDevice({ userId, starterId, deviceId: 'device-b' });
const periods = await starterModule.listStarterDeviceLinks({ userId, starterId });
assert.equal(periods.length, 2);
assert.equal(periods[1].active_to, periods[0].active_from);
await starterModule.linkStarterDevice({ userId, starterId: otherStarterId, deviceId: 'device-b' });
assert.equal((await starterModule.getStarterDeviceLink({ userId, starterId })).device_id, 'device-b', 'a second starter can share the device without unlinking the first');
assert.equal((await starterModule.getStarterDeviceLink({ userId, starterId: otherStarterId })).device_id, 'device-b');
await assert.rejects(starterModule.getStarterDeviceLink({ userId: starterId, starterId }), /当前登录账号/);
await starterModule.linkStarterDevice({ userId, starterId: otherStarterId, deviceId: null });
assert.equal(await starterModule.getStarterDeviceLink({ userId, starterId: otherStarterId }), null);
delete globalThis.__starterTestClient;
delete globalThis.localStorage;
console.log('Foundation and migration contract tests passed.');
