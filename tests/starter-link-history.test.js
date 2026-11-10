import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { summarizeFeedingMeasurements } from '../src/services/feeding-analysis.service.js';
import { createMobileDeviceService } from '../src/services/mobile-device.service.js';
import { fetchLinkedMeasurements } from '../src/lib/linked-measurements.js';
import { describeLinkChange } from '../src/lib/link-change.js';
import { classifyReadError, readErrorMessage } from '../src/lib/read-errors.js';
import { clipWindows, coverageGaps, filterRowsByWindows, mergeWindows, linkWindow, readPlans, starterWindows, windowsExcludingOthers } from '../src/lib/starter-link-windows.js';
import { starterRoundDeviceWindows } from '../src/lib/round-device-attribution.js';

// ---------------------------------------------------------------------------
// 内存版「数据库」：模拟 link_starter_device / unbind_device_member（migration 025）/ RLS / list_linked_measurements。
// ---------------------------------------------------------------------------
const BASE = Date.UTC(2026, 0, 1, 0, 0);
const at = (minutes) => new Date(BASE + minutes * 60000).toISOString();
const USER = 'u1';

function createDb({ rpc = true } = {}) {
  const db = { links: [], members: new Set(['d1', 'd2']), measurements: [], rpcCalls: 0, rpc, directMode: 'empty', nextLink: 1 };
  for (const device of ['d1', 'd2']) {
    for (let minute = 0; minute <= 600; minute += 10) {
      db.measurements.push({ id: db.measurements.length + 1, device_id: device, recorded_at: at(minute), mode: 'fer', sensor_error: false, height_mm: 100 + minute / 10, temperature_c: 25, humidity_percent: 60, battery_percent: 90 });
    }
  }
  // link_starter_device：只结束该酵种的活跃关联；同设备的其他酵种继续关联。
  db.link = (starterId, deviceId, minute) => {
    if (deviceId && !db.members.has(deviceId)) throw Object.assign(new Error('DEVICE_MEMBERSHIP_REQUIRED'), { code: '42501' });
    for (const row of db.links) if (row.active_to == null && row.starter_id === starterId) row.active_to = at(minute);
    if (deviceId) db.links.push({ id: `l${db.nextLink++}`, user_id: USER, starter_id: starterId, device_id: deviceId, active_from: at(minute), active_to: null });
  };
  // unbind_device_member：先结束该用户在该设备上的活跃关联，再删除成员。
  db.leave = (deviceId, minute) => {
    for (const row of db.links) if (row.device_id === deviceId && row.active_to == null) row.active_to = at(minute);
    db.members.delete(deviceId);
  };
  db.join = (deviceId) => db.members.add(deviceId);
  return db;
}

function createClient(db) {
  const matches = (row, filters) => filters.every(([op, column, value]) => {
    const cell = row[column];
    return op === 'eq' ? cell === value : op === 'gte' ? cell >= value : op === 'lte' ? cell <= value : cell < value;
  });
  return {
    from(table) {
      assert.equal(table, 'device_measurements');
      const filters = []; let window = [0, 999];
      const query = {
        select() { return query; },
        eq: (column, value) => { filters.push(['eq', column, value]); return query; },
        gte: (column, value) => { filters.push(['gte', column, value]); return query; },
        lte: (column, value) => { filters.push(['lte', column, value]); return query; },
        lt: (column, value) => { filters.push(['lt', column, value]); return query; },
        order() { return query; },
        range(from, to) { window = [from, to]; return query; },
        then(resolve, reject) {
          if (db.directMode === 'error') return Promise.resolve({ data: null, error: Object.assign(new Error('permission denied for table device_measurements'), { code: '42501' }) }).then(resolve, reject);
          if (db.directMode === 'jwt') return Promise.resolve({ data: null, error: Object.assign(new Error('JWT expired'), { code: 'PGRST301' }) }).then(resolve, reject);
          const device = filters.find(([op, column]) => op === 'eq' && column === 'device_id')[2];
          // RLS：非成员读不到任何行。
          const rows = db.members.has(device) ? db.measurements.filter((row) => matches(row, filters.map(([op, column, value]) => [op, column, column === 'recorded_at' ? value : value]))) : [];
          const sorted = rows.slice().sort((a, b) => a.recorded_at.localeCompare(b.recorded_at) || a.id - b.id);
          return Promise.resolve({ data: sorted.slice(window[0], window[1] + 1), error: null }).then(resolve, reject);
        }
      };
      return query;
    },
    async rpc(name, params) {
      db.rpcCalls += 1;
      if (name !== 'list_linked_measurements' || !db.rpc) return { data: null, error: { code: 'PGRST202', message: 'function not found' } };
      const rows = db.measurements.filter((row) => row.device_id === params.p_device_id && row.recorded_at >= params.p_from && row.recorded_at <= params.p_to
        && (!params.p_after_at || row.recorded_at > params.p_after_at || (row.recorded_at === params.p_after_at && row.id > (params.p_after_id || 0)))
        && db.links.some((link) => link.user_id === USER && link.device_id === row.device_id && (!params.p_starter_id || link.starter_id === params.p_starter_id)
          && row.recorded_at >= link.active_from
          && (link.active_to != null ? row.recorded_at < link.active_to : db.members.has(link.device_id))));
      rows.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at) || a.id - b.id);
      return { data: rows.slice(0, params.p_limit), error: null };
    }
  };
}

