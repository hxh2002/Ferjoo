#!/usr/bin/env node
// 酵种归档（027 / 028）的合同测试：静态 SQL 契约 + care.service 在迁移前 / 迁移后两种库上的行为。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cache from '../src/lib/read-cache.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const archive = source('supabase/migrations/027_archive_starters.sql');
const guard = source('supabase/migrations/028_history_delete_guard.sql');
const care = source('src/services/care.service.js');
const home = source('src/views/mobile/MobileDeviceHome.vue');

// ---------------------------------------------------------------------------
// 027：软删除而不是物理删除
// ---------------------------------------------------------------------------
{
  assert.match(archive, /alter table public\.starters\s+add column if not exists archived_at timestamptz/i);
  assert.match(archive, /create index if not exists starters_active_user_idx[\s\S]*where archived_at is null/i);
  const rpc = archive.slice(archive.indexOf('create or replace function public.archive_starter'), archive.indexOf('revoke all on function public.archive_starter'));
  assert.match(rpc, /security definer/i);
  assert.match(rpc, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(rpc, /where s\.id = p_starter_id and s\.user_id = v_user_id/, 'a caller can only archive their own starter');
  assert.match(rpc, /pg_advisory_xact_lock\(hashtextextended\(v_user_id::text, 0\)\)/, 'same per-account lock as 025 / 026');
  assert.match(rpc, /if v_archived_at is null then/, 'archiving is idempotent');
  assert.match(rpc, /already_archived/, 'the result says whether it was already archived');
  assert.match(rpc, /has_records/);
  assert.match(rpc, /has_links/);
  assert.match(rpc, /update public\.starter_device_links[\s\S]*set active_to[\s\S]*where starter_id = p_starter_id and user_id = v_user_id and active_to is null/i, 'open windows close in the same transaction');
  assert.doesNotMatch(rpc, /delete\s+from/i, 'archiving never deletes history');
  assert.doesNotMatch(archive.replace(/--[^\n]*/g, ''), /grant[^;]*\bdelete\b[^;]*on public\.starters/i);
  assert.match(archive, /revoke update, delete, truncate on public\.starters/i);
  // 归档后不能再占用设备时段，但历史窗口仍然可读。
  const link = archive.slice(archive.indexOf('create or replace function public.link_starter_device'));
  assert.match(link, /where id = p_starter_id and user_id = v_user_id and archived_at is null/);
  assert.match(link, /STARTER_ARCHIVED/);
}

// ---------------------------------------------------------------------------
// 028：历史外键 restrict + 收回设备删除权限
// ---------------------------------------------------------------------------
{
  assert.match(guard, /on delete restrict/, 'history foreign keys become restrict');
  assert.doesNotMatch(guard.replace(/--[^\n]*/g, ''), /on delete cascade/i, 'no cascade is reintroduced to history tables');
  for (const fragment of [
    ['device_measurements', 'device_id', 'devices', 'device_id'],
    ['starter_device_links', 'device_id', 'devices', 'device_id'],
    ['starter_device_links', 'starter_id', 'starters', 'id'],
    ['starter_device_links', 'user_id', 'auth.users', 'id'],
    ['care_records', 'starter_id', 'starters', 'id'],
    ['care_records', 'user_id', 'auth.users', 'id'],
    ['starters', 'user_id', 'auth.users', 'id'],
    ['feed_events', 'starter_id', 'starters', 'id'],
    ['feed_events', 'user_id', 'auth.users', 'id']
  ]) {
    const [table, column, refTable, refColumn] = fragment;
    const pattern = new RegExp(
      `force_fk_on_delete_restrict\\(\\s*'public\\.${table.replace('.', '\\.')}'::regclass,\\s*'${column}',\\s*'(?:public\\.)?${refTable.replace('.', '\\.')}'::regclass,\\s*'${refColumn}',`
    );
    assert.match(guard, pattern, `${table}.${column} must reference ${refTable}(${refColumn}) with restrict`);
  }
  // 真实约束名来自 pg_constraint 反查，而不是凭空命名。
  assert.match(guard, /from pg_constraint c/);
  assert.match(guard, /where c\.conrelid = p_table[\s\S]*c\.contype = 'f'[\s\S]*c\.confrelid = p_ref_table/);
  assert.match(guard, /execute format\('alter table %s drop constraint %I', p_table, v_name\)/);
  assert.match(guard, /drop function private\.force_fk_on_delete_restrict/, 'the helper does not linger in the schema');
  // 设备：普通用户不得物理删除；策略保留（权限已使其失效）。
  assert.match(guard, /revoke delete, truncate on public\.devices from public, anon, authenticated/);
  assert.doesNotMatch(guard.replace(/--[^\n]*/g, ''), /drop policy/i, 'existing RLS policies are kept');
  assert.match(guard, /账号注销/);
  assert.match(guard, /匿名化/);
  assert.match(guard, /025/, 'dangling link cleanup defers to 025');
  assert.match(guard, /service_role/);
}

// ---------------------------------------------------------------------------
// care.service：迁移前 / 迁移后
// ---------------------------------------------------------------------------
function loadService(client) {
  const code = care
    .replace(/import\s+\{([^}]*)\}\s+from\s+'\.\.\/lib\/supabase\.js';/, 'const {$1} = modules.supabase;')
    .replace(/import\s+\{([^}]*)\}\s+from\s+'\.\.\/lib\/read-cache\.js';/, 'const {$1} = modules.cache;')
    .replace(/\bexport function /g, 'function ')
    + '\nreturn { listStarters, archiveStarter, deleteStarter, createStarter };';
  return new Function('modules', code)({
    supabase: { hasSupabaseConfig: true, supabase: client },
    cache
  });
}

