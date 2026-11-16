#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  READ_TTL, cacheStamp, cachedRead, clearReadCache, invalidateReadCache, peekReadCache, primeReadCache, readCacheKey, readRevision, refreshReadCache
} from '../src/lib/read-cache.js';

let calls = 0;
const counting = (value) => async () => { calls += 1; return value; };

// 一次加载，多次复用。
calls = 0;
assert.deepEqual(await cachedRead('care:records:a', counting(['one'])), ['one']);
assert.deepEqual(await cachedRead('care:records:a', counting(['two'])), ['one'], 'within ttl the first result is reused');
assert.equal(calls, 1, 'only one read happens inside the reuse window');

// 同一数据并发读取共享同一个请求。
calls = 0;
const shared = counting(['shared']);
const [left, right] = await Promise.all([cachedRead('care:records:b', shared), cachedRead('care:records:b', shared)]);
assert.deepEqual(left, ['shared']);
assert.deepEqual(right, ['shared']);
assert.equal(calls, 1, 'concurrent reads are de-duplicated');

// ttl 到期后重新读取。
calls = 0;
await cachedRead('care:records:c', counting(1), { ttl: 0 });
assert.equal(await cachedRead('care:records:c', counting(2), { ttl: 0 }), 2, 'expired entries are read again');
assert.equal(calls, 2);

// 失败结果不缓存，下一次仍会重试。
let attempts = 0;
const flaky = async () => { attempts += 1; if (attempts === 1) throw new Error('offline'); return 'ok'; };
await assert.rejects(cachedRead('care:records:d', flaky), /offline/);
assert.equal(await cachedRead('care:records:d', flaky), 'ok', 'a failed read is retried instead of cached');

// 按命名空间失效，只清掉对应前缀，并推进全局修订号。
await cachedRead('care:records:e', counting('care'));
await cachedRead('links:e', counting('links'));
const before = readRevision();
invalidateReadCache('care:records');
assert.equal(peekReadCache('care:records:e'), undefined, 'invalidated namespace is dropped');
assert.equal(peekReadCache('links:e'), 'links', 'other namespaces survive');
assert.ok(readRevision() > before, 'invalidation advances the shared revision');

// 读取过程中被写入打断：结果仍返回给当前调用方，但不能写回缓存。
let release;
const gate = new Promise((resolve) => { release = resolve; });
const inFlight = cachedRead('care:records:g', async () => { await gate; return 'stale'; });
invalidateReadCache('care:records');
release();
assert.equal(await inFlight, 'stale');
assert.equal(peekReadCache('care:records:g'), undefined, 'a read invalidated mid-flight is not cached again');

// 页面首屏读取：命中时可直接拿到值，失效后拿不到。
await cachedRead('device:trend:f', counting('snapshot'));
assert.equal(peekReadCache('device:trend:f'), 'snapshot');
clearReadCache();
assert.equal(peekReadCache('device:trend:f'), undefined, 'logout clears every cached read');

assert.equal(readCacheKey(['care', 'records', undefined, 's1']), 'care:records::s1');
assert.equal(cacheStamp('2026-10-25T08:10:42Z'), cacheStamp('2026-10-25T08:10:05Z'), 'timestamps inside one minute share a key');
assert.notEqual(cacheStamp('2026-10-25T08:10:00Z'), cacheStamp('2026-10-25T08:11:00Z'));
assert.ok(READ_TTL.device > 0 && READ_TTL.records > 0);

// 过期值只在 stale peek 中展示，普通读取仍会触发云端更新。
await cachedRead('device:trend:stale', counting({ version: 1 }), { ttl: 0 });
assert.equal(peekReadCache('device:trend:stale'), undefined, 'expired data is not a fresh hit');
assert.deepEqual(peekReadCache('device:trend:stale', { stale: true }), { version: 1 });
calls = 0;
assert.equal(await cachedRead('device:trend:stale', counting('fresh'), { ttl: READ_TTL.device }), 'fresh');
assert.equal(calls, 1, 'stale display does not skip the network read');

// 手动刷新保留旧值，读取中及失败后也继续展示；不推进修订号，也不影响相邻命名空间。
primeReadCache('device:trend:refresh', 'before', { ttl: READ_TTL.device });
primeReadCache('device:list:refresh', 'unrelated', { ttl: READ_TTL.device });
const revisionBeforeRefresh = readRevision();
refreshReadCache('device:trend');
assert.equal(peekReadCache('device:trend:refresh'), undefined, 'refresh expires rather than deletes');
assert.equal(peekReadCache('device:trend:refresh', { stale: true }), 'before');
assert.equal(peekReadCache('device:list:refresh'), 'unrelated', 'refresh only touches its namespace');
assert.equal(readRevision(), revisionBeforeRefresh, 'refresh does not invalidate other page work');
let finishRefresh;
const refreshing = cachedRead('device:trend:refresh', () => new Promise((resolve) => { finishRefresh = resolve; }), { ttl: READ_TTL.device });
await Promise.resolve();
assert.equal(peekReadCache('device:trend:refresh', { stale: true }), 'before', 'old value remains displayable during a read');
finishRefresh('after');
assert.equal(await refreshing, 'after');
assert.equal(peekReadCache('device:trend:refresh'), 'after');
refreshReadCache('device:trend');
await assert.rejects(cachedRead('device:trend:refresh', async () => { throw new Error('refresh failed'); }), /refresh failed/);
assert.equal(peekReadCache('device:trend:refresh', { stale: true }), 'after', 'failed refresh keeps the last good value');