const minutesOf = (iso) => (Date.parse(iso) - BASE) / 60000;
const rangeOf = (from, to) => ({ from: at(from), to: at(to) });

// 共享设备：喂养选择决定后续归属，手动结束则终止该轮次的读数。
{
  const now = BASE + 400 * 60000;
  const links = [
    { starter_id: 'A', device_id: 'shared', active_from: at(0), active_to: null },
    { starter_id: 'B', device_id: 'shared', active_from: at(0), active_to: null },
  ];
  const feedings = [
    { id: 'a1', starter_id: 'A', kind: 'feeding', occurred_at: at(10) },
    { id: 'b1', starter_id: 'B', kind: 'feeding', occurred_at: at(100) },
    { id: 'a2', starter_id: 'A', kind: 'feeding', occurred_at: at(200) },
  ];
  const windows = (starterId, closures = []) => starterRoundDeviceWindows(links, { starterId, feedings, closures, now })
    .map(({ from, to }) => [minutesOf(new Date(from).toISOString()), minutesOf(new Date(to).toISOString())]);
  assert.deepEqual(windows('A'), [[10, 100], [200, 400]]);
  assert.deepEqual(windows('B'), [[100, 200]], 'A feeding again at 200 takes the shared device back from B');
  assert.deepEqual(windows('A', [{ feeding_id: 'a2', ended_at: at(240) }]), [[10, 100], [200, 240]]);
  const noNextRound = starterRoundDeviceWindows(links, { starterId: 'A', feedings: [feedings[0], feedings[1]], now })
    .map(({ from, to }) => [minutesOf(new Date(from).toISOString()), minutesOf(new Date(to).toISOString())]);
  assert.deepEqual(noNextRound, [[10, 100]], 'other starter feeding takes over without another round on A');
}

