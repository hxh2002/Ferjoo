import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { alertPayload, eligiblePeak, eligibleRatio, retryDelay, safePushEndpoint, validInternalSecret } from '../supabase/functions/process-height-alerts/policy.js';
import { summarizeFeedingMeasurements } from '../src/services/feeding-analysis.service.js';

assert.equal(safePushEndpoint('https://fcm.googleapis.com/fcm/send/abc'), true);
assert.equal(safePushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc'), true);
assert.equal(safePushEndpoint('https://push.services.mozilla.com/wpush/v2/abc'), true);
assert.equal(safePushEndpoint('https://web.push.apple.com/abc'), true);
for (const value of [
  'http://fcm.googleapis.com/a', 'https://evil.example/a', 'https://fcm.googleapis.com.evil.example/a',
  'https://user@fcm.googleapis.com/a', 'https://fcm.googleapis.com:443/a', 'https://fcm.googleapis.com/a?q=x',
  'https://fcm.googleapis.com/a#fragment', 'https://127.0.0.1/a', 'not-a-url'
]) assert.equal(safePushEndpoint(value), false, value);
assert.equal(await validInternalSecret('a'.repeat(32), 'a'.repeat(32)), true);
assert.equal(await validInternalSecret('a'.repeat(32), 'b'.repeat(32)), false);
assert.equal(await validInternalSecret('short', 'short'), false);
assert.equal(retryDelay(1, '120'), 120);
assert.equal(retryDelay(2, 'Sun, 06 Nov 1994 08:49:37 GMT', Date.parse('Sun, 06 Nov 1994 08:49:00 GMT')), 120);
assert.equal(retryDelay(9, null), 3600);
assert.equal(eligibleRatio({ baselineHeightMm: 100, currentHeightMm: 200 }), 2);
for (const summary of [null, { baselinePending: true, baselineHeightMm: 100, currentHeightMm: 200 }, { historicalRound: true, baselineHeightMm: 100, currentHeightMm: 200 }, { heightStale: true, baselineHeightMm: 100, currentHeightMm: 200 }, { baselineHeightMm: 0, currentHeightMm: 200 }, { baselineHeightMm: 100, currentHeightMm: 0 }]) assert.equal(eligibleRatio(summary), null);

// 过峰：服务端用同一份 summary 判定，Peak 锁定前（仍在上涨或刚回落一个点）不提醒。
{
  const at = (minutes) => new Date(Date.UTC(2026, 0, 1, 0, minutes)).toISOString();
  const feeding = { id: 'f1', kind: 'feeding', starter_id: 's1', occurred_at: at(0), input: {} };
  const link = { starter_id: 's1', device_id: 'd1', active_from: at(-10), active_to: null };
  const row = (minutes, height) => ({ device_id: 'd1', recorded_at: at(minutes), mode: 'fer', sensor_error: false, height_mm: height, temperature_c: 26 });
  const rows = [5, 15, 25, 35, 45].map((m) => row(m, 100)).concat([row(55, 150), row(65, 190), row(75, 210), row(85, 230), row(95, 225), row(105, 220)]);
  const summary = (count, minute) => summarizeFeedingMeasurements({ feeding, link, measurements: rows.slice(0, count), now: Date.parse(at(minute)) });
  assert.equal(eligiblePeak(summary(9, 86)), null, 'still rising');
  assert.equal(eligiblePeak(summary(10, 96)), null, 'one drop is not a peak yet');
  const peak = eligiblePeak(summary(11, 106));
  assert.deepEqual(peak, { peakAt: at(85), peakRatio: 2.3 });
  assert.equal(eligiblePeak({ ...summary(11, 106), historicalRound: true }), null, 'closed rounds never alert');
  assert.equal(eligiblePeak({ ...summary(11, 106), heightStale: true }), null);

  const message = alertPayload({ kind: 'peak', ratio: 2.2, peak_ratio: peak.peakRatio, peak_at: peak.peakAt, feeding_id: 'e1', starter_id: 's 1' }, Date.parse(at(106)));
  assert.equal(message.title, '酵种已过峰值');
  assert.equal(message.body, '约 21 分钟前到达峰值，膨胀至基线的 2.30 倍；目前为 2.20 倍，已开始回落。');
  assert.equal(message.tag, 'ferjoo-peak-e1');
  assert.equal(message.url, '/device?starter=s%201');
  assert.deepEqual(alertPayload({ kind: 'ratio', target: 2, ratio: 2.137, feeding_id: 'e1', starter_id: 's1' }), {
    title: '高度已达基线的 2 倍', body: '当前高度约为基线的 2.14 倍，可回到今日页查看本轮喂养情况。', tag: 'ferjoo-height-e1-2', url: '/device?starter=s1',
  }, 'ratio alerts keep their original copy');
  assert.deepEqual(alertPayload({ kind: 'feeding_gap', gap_days: 3, feeding_id: 'e1', starter_id: 's 1', starter_name: ' 一号\n罐 ' }), {
    title: '该喂养了',
    body: '「一号 罐」距离上次喂养已过 3 天，还没有新的喂养记录。',
    tag: 'ferjoo-feeding-gap-e1',
    url: '/feeding?starter=s%201',
  });
  assert.equal(alertPayload({ kind: 'feeding_gap', gap_days: 7, feeding_id: 'e2', starter_id: 's2' }).body, '这罐酵种距离上次喂养已过 7 天，还没有新的喂养记录。');
}

const peakMigration = await readFile(new URL('../supabase/migrations/032_peak_alert.sql', import.meta.url), 'utf8');
assert.match(peakMigration, /unique nulls not distinct \(user_id, starter_id, feeding_id, kind, target\)/, 'one peak event per round');
assert.match(peakMigration, /\(cardinality\(targets\) > 0 or peak_alert\)/, 'peak-only settings are still evaluated');
assert.match(peakMigration, /\(e\.kind = 'peak' and s\.peak_alert\)/, 'peak deliveries survive the dead-letter sweep');
assert.match(peakMigration, /p_peak_at >= now\(\) - interval '90 minutes'/, 'stale peaks are not announced');
assert.match(peakMigration, /grant execute on function public\.set_peak_alert\(uuid, boolean\) to authenticated/);
assert.doesNotMatch(peakMigration, /complete_height_evaluation\([^)]*\) to authenticated/);

