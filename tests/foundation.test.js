#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computed, ref, watch } from 'vue';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const device = source('src/services/device.service.js');
assert.match(device, /new Date\(a\.recorded_at\) - new Date\(b\.recorded_at\)/);
const { pickLatestPerBucket } = await import(`data:text/javascript;base64,${Buffer.from(device.replace(/^import[^\n]+\n/, 'const hasSupabaseConfig = false; const supabase = null;\n')).toString('base64')}`);
const rows = [{ recorded_at: '2026-01-01T00:01:00Z' }, { recorded_at: '2026-01-01T00:09:00Z' }, { recorded_at: '2026-01-01T00:11:00Z' }];
assert.deepEqual(pickLatestPerBucket(rows, 'asc'), [rows[1], rows[2]]);
assert.deepEqual(pickLatestPerBucket(rows, 'desc'), [rows[2], rows[1]]);
assert.match(source('src/composables/useAuth.js'), /onAuthStateChange\(\(_event, nextSession\)/);
assert.doesNotMatch(source('src/composables/useAuth.js'), /onAuthStateChange\(async/);
assert.match(source('src/views/DoctorView.vue'), /elapsedEnabled\.value \? form\.elapsedHours : null/);
assert.match(source('src/views/HistoryView.vue'), /value == null \|\| value === ''\) return NaN/);
const chart = source('src/components/SeriesChart.vue');
assert.match(chart, /tSpan/);
assert.match(chart, /40 \* 60 \* 1000/);
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
const chartScript = chart.split('<script setup>')[1].split('</script>')[0].replace(/^import[^\n]+\n/m, '');
const renderChart = new Function('defineProps', 'computed', 'ref', 'watch', 'useId', `${chartScript}; return { coords, segments, linePath, dots };`);
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
assert.deepEqual(geometry.segments.value.map((segment) => segment.length), [2, 1, 1, 1, 1]);
assert.equal(geometry.coords.value.length, 6, 'sensor_error 行只要有有效值仍须保留采样点');
assert.equal(geometry.dots.value.length, 4, '缺值断段后的孤立采样必须单独画点');
assert.doesNotMatch(geometry.linePath.value, /C/, 'no Bezier interpolation');

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
const starterModule = await import(`data:text/javascript;base64,${Buffer.from(service.replace(/^import[^\n]+\n/, 'const hasSupabaseConfig = true; const supabase = globalThis.__starterTestClient;\n')).toString('base64')}`);
assert.equal(await starterModule.getStarterDeviceLink({ userId, starterId }), null);
const firstLink = await starterModule.linkStarterDevice({ userId, starterId, deviceId: 'device-a' });
assert.equal(firstLink.source, 'local');
assert.ok(firstLink.active_from);
await starterModule.linkStarterDevice({ userId, starterId, deviceId: 'device-b' });
const periods = await starterModule.listStarterDeviceLinks({ userId, starterId });
assert.equal(periods.length, 2);
assert.equal(periods[1].active_to, periods[0].active_from);
await starterModule.linkStarterDevice({ userId, starterId: otherStarterId, deviceId: 'device-b' });
assert.equal(await starterModule.getStarterDeviceLink({ userId, starterId }), null);
await assert.rejects(starterModule.getStarterDeviceLink({ userId: starterId, starterId }), /当前登录账号/);
await starterModule.linkStarterDevice({ userId, starterId: otherStarterId, deviceId: null });
assert.equal(await starterModule.getStarterDeviceLink({ userId, starterId: otherStarterId }), null);
delete globalThis.__starterTestClient;
delete globalThis.localStorage;
console.log('Foundation and migration contract tests passed.');