// ---------------------------------------------------------------------------
// 场景 1：A-设备1 / B-设备2 → 互换 → 再换回。A、B 的全部历史窗口都可读，且互不混入。
// ---------------------------------------------------------------------------
{
  const db = createDb();
  db.link('A', 'd1', 0); db.link('B', 'd2', 0);
  db.link('A', 'd2', 120); db.link('B', 'd1', 121);   // A 换到 d2；B 换到 d1，随后允许共享
  db.link('A', 'd1', 240); db.link('B', 'd2', 241);   // 再换回
  const client = createClient(db);
  const service = createMobileDeviceService(client);
  const all = db.links;
  const windowsA = starterWindows(all, { starterId: 'A' });
  const windowsB = starterWindows(all, { starterId: 'B' });
  const spans = (windows) => windows.map((w) => [w.deviceId, minutesOf(new Date(w.from)), Number.isFinite(w.to) ? minutesOf(new Date(w.to)) : 'open']);
  assert.deepEqual(spans(windowsA), [['d1', 0, 120], ['d2', 120, 240], ['d1', 240, 'open']], 'A keeps all three windows although it was swapped away and back');
  // B 换到 d1 比 A 的 d2 换绑晚一分钟；B 回到 d2 也比 A 回到 d1 晚一分钟。
  assert.deepEqual(spans(windowsB), [['d2', 0, 121], ['d1', 121, 241], ['d2', 241, 'open']]);
  db.link('C', 'd1', 300); db.link('D', 'd1', 310);
  assert.equal(db.links.filter((row) => row.device_id === 'd1' && row.active_to == null).length, 3, 'one device supports several active starter links');
  const shared = starterWindows(db.links, { starterId: 'C' });
  const sharedRows = filterRowsByWindows(db.measurements.filter((row) => row.device_id === 'd1'), shared);
  assert.ok(sharedRows.some((row) => minutesOf(row.recorded_at) === 320), 'a shared device keeps the new starter window readable');
  const read = async (windows, starterId) => {
    const rows = [];
    for (const plan of readPlans(clipWindows(windows, BASE, BASE + 600 * 60000), { from: BASE, to: BASE + 600 * 60000 })) {
      const result = await service.range(plan.deviceId, { from: plan.from, to: new Date(Date.parse(plan.to) + 1).toISOString(), starterId });
      assert.equal(result.error, '');
      rows.push(...result.rows.map((row) => ({ ...row, device_id: plan.deviceId })));
    }
    return filterRowsByWindows(rows, windows);
  };
  const rowsA = await read(windowsA, 'A');
  const rowsB = await read(windowsB, 'B');
  const key = (row) => `${row.device_id}@${minutesOf(row.recorded_at)}`;
  const keysA = new Set(rowsA.map(key)); const keysB = new Set(rowsB.map(key));
  assert.ok(rowsA.length > 0 && rowsB.length > 0);
  // 关联窗口允许重叠；真正的排他归属由下面的喂养轮次测试决定。
  assert.ok(rowsA.length > 0 && rowsB.length > 0);
  assert.ok(rowsA.some((row) => row.device_id === 'd1' && minutesOf(row.recorded_at) === 10), 'A early d1 history readable');
  assert.ok(rowsA.some((row) => row.device_id === 'd2' && minutesOf(row.recorded_at) === 130), 'A history from the swapped period readable');
  assert.ok(rowsA.some((row) => row.device_id === 'd1' && minutesOf(row.recorded_at) === 250), 'A history after switching back readable');
  assert.ok(rowsB.some((row) => row.device_id === 'd2' && minutesOf(row.recorded_at) === 10));
  assert.ok(rowsB.some((row) => row.device_id === 'd1' && minutesOf(row.recorded_at) === 130));
  assert.ok(rowsB.some((row) => row.device_id === 'd2' && minutesOf(row.recorded_at) === 250));
  // 互换期间 d1 在 [120,121) 无人占用：这一分钟内的采样不属于任何酵种。
  assert.ok(!rowsA.some((row) => row.device_id === 'd1' && minutesOf(row.recorded_at) === 120) && !rowsB.some((row) => row.device_id === 'd1' && minutesOf(row.recorded_at) === 120));
  // 轮次跨越换绑：A 在 t=30 喂养、t=300 下一次喂养；整轮的读数来自三段窗口。
  const summary = summarizeFeedingMeasurements({ feeding: { starter_id: 'A', occurred_at: at(30) }, links: all, measurements: rowsA, now: BASE + 400 * 60000, nextFeedingAt: at(300) });
  assert.equal(summary.linkedWindowCount, 3);
  assert.ok(rowsA.filter((row) => minutesOf(row.recorded_at) >= 30 && minutesOf(row.recorded_at) < 300).length === summary.measurementCount, 'the round includes readings from all three windows');
  assert.ok(summary.measurementCount > 0);
  const swappedAway = summarizeFeedingMeasurements({ feeding: { starter_id: 'A', occurred_at: at(30) }, links: all.filter((row) => row.starter_id === 'A'), measurements: [...rowsA, ...rowsB], now: BASE + 400 * 60000, nextFeedingAt: at(300) });
  const expectedOverlapCount = [120, 240].filter((minute) => rowsA.some((row) => row.device_id === 'd2' && minutesOf(row.recorded_at) === minute)).length + 1;
  assert.equal(swappedAway.measurementCount, summary.measurementCount + expectedOverlapCount, 'shared-device samples are accepted only during both starters’ overlapping windows');
}