const gapMigration = await readFile(new URL('../supabase/migrations/035_feeding_gap_alert.sql', import.meta.url), 'utf8');
assert.match(gapMigration, /feeding_gap_days in \(1, 2, 3, 5, 7\)/);
assert.match(gapMigration, /kind = 'feeding_gap'/);
assert.match(gapMigration, /make_interval\(days => s\.feeding_gap_days\)/, 'the reminder waits n full days after the last feeding');
assert.match(gapMigration, /n\.fed_at > f\.fed_at/, 'a newer feeding resets the reminder');
assert.match(gapMigration, /cardinality\(targets\) > 0 or peak_alert or feeding_gap_enabled/);
assert.match(gapMigration, /e\.kind = 'feeding_gap' and s\.feeding_gap_enabled/);
assert.match(gapMigration, /grant execute on function public\.set_feeding_gap_alert\(uuid, boolean, smallint\) to authenticated/);
assert.doesNotMatch(gapMigration, /set_feeding_gap_alert\(uuid, boolean, smallint\) to anon/);
assert.match(gapMigration, /else now\(\) \+ interval '1 hour'/, 'day-scale reminders are not polled every minute');
assert.doesNotMatch(peakMigration, /^create function/m, 'replayable: every function uses create or replace');

const migration = await readFile(new URL('../supabase/migrations/020_height_web_push.sql', import.meta.url), 'utf8');
const configMigration = await readFile(new URL('../supabase/migrations/022_height_push_config.sql', import.meta.url), 'utf8');
const ingestMigration = await readFile(new URL('../supabase/migrations/021_device_ingest_upsert.sql', import.meta.url), 'utf8');
// 幂等重放：同 (device_id, recorded_at) 已存在即跳过；不删改既有数据，也不新建唯一约束（既有重复数据会让迁移失败）。
assert.match(ingestMigration, /create or replace function public\.ingest_device_measurements\(/);
assert.match(ingestMigration, /where not exists/);
assert.match(ingestMigration, /TOO_MANY_MEASUREMENTS/);
assert.match(ingestMigration, /grant execute on function public\.ingest_device_measurements\(varchar, text, jsonb\) to anon/);
assert.doesNotMatch(ingestMigration, /delete from public\.device_measurements/i);
assert.doesNotMatch(ingestMigration, /create unique index/i);
assert.doesNotMatch(ingestMigration, /on conflict/i);
assert.match(migration, /unique \(user_id, starter_id, feeding_id, target\)/);
assert.match(migration, /unique \(event_id, subscription_id\)/);
assert.match(migration, /for update skip locked/);
assert.match(migration, /grant select, delete on public\.push_subscriptions to authenticated/);
assert.match(migration, /grant select on public\.height_alert_settings to authenticated/);
assert.match(migration, /cron\.schedule\('height-web-push', '\* \* \* \* \*'/);
// PG17 新项目没有 supabase_vault：密钥改存 private 配置表，且不得回退到 vault。
assert.match(migration, /create table private\.height_push_config/);
assert.match(migration, /revoke all on private\.height_push_config from public, anon, authenticated, service_role/);
assert.match(migration, /from private\.height_push_config where name = 'height_push_worker_url'/);
assert.doesNotMatch(migration, /vault|pgsodium/i);
// 022 为已应用旧版 020 的库补齐配置表，必须幂等，避免重复迁移失败。
assert.match(configMigration, /create table if not exists private\.height_push_config/);
assert.match(configMigration, /create or replace function private\.dispatch_height_push/);
assert.match(configMigration, /from private\.height_push_config where name = 'height_push_worker_url'/);
assert.match(configMigration, /cron\.unschedule\('height-web-push'\)/);
assert.match(configMigration, /cron\.schedule\('height-web-push', '\* \* \* \* \*'/);
assert.doesNotMatch(configMigration, /vault|pgsodium/i);
assert.doesNotMatch(migration, /VAPID_PRIVATE_KEY\s*[:=]\s*['"][^'"]+/);
assert.match(migration, /create extension if not exists pg_net;/);

console.log('web push policy: endpoint SSRF restrictions, retries, current-window eligibility, SQL idempotency and secrets OK');
