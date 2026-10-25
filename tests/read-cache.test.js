#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  READ_TTL, cacheStamp, cachedRead, clearReadCache, invalidateReadCache, peekReadCache, readCacheKey, readRevision
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

console.log('read cache: ttl reuse, concurrent de-duplication, failure retry, namespace invalidation and revision contracts passed');