// ---------------------------------------------------------------------------
// 场景 2：A 解绑后重绑同一设备：中间空窗期不归属，前后两段都可见。
// ---------------------------------------------------------------------------
{
  const db = createDb();
  db.link('A', 'd1', 0); db.link('A', null, 100); db.link('A', 'd1', 200);
  const windows = starterWindows(db.links, { starterId: 'A' });
  assert.deepEqual(windows.map((w) => [minutesOf(new Date(w.from)), Number.isFinite(w.to) ? minutesOf(new Date(w.to)) : 'open']), [[0, 100], [200, 'open']]);
  const rows = db.measurements.filter((row) => row.device_id === 'd1');
  const kept = filterRowsByWindows(rows, windows).map((row) => minutesOf(row.recorded_at));
  assert.ok(kept.includes(50) && kept.includes(250), 'both windows visible after re-linking the same device');
  assert.ok(!kept.includes(150), 'the unbound gap is not attributed to the starter');
  assert.equal(coverageGaps(windows, BASE, BASE + 300 * 60000).gapMs, 100 * 60000);
  // 同一设备相邻/重叠的窗口合并，零长度窗口被忽略。
  assert.equal(mergeWindows([linkWindow({ device_id: 'd1', starter_id: 'A', active_from: at(0), active_to: at(10) }), linkWindow({ device_id: 'd1', starter_id: 'A', active_from: at(10), active_to: at(20) })]).length, 1);
  assert.equal(linkWindow({ device_id: 'd1', starter_id: 'A', active_from: at(5), active_to: at(5) }), null);
}

// ---------------------------------------------------------------------------
// 场景 3：成员退出再加入。退出后直读读不到，但本人关联窗口内的历史仍可读；窗口之外、退出之后的数据不可读。
// ---------------------------------------------------------------------------
{
  const db = createDb();
  db.link('A', 'd1', 0);
  db.leave('d1', 100);              // 退出共享：关联在同一事务内被关闭
  db.join('d1'); db.link('A', 'd1', 160);   // 重新加入后需要重新关联
  const client = createClient(db);
  const service = createMobileDeviceService(client);
  // 先模拟「处于退出期」读取：移除成员再读。
  db.members.delete('d1');
  let result = await service.range('d1', { ...rangeOf(0, 300), starterId: 'A' });
  assert.equal(result.source, 'linked', 'direct read is empty for a non-member, the RPC supplies the history');
  assert.deepEqual([...new Set(result.rows.map((row) => minutesOf(row.recorded_at)))].every((m) => m < 100), true, 'only the closed window [0,100) is readable while not a member');
  assert.ok(result.rows.length > 0);
  assert.equal(result.error, '');
  // 开放窗口（160 起）要求当前仍是成员：非成员读不到。
  assert.ok(!result.rows.some((row) => minutesOf(row.recorded_at) >= 160));
  // 重新加入后：两段窗口都可读，窗口外（100~160）不会通过 RPC 返回。
  db.join('d1');
  const viaRpc = await fetchLinkedMeasurements(client, { deviceId: 'd1', from: at(0), to: at(300), starterId: 'A', inclusiveTo: true });
  const minutes = viaRpc.rows.map((row) => minutesOf(row.recorded_at));
  assert.ok(minutes.includes(50) && minutes.includes(170) && !minutes.includes(120), 'rejoined: both windows readable, the gap is not');
  // 别的酵种的窗口不会通过 starterId 过滤读到。
  assert.equal((await fetchLinkedMeasurements(client, { deviceId: 'd1', from: at(0), to: at(300), starterId: 'other', inclusiveTo: true })).rows.length, 0);
  // 非成员直读被拒（42501）时回退到 RPC；RPC 不存在时保留原错误并给出明确文案，而不是静默空。
  db.members.delete('d1'); db.directMode = 'error';
  result = await service.range('d1', { ...rangeOf(0, 300), starterId: 'A' });
  assert.equal(result.source, 'linked'); assert.equal(result.error, ''); assert.ok(result.rows.length > 0);
  const noRpc = createMobileDeviceService(createClient(Object.assign(db, { rpc: false })));
  result = await noRpc.range('d1', { ...rangeOf(0, 300), starterId: 'A' });
  assert.equal(result.errorKind, 'denied'); assert.match(result.error, /不是这台设备的成员/);
  db.rpc = true;
  // 区分登录过期 / 无权限 / 空数据。
  db.directMode = 'jwt';
  result = await service.range('d1', rangeOf(0, 300));
  assert.equal(result.errorKind, 'auth'); assert.match(result.error, /登录已过期/);
  db.directMode = 'empty'; db.members.add('d1');
  result = await service.range('d1', rangeOf(1000, 1200));
  assert.equal(result.errorKind, 'empty'); assert.equal(result.error, '');
  assert.equal(classifyReadError(Object.assign(new Error('x'), { code: '42501' })), 'denied');
  assert.equal(classifyReadError(new Error('JWT expired')), 'auth');
  assert.match(readErrorMessage(new Error('JWT expired')), /重新登录/);
}

