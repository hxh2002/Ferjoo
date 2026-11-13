import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { analyticsPayload, createForegroundTimer, recordAnalytics } from '../src/services/analytics.service.js';

const sql = await readFile(new URL('../supabase/migrations/031_analytics_events.sql', import.meta.url), 'utf8');
assert.match(sql, /^begin;/);
assert.match(sql, /commit;\s*$/);
assert.match(sql, /create table public\.analytics_events/);
assert.match(sql, /enable row level security/);
// 只追加：先收回全部权限，再按业务需要单独授权，避免 anon/authenticated 拿到隐式写权限。
assert.match(sql, /revoke all on public\.analytics_events from public, anon, authenticated;/);
assert.match(sql, /revoke truncate on public\.analytics_events from public, anon, authenticated;/);
assert.match(sql, /grant select, insert, update, delete on public\.analytics_events to authenticated;/);
for (const policy of ['analytics_events_select_own_or_admin', 'analytics_events_insert_own', 'analytics_events_update_admin', 'analytics_events_delete_admin']) {
  assert.match(sql, new RegExp(`create policy ${policy} on public\\.analytics_events`), policy);
}
assert.match(sql, /for insert to authenticated\s+with check \(user_id = \(select auth\.uid\(\)\)\)/);
assert.match(sql, /for select to authenticated\s+using \(user_id = \(select auth\.uid\(\)\) or private\.is_admin\(\)\)/);
// 普通用户不能改或删历史事件；更新与删除都只留给管理角色。
assert.match(sql, /create policy analytics_events_update_admin on public\.analytics_events\s+for update to authenticated\s+using \(private\.is_admin\(\)\) with check \(private\.is_admin\(\)\)/);
assert.match(sql, /create policy analytics_events_delete_admin on public\.analytics_events\s+for delete to authenticated\s+using \(private\.is_admin\(\)\)/);
assert.match(sql, /event_name ~ '\^\[a-z\]\[a-z0-9_\]\{1,79\}\$'/);
assert.match(sql, /page ~ '\^\[a-z\]\[a-z0-9_\/-\]\{0,79\}\$'/);
assert.match(sql, /jsonb_typeof\(properties\) = 'object' and pg_column_size\(properties\) <= 8192/);
assert.match(sql, /occurred_at >= '2026-01-01T00:00:00Z'::timestamptz\s+and occurred_at <= now\(\) \+ interval '5 minutes'/);
assert.match(sql, /create index analytics_events_user_time_idx\s+on public\.analytics_events\(user_id, occurred_at desc\)/);
assert.match(sql, /create index analytics_events_event_time_idx\s+on public\.analytics_events\(event_name, occurred_at desc\)/);
assert.match(sql, /unique \(user_id, client_event_id\)/);
// 客户端自己传 user_id 不能生效：列默认来自会话，且插入策略再校验一次等于 auth.uid()。
assert.match(sql, /user_id uuid not null default auth\.uid\(\)/);