// 极简查询构造器：链式 where + 可 await。
function query(rows, { columnMissing = false } = {}) {
  const filters = [];
  const builder = {
    select(fields) {
      if (columnMissing && fields.includes('archived_at')) {
        builder.error = { code: '42703', message: 'column starters.archived_at does not exist' };
      }
      return builder;
    },
    order() { return builder; },
    eq(column, value) { filters.push([column, value]); return builder; },
    is(column, value) { if (value === null) filters.push([column, null]); return builder; },
    then(resolve, reject) {
      if (builder.error) return Promise.resolve({ data: null, error: builder.error }).then(resolve, reject);
      const data = rows.filter((row) => filters.every(([column, value]) => value === null ? row[column] == null : row[column] === value));
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    }
  };
  return builder;
}

{
  const USER = '11111111-1111-4111-8111-111111111111';
  const rows = [
    { id: 'a', user_id: USER, name: '甲', created_at: '2026-01-02T00:00:00Z', archived_at: null },
    { id: 'b', user_id: USER, name: '乙', created_at: '2026-01-01T00:00:00Z', archived_at: '2026-01-03T00:00:00Z' }
  ];
  const service = loadService({ from: () => query(rows) });
  const active = await service.listStarters({ userId: USER });
  assert.deepEqual(active.map((row) => row.id), ['a'], 'archived starters disappear from pickers');
  assert.equal(active[0].archived, false);
  const all = await service.listStarters({ userId: USER, includeArchived: true });
  assert.deepEqual(all.map((row) => row.id), ['a', 'b'], 'history-facing callers can still read archived starters');
  assert.equal(all[1].archived, true);
}

// 027 未执行：列不存在时回退到原查询，不让列表整体报错。
{
  const rows = [{ id: 'a', name: '甲', created_at: '2026-01-02T00:00:00Z' }];
  const service = loadService({ from: () => query(rows, { columnMissing: true }) });
  const list = await service.listStarters({ userId: '11111111-1111-4111-8111-111111111111' });
  assert.deepEqual(list.map((row) => row.id), ['a']);
  assert.equal(list[0].archived, false);
}

// 归档 RPC：结果原样解读，deleteStarter 不发起物理删除。
{
  const calls = [];
  const service = loadService({
    from: () => { throw new Error('listStarters is not used here'); },
    rpc: async (name, params) => {
      calls.push([name, params]);
      return { data: { archived: true, already_archived: false, has_records: true, has_links: false, links_closed: 2 }, error: null };
    }
  });
  const id = '22222222-2222-4222-8222-222222222222';
  const result = await service.archiveStarter(id);
  assert.deepEqual(calls, [['archive_starter', { p_starter_id: id }]]);
  assert.deepEqual(result, { id, archived: true, alreadyArchived: false, hasHistory: true, linksClosed: 2 });
  const again = await service.deleteStarter(id);
  assert.equal(calls.length, 2, 'deleteStarter goes through the same RPC');
  assert.equal(again.hasHistory, true);
}

// 迁移未执行：归档按钮给出可执行的迁移提示，而不是「不支持删除」。
{
  const service = loadService({ rpc: async () => ({ data: null, error: { code: '42883', message: 'function archive_starter does not exist' } }) });
  await assert.rejects(
    () => service.archiveStarter('22222222-2222-4222-8222-222222222222'),
    /归档功能尚未启用，请先执行最新数据库迁移/
  );
  // 服务本身绝不保留酵种物理删除路径（其它表的删除不在此范围）。
  assert.doesNotMatch(care, /from\('starters'\)\.delete\(\)/);
}

// ---------------------------------------------------------------------------
// 页面：任何酵种都能归档，并说明历史保留
// ---------------------------------------------------------------------------
{
  assert.match(home, /archiveStarter\(item\.id\)/);
  assert.doesNotMatch(home, /deleteStarter|deleteGuard/);
  assert.match(home, /class="starter-archive"/);
  assert.match(home, /归档酵种/);
  assert.match(home, /有喂养\/观察记录或设备关联历史；归档后入口会收起，历史记录、曲线与关联时段全部保留。/);
  assert.match(home, /已归档，历史记录已保留/);
  assert.match(home, /这个酵种还没有喂养、观察或设备关联历史，归档后会从列表移除。/);
}

console.log('starter archive: soft delete RPC, idempotency, picker filtering, unmigrated fallback, restrict FKs and revoke contract passed');