// ---------------------------------------------------------------------------
// device.service.listMeasurementsRange：稳定分页、不静默截断、直读为空 / 42501 时回退 RPC。
// ---------------------------------------------------------------------------
{
  const deviceSource = (await readFile(new URL('../src/services/device.service.js', import.meta.url), 'utf8'))
    .replace("import { hasSupabaseConfig, supabase } from '../lib/supabase.js';", 'const hasSupabaseConfig = true; const supabase = new Proxy({}, { get: (_, key) => globalThis.__historyClient[key] });')
    .replace("'../lib/linked-measurements.js'", JSON.stringify(new URL('../src/lib/linked-measurements.js', import.meta.url).href))
    .replace("'../lib/read-errors.js'", JSON.stringify(new URL('../src/lib/read-errors.js', import.meta.url).href));
  const { listMeasurementsRange } = await import(`data:text/javascript;base64,${Buffer.from(deviceSource).toString('base64')}`);
  assert.match(deviceSource, /\.order\('recorded_at', \{ ascending: true \}\)\s*\.order\('id', \{ ascending: true \}\)/, 'pagination has a stable secondary key');
  const db = createDb();
  db.link('A', 'd1', 0); db.link('A', null, 100);
  // 触顶 maxPages：抛出而不是静默截断；allowPartial 时返回并标记 incomplete。
  for (let i = 0; i < 2500; i += 1) db.measurements.push({ id: 10000 + i, device_id: 'big', recorded_at: new Date(BASE + 1000 * 60000 + i * 1000).toISOString(), mode: 'fer', sensor_error: false, height_mm: 1 });
  db.members.add('big');
  globalThis.__historyClient = createClient(db);
  const bigRange = { from: at(1000), to: new Date(BASE + 1000 * 60000 + 3000 * 1000).toISOString(), bucketed: false, maxPages: 2 };
  await assert.rejects(listMeasurementsRange('big', bigRange), (error) => error.code === 'MEASUREMENTS_INCOMPLETE' && /不完整/.test(error.message));
  const partial = await listMeasurementsRange('big', { ...bigRange, allowPartial: true });
  assert.equal(partial.length, 2000); assert.equal(partial.incomplete, true);
  const full = await listMeasurementsRange('big', { ...bigRange, maxPages: 5 });
  assert.equal(full.length, 2500); assert.equal(full.incomplete, undefined);
  // 非成员：直读为空 → 回退 RPC，只拿到自己关联窗口 [0,100) 内的行。
  db.members.delete('d1');
  const history = await listMeasurementsRange('d1', { from: at(0), to: at(300), bucketed: false, starterId: 'A' });
  assert.ok(history.length > 0 && history.every((row) => minutesOf(row.recorded_at) < 100));
  // 直读 42501 同样回退；RPC 不存在时抛出带明确文案的错误。
  db.directMode = 'error';
  assert.ok((await listMeasurementsRange('d1', { from: at(0), to: at(300), bucketed: false })).length > 0);
  db.rpc = false;
  globalThis.__historyClient = createClient(Object.assign(db, { rpc: false }));
  await assert.rejects(listMeasurementsRange('d1', { from: at(0), to: at(300) }), /不是这台设备的成员/);
  db.directMode = 'jwt';
  await assert.rejects(listMeasurementsRange('d1', { from: at(0), to: at(300) }), /登录已过期/);
  delete globalThis.__historyClient;
}