const payload = analyticsPayload({
  name: 'diary_date_selected', page: 'diary',
  properties: { day: '2026-11-13', source: 'date_grid' },
  occurredAt: '2026-11-13T06:00:00Z'
});
assert.deepEqual(Object.keys(payload).sort(), ['client_event_id', 'event_name', 'occurred_at', 'page', 'properties', 'session_id'].sort());
assert.equal(payload.event_name, 'diary_date_selected');
assert.equal(payload.page, 'diary');
assert.equal(payload.occurred_at, '2026-11-13T06:00:00.000Z');
assert.match(payload.client_event_id, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
assert.match(payload.session_id, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
// 事件/会话编号缺失时自动补齐，调用方不必自己造 uuid。
assert.equal('user_id' in payload, false, 'the payload never carries a caller-supplied user id');

for (const name of ['Diary_click', 'd', '', '1start', 'has space', 'x'.repeat(81), null, 42]) {
  assert.throws(() => analyticsPayload({ name, page: 'diary' }), /埋点事件名称/, String(name));
}
for (const page of ['Diary', '', 'has space', 'x'.repeat(81), null]) {
  assert.throws(() => analyticsPayload({ name: 'ok_event', page }), /埋点页面名称/, String(page));
}
assert.doesNotThrow(() => analyticsPayload({ name: 'ok_event', page: 'device_trend' }));
assert.throws(() => analyticsPayload({ name: 'ok_event', properties: [1, 2, 3] }), /埋点属性/);
assert.throws(() => analyticsPayload({ name: 'ok_event', properties: 'nope' }), /埋点属性/);
assert.throws(() => analyticsPayload({ name: 'ok_event', properties: { text: 'x'.repeat(8300) } }), /埋点属性过大/);
assert.throws(() => analyticsPayload({ name: 'ok_event', occurredAt: 'not-a-date' }), /埋点时间/);

const eventId = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const sessionId = '9c858901-8a57-4791-81fe-4c455b099bc9';
const supplied = analyticsPayload({ name: 'ok_event', eventId, sessionId });
assert.equal(supplied.client_event_id, eventId, 'a supplied valid uuid is preserved');
assert.equal(supplied.session_id, sessionId);
const source = { day: '2026-11-13', nested: { keep: 1 } };
const snapshot = analyticsPayload({ name: 'ok_event', properties: source });
source.nested.keep = 2;
source.day = 'mutated';
assert.deepEqual(snapshot.properties, { day: '2026-11-13', nested: { keep: 1 } }, 'properties are cloned, not shared');

function client({ userId = 'user-1', row = { id: 'event-1' }, error = null, calls = [] } = {}) {
  return {
    calls,
    auth: {
      getSession: async () => ({ data: { session: userId ? { user: { id: userId } } : null }, error: null })
    },
    from(table) {
      calls.push(table);
      return {
        insert(payload) {
          calls.push(payload);
          return { select: () => ({ single: async () => ({ data: row, error }) }) };
        }
      };
    }
  };
}

const successCalls = [];
const recorded = await recordAnalytics({
  name: 'feeding_saved', page: 'feeding',
  properties: { ratio: '1:2:2' }, eventId,
  // 调用方伪造的 user_id 必须被忽略，实际写入取登录会话。
  user_id: 'attacker'
}, client({ calls: successCalls }));
assert.deepEqual(recorded, { recorded: true, id: 'event-1', eventId });
assert.equal(successCalls[0], 'analytics_events');
assert.equal(successCalls[1].user_id, 'user-1', 'user_id comes from the session, never the caller');
assert.equal(successCalls[1].client_event_id, eventId);
assert.equal(successCalls[1].event_name, 'feeding_saved');

assert.deepEqual(await recordAnalytics({ name: 'ok_event' }, client({ userId: null })), { recorded: false });
assert.deepEqual(await recordAnalytics({ name: 'ok_event' }, client({ row: null, error: { code: '42501' } })), { recorded: false });
assert.deepEqual(await recordAnalytics({ name: 'ok_event' }, client({ row: {} })), { recorded: false }, 'a missing returned id is not counted as recorded');
assert.deepEqual(await recordAnalytics({ name: 'ok_event' }, null), { recorded: false });

const skipped = [];
await recordAnalytics({ name: 'Bad Name', page: 'diary' }, client({ calls: skipped }));
assert.deepEqual(skipped, [], 'a validation failure never reaches the client');

// 前台计时：后台时间不计入，每次结算后清零，重复隐藏只结算一次。
{
  let current = 0;
  let isHidden = false;
  const timer = createForegroundTimer({ now: () => current, hidden: () => isHidden });
  current = 1000;
  assert.equal(timer.flush(), 1000);
  assert.equal(timer.flush(), 0, 'flush resets the accumulated total');
  current = 3000;
  timer.pause();
  current = 5000;
  timer.resume();
  current = 6000;
  assert.equal(timer.flush(), 1000, 'background time between pause and resume is excluded');
  current = 7000;
  isHidden = true;
  timer.pause();
  timer.resume();
  current = 9000;
  assert.equal(timer.flush(), 0, 'a hidden timer never resumes until visible again');
  isHidden = false;
  timer.resume();
  current = 9250;
  assert.equal(timer.flush(), 250, 'durations are rounded to whole milliseconds');
}
{
  let current = 100;
  let isHidden = true;
  const timer = createForegroundTimer({ now: () => current, hidden: () => isHidden });
  current = 400;
  assert.equal(timer.flush(), 0, 'a timer created while hidden accumulates nothing');
  isHidden = false;
  timer.resume();
  current = 900;
  assert.equal(timer.flush(), 500);
}

console.log('analytics: append-only migration contract, payload validation, session-bound insert and foreground timing passed');
