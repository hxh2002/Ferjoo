#!/usr/bin/env node
// care.service.js 与 015_mobile_care.sql 的纯静态契约测试（不连接远端）。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const service = fs.readFileSync(path.join(root, 'src/services/care.service.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/015_mobile_care.sql'), 'utf8');

// 服务导出契约
for (const fn of ['listStarters', 'createStarter', 'listCareRecords', 'saveFeeding', 'saveObservation', 'getCareRecord', 'deleteCareRecord', 'listDeviceRoles']) {
  assert.match(service, new RegExp(`export function ${fn}\\(`), `缺少导出：${fn}`);
}

// 归档（soft delete）：删除语义统一走 archive_starter，starters 永不物理删除。
for (const fn of ['archiveStarter', 'deleteStarter']) {
  assert.match(service, new RegExp(`export function ${fn}\\(`), `缺少导出：${fn}`);
}
assert.match(service, /rpc\('archive_starter', \{ p_starter_id: id \}\)/);
assert.match(service, /export function deleteStarter\(starterId\) \{\s*return archiveStarter\(starterId\);\s*\}/, 'deleteStarter must delegate to archiving');
assert.doesNotMatch(service, /from\('starters'\)\.delete\(\)/, 'no physical starter delete path remains');
assert.match(service, /archived_at/, 'starter reads expose the archive flag');
assert.match(service, /\.is\('archived_at', null\)/, 'active starters exclude archived rows');
assert.match(service, /includeArchived = false/);
assert.match(service, /归档功能尚未启用，请先执行最新数据库迁移/, 'unmigrated schema gives an actionable message');
assert.match(service, /alreadyArchived/);
assert.match(service, /hasHistory/);

// 未迁移/未配置的中文错误提示
assert.match(service, /记录服务尚未启用/);
assert.match(service, /请先完成数据库迁移/);

// starter 与记录的统一字段契约
assert.match(service, /id, name/);
assert.match(service, /id, kind, starter_id, occurred_at, input, result, ratio/);
assert.match(service, /'feeding'/);
assert.match(service, /'observation'/);

// 幂等请求编号：UUID 校验 + 服务端唯一冲突
assert.match(service, /requestId/);
assert.match(service, /REQUEST_ID_CONFLICT/);
assert.match(service, /原记录不会被覆盖/);

// 参数边界
assert.match(service, /记录时间不能晚于当前时间/);
assert.match(service, /酵种名称需为 1 至 80 个字符/);
assert.match(service, /喂养比例不能为空/);
assert.match(service, /查询开始时间必须早于结束时间/);

// 迁移：表与幂等唯一键
assert.match(migration, /create table public\.starters \(/);
assert.match(migration, /create table public\.care_records \(/);
assert.match(migration, /unique \(user_id, request_id\)/);
assert.match(migration, /kind in \('feeding', 'observation'\)/);

// RLS：仅本人可见；无 update/delete 授权（不可变快照）
assert.match(migration, /policy starters_select_own/);
assert.match(migration, /policy starters_insert_own/);
assert.match(migration, /policy care_records_select_own/);
assert.match(migration, /user_id = \(select auth\.uid\(\)\)/);
assert.match(migration, /grant select, insert on public\.starters to authenticated/);
assert.match(migration, /grant select, insert on public\.care_records to authenticated/);
assert.ok(!/grant\s+[^;]*update[^;]*on public\.care_records/.test(migration), 'care_records 不可提供 update 授权');
assert.ok(!/grant\s+[^;]*delete[^;]*on public\.care_records/.test(migration), 'care_records 不可提供 delete 授权');

// 029：单条记录的删除权限单独放在新迁移里（015 保持不可变快照口径）。
{
  const removeMigration = fs.readFileSync(path.join(root, 'supabase/migrations/029_care_record_delete.sql'), 'utf8');
  assert.match(removeMigration, /grant delete on public\.care_records to authenticated/);
  assert.match(removeMigration, /revoke update, truncate on public\.care_records from public, anon, authenticated/, '只加 delete，update 继续收回');
  assert.match(removeMigration, /drop policy if exists care_records_delete_own on public\.care_records/);
  assert.match(removeMigration, /for delete to authenticated using \(user_id = \(select auth\.uid\(\)\)\)/);
  assert.ok(!/grant\s+[^;]*update[^;]*on public\.care_records/.test(removeMigration), '029 也不授予 update');
  // 依赖表由外键 cascade 清理，额外授权会把「删一条记录」放大成「能删别人的派生事实」。
  assert.ok(!/grant[^;]*delete[^;]*on public\.(feed_events|fermentation_window_closures|height_alert_events)/i.test(removeMigration), '依赖表只靠外键级联');
}

// 事务保存 + 幂等冲突不可覆盖快照
assert.match(migration, /function public\.save_care_record\(/);
assert.match(migration, /security invoker/);
assert.match(migration, /on conflict \(user_id, request_id\) do nothing/);
assert.match(migration, /raise exception 'REQUEST_ID_CONFLICT'/);
assert.match(migration, /STARTER_NOT_FOUND/);

console.log('Mobile care contract tests OK.');
