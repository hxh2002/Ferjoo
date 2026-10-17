import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { eligibleRatio, retryDelay, safePushEndpoint, validInternalSecret } from '../supabase/functions/process-height-alerts/policy.js';

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