// ---------------------------------------------------------------------------
// 换绑确认文案
// ---------------------------------------------------------------------------
{
  const links = [{ starter_id: 'B', device_id: 'd1', active_to: null }, { starter_id: 'A', device_id: 'd2', active_to: null }];
  const names = { A: '甲', B: '乙' };
  const change = describeLinkChange({ links, starterId: 'A', deviceId: 'd1', starterName: '甲', deviceName: '设备一', starterNameOf: (id) => names[id], deviceNameOf: (id) => `设备${id}`, roundActive: (id) => id === 'B' });
  assert.doesNotMatch(change.message, /设备「设备一」目前关联着酵种「乙」/, 'sharing a device no longer displaces its other starter');
  assert.match(change.message, /「甲」目前关联着设备「设备d2」.*结束这段关联/);
  assert.equal(change.occupantStarterId, null);
  assert.equal(describeLinkChange({ links, starterId: 'A', deviceId: 'd2' }), null, 'same device: nothing changes');
  assert.equal(describeLinkChange({ links: [], starterId: 'A', deviceId: 'd1' }), null, 'free device and unlinked starter need no confirmation');
}

// ---------------------------------------------------------------------------
// migration 合同：只读通道的安全边界与解绑关闭关联
// ---------------------------------------------------------------------------
{
  const sql = await readFile(new URL('../supabase/migrations/025_link_history_access.sql', import.meta.url), 'utf8');
  assert.match(sql, /create or replace function public\.unbind_device_member[\s\S]*update public\.starter_device_links[\s\S]*set active_to[\s\S]*delete from public\.device_members/i, 'unbind closes the links in the same function, before removing the member');
  assert.match(sql, /create trigger device_members_close_links/i);
  const rpc = sql.slice(sql.indexOf('create or replace function public.list_linked_measurements'), sql.indexOf('create index if not exists starter_device_links_user_device_idx'));
  assert.match(rpc, /security definer/i);
  assert.match(rpc, /l\.user_id = v_user_id/, 'only the caller own links');
  assert.match(rpc, /m\.recorded_at >= l\.active_from/);
  assert.match(rpc, /m\.recorded_at < l\.active_to/);
  assert.match(rpc, /device_members dm/, 'open windows require current membership');
  assert.doesNotMatch(rpc, /p_user_id|p_system_user_id/, 'the caller cannot choose whose links to use');
  assert.match(rpc, /least\(greatest\(coalesce\(p_limit, 1000\), 1\), 1000\)/);
  assert.match(sql, /grant execute on function public\.list_linked_measurements\([^)]*\) to authenticated/i);
  const multi = await readFile(new URL('../supabase/migrations/026_multiple_starters_per_device.sql', import.meta.url), 'utf8');
  assert.match(multi, /drop index if exists public\.one_active_link_per_account_device/i);
  assert.match(multi, /where user_id = v_user_id and starter_id = p_starter_id and active_to is null/i);
  assert.doesNotMatch(multi, /starter_id = p_starter_id or device_id = p_device_id/i, 'linking one starter never closes a sibling device link');
  assert.match(sql, /revoke all on function public\.list_linked_measurements\([^)]*\) from public, anon/i);
  assert.match(sql, /revoke update, delete, truncate on public\.starters/i);
  assert.doesNotMatch(sql.replace(/--[^\n]*/g, ''), /grant[^;]*\bdelete\b/i, 'no delete grant is introduced');
}

console.log('starter link history: swap/re-swap, unbind+relink, member leave/rejoin, round across rebind, RPC fallback, pagination and migration contract passed');