// 命名空间失效只丢弃本类在途结果，并清除本类持久化数据。
primeReadCache('view:device-home:a', { owner: 'a' }, { persist: true });
primeReadCache('view:device-home:b', { owner: 'b' }, { persist: true });
invalidateReadCache('view:device-home');
assert.equal(peekReadCache('view:device-home:a', { stale: true }), undefined);
assert.equal(peekReadCache('view:device-home:b', { stale: true }), undefined);
let finishCare; let finishLinks;
const careRead = cachedRead('care:records:invalidated', () => new Promise((resolve) => { finishCare = resolve; }), { persist: true });
const linksRead = cachedRead('links:preserved', () => new Promise((resolve) => { finishLinks = resolve; }), { persist: true });
await Promise.resolve();
invalidateReadCache('care:records');
finishCare('discarded'); finishLinks('kept');
assert.equal(await careRead, 'discarded');
assert.equal(await linksRead, 'kept');
assert.equal(peekReadCache('care:records:invalidated', { stale: true }), undefined);
assert.equal(peekReadCache('links:preserved'), 'kept', 'another namespace may still commit its in-flight read');

// 进程内模拟 localStorage，并清空内存模拟冷启动；恢复值只作 stale 展示。
const store = new Map();
const localStorageMock = {
  get length() { return store.size; },
  key(index) { return [...store.keys()][index] ?? null; },
  getItem(key) { return store.get(key) ?? null; },
  setItem(key, value) { store.set(key, String(value)); },
  removeItem(key) { store.delete(key); }
};
globalThis.localStorage = localStorageMock;
try {
  clearReadCache();
  primeReadCache('view:device-home:persisted', { owner: 'persisted' }, { ttl: READ_TTL.device, persist: true });
  assert.ok(store.has('ferjoo.read-cache.v1:view:device-home:persisted'));
  clearReadCache();
  assert.equal(store.size, 0, 'logout removes persisted cache and unrelated origin storage is untouched');

  primeReadCache('view:device-home:persisted', { owner: 'persisted' }, { ttl: READ_TTL.device, persist: true });
  // 用进程内子模块实例隔离内存，模拟重新打开应用；不依赖其他测试文件的全局状态。
  const cold = await import(`../src/lib/read-cache.js?cold=${Date.now()}`);
  assert.equal(cold.peekReadCache('view:device-home:persisted'), undefined, 'restored data is never treated as fresh');
  assert.deepEqual(cold.peekReadCache('view:device-home:persisted', { stale: true }), { owner: 'persisted' });
  let coldCalls = 0;
  assert.equal(await cold.cachedRead('view:device-home:persisted', async () => { coldCalls += 1; return 'cloud'; }, { ttl: READ_TTL.device }), 'cloud');
  assert.equal(coldCalls, 1, 'cold restored data still revalidates');
  cold.clearReadCache();

  store.set('ferjoo.read-cache.v1:view:device-home:expired', JSON.stringify({ at: Date.now() - 73 * 3600_000, value: 'too old' }));
  store.set('ferjoo.read-cache.v1:view:device-home:future', JSON.stringify({ at: Date.now() + 60000, value: 'invalid clock' }));
  const expired = await import(`../src/lib/read-cache.js?expired=${Date.now()}`);
  assert.equal(expired.peekReadCache('view:device-home:expired', { stale: true }), undefined);
  assert.equal(store.has('ferjoo.read-cache.v1:view:device-home:expired'), false, '72-hour old entries are deleted');
  assert.equal(expired.peekReadCache('view:device-home:future', { stale: true }), undefined, 'future timestamps cannot bypass the stale limit');
  assert.equal(store.has('ferjoo.read-cache.v1:view:device-home:future'), false);

  // 覆盖成内存条目、按命名空间失效、注销都必须删除持久化旧值。
  primeReadCache('view:device-home:removed', 'old', { persist: true });
  primeReadCache('view:device-home:removed', 'memory-only');
  assert.equal(store.has('ferjoo.read-cache.v1:view:device-home:removed'), false, 'non-persistent replacement removes the old snapshot');
  primeReadCache('view:device-home:removed', 'old', { persist: true });
  invalidateReadCache('view:device-home');
  assert.equal(store.has('ferjoo.read-cache.v1:view:device-home:removed'), false, 'namespace invalidation removes persistent storage');
  primeReadCache('view:device-home:a', { owner: 'a' }, { persist: true });
  primeReadCache('view:device-home:b', { owner: 'b' }, { persist: true });
  assert.equal(peekReadCache('view:device-home:a', { stale: true }).owner, 'a');
  assert.equal(peekReadCache('view:device-home:b', { stale: true }).owner, 'b');
  clearReadCache();
  assert.equal(store.size, 0, 'logout clears both account snapshots');
} finally {
  delete globalThis.localStorage;
}
clearReadCache();
console.log('read cache: ttl/stale display, refresh retention, persistent restore/removal/account isolation and scoped mid-flight invalidation passed');
