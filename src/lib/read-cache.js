// 移动端读缓存：同一份数据一次加载后复用，写入或手动刷新时按命名空间失效。
// 键统一写成「命名空间:参数」；命名空间可带层级（如 care:records），便于整类清除。
//
// 两层含义：
// - 新鲜（ttl 内）：cachedRead 直接复用，不发请求。
// - 过期但可展示（MAX_STALE_MS 内）：cachedRead 会重新读取，页面可以先用 peekReadCache(key, { stale: true })
//   把上次的结果画出来，等新结果到了再替换，避免整页先清空再出现。
// persist 的条目额外写入 localStorage，冷启动（重新打开 PWA / 刷新）时作为「过期可展示」的值恢复，
// 永远不会被当作新鲜值跳过网络读取。

const MAX_ENTRIES = 240;
const MAX_STALE_MS = 72 * 3600_000;
// 单条持久化上限（字符数）：localStorage 总配额约 5M 字符，超过的条目只留在内存里。
const MAX_PERSIST_CHARS = 1_500_000;
// 缓存值的数据结构变化时提升版本号，旧版本写入的条目不会再被读到。
const STORAGE_PREFIX = 'ferjoo.read-cache.v1:';

// 一次读取的复用时长：列表与轮次数据短一些，设备与酵种等低频数据长一些。
export const READ_TTL = {
  records: 30_000,
  window: 30_000,
  links: 120_000,
  device: 120_000,
  starter: 300_000
};

const entries = new Map();
const revisions = new Map();
// 失效按前缀记录序号：读取开始后它所在的命名空间被失效过，结果就不再写回缓存。
// 其他命名空间的失效不会连带丢弃这次读取。
const invalidatedAt = new Map();
let sequence = 0;

export function readCacheKey(parts) {
  return parts.map((part) => String(part ?? '')).join(':');
}

// 时间戳只按分钟参与键：设备采样本身按十分钟聚合，秒级差异不该造成重复读取。
export function cacheStamp(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? String(Math.floor(time / 60_000)) : String(value ?? '');
}

// 页面首屏可以先用缓存值立即渲染，再在后台确认是否过期。
// stale: true 时也返回已过期（但未超过 MAX_STALE_MS）的值和冷启动恢复的值。
export function peekReadCache(key, { stale = false } = {}) {
  const hit = lookup(key);
  const settled = hit?.pending ? hit.previous : hit;
  if (!settled) return undefined;
  if (!hit.pending && isFresh(settled)) return settled.value;
  return stale && Date.now() - settled.at < MAX_STALE_MS ? settled.value : undefined;
}

// cacheable：返回 false 的结果（例如带错误标记的部分读取）不写入缓存，下次访问会重新读取。
// persist：结果同时写入 localStorage，供下次冷启动先行展示；只用于可 JSON 序列化的低频数据。
export function cachedRead(key, loader, { ttl = READ_TTL.records, cacheable = () => true, persist = false } = {}) {
  const hit = lookup(key);
  // 同一份数据正在读取时共享同一个 Promise，避免并发重复请求。
  if (hit?.pending) return hit.pending;
  if (hit && isFresh(hit)) return Promise.resolve(hit.value);
  const started = ++sequence;
  // 读取期间保留上一份值，peekReadCache(stale) 仍能拿来先画。
  const previous = hit && !hit.pending ? hit : hit?.previous;
  const pending = Promise.resolve()
    .then(loader)
    .then(
      (value) => {
        if (entries.get(key)?.pending === pending) entries.delete(key);
        if (!invalidatedSince(key, started) && cacheable(value)) store(key, value, { ttl, persist });
        else if (previous && !invalidatedSince(key, started)) entries.set(key, previous);
        trim();
        return value;
      },
      (error) => {
        if (entries.get(key)?.pending === pending) {
          entries.delete(key);
          if (previous && !invalidatedSince(key, started)) entries.set(key, previous);
        }
        throw error;
      }
    );
  entries.set(key, { at: 0, ttl, value: undefined, pending, previous });
  trim();
  return pending;
}

// 直接写入一份已经算好的结果（例如页面汇总后的首屏快照），不经过 loader。
export function primeReadCache(key, value, { ttl = 0, persist = false } = {}) {
  store(key, value, { ttl, persist });
  trim();
}

// 写入后调用：清掉对应命名空间（含本地持久化），读取中的同类请求不再写回，并推进修订号供页面判断是否需要重读。
export function invalidateReadCache(namespace = '') {
  dropNamespace(namespace);
  bumpRevision(namespace || 'data');
  if (namespace !== 'data') bumpRevision('data');
}

// 手动刷新：只把命名空间标记为过期，下次 cachedRead 会重新读取；旧值仍可用 stale 方式先画，
// 也不推进修订号，其他页面不会因为一次刷新而丢弃自己的结果。
export function refreshReadCache(namespace = '') {
  const prefix = namespace ? `${namespace}:` : '';
  for (const [key, entry] of entries) {
    if (prefix && !key.startsWith(prefix)) continue;
    if (entry.pending) continue;
    entries.set(key, { ...entry, ttl: 0 });
  }
}

export function readRevision(name = 'data') {
  return revisions.get(name) || 0;
}

// 退出登录 / 切换账号：内存与本地持久化一起清空，旧账号的数据不会在下个账号的首屏出现。
export function clearReadCache() {
  invalidatedAt.set('', ++sequence);
  entries.clear();
  removeStored(() => true);
}

function isFresh(entry) {
  return !entry.restored && Date.now() - entry.at < entry.ttl;
}

function lookup(key) {
  const hit = entries.get(key);
  if (hit) return hit;
  const restored = readStored(key);
  if (restored) entries.set(key, restored);
  return restored;
}

function store(key, value, { ttl, persist }) {
  const entry = { at: Date.now(), ttl, value, persist };
  entries.delete(key);
  entries.set(key, entry);
  if (persist) writeStored(key, entry);
  else removeStored((storedKey) => storedKey === key);
}

function dropNamespace(namespace) {
  const prefix = namespace ? `${namespace}:` : '';
  invalidatedAt.set(prefix, ++sequence);
  for (const key of [...entries.keys()]) {
    if (!prefix || key.startsWith(prefix)) entries.delete(key);
  }
  removeStored((key) => !prefix || key.startsWith(prefix));
}

function invalidatedSince(key, started) {
  for (const [prefix, at] of invalidatedAt) {
    if (at > started && (!prefix || key.startsWith(prefix))) return true;
  }
  return false;
}

function bumpRevision(name) {
  revisions.set(name, (revisions.get(name) || 0) + 1);
}

function trim() {
  if (entries.size <= MAX_ENTRIES) return;
  for (const [key, entry] of entries) {
    if (entries.size <= MAX_ENTRIES) break;
    if (!entry.pending) entries.delete(key);
  }
}

function storage() {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

function readStored(key) {
  const target = storage();
  if (!target) return null;
  try {
    const raw = target.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object' || Array.isArray(saved) || !Number.isFinite(saved.at) || saved.at > Date.now() || Date.now() - saved.at >= MAX_STALE_MS) {
      target.removeItem(STORAGE_PREFIX + key);
      return null;
    }
    return { at: saved.at, ttl: saved.ttl || 0, value: saved.value, persist: true, restored: true };
  } catch {
    return null;
  }
}

function writeStored(key, entry) {
  const target = storage();
  if (!target) return;
  try {
    const raw = JSON.stringify({ at: entry.at, ttl: entry.ttl, value: entry.value });
    if (raw.length > MAX_PERSIST_CHARS) { target.removeItem(STORAGE_PREFIX + key); return; }
    target.setItem(STORAGE_PREFIX + key, raw);
  } catch {
    // 配额不足或隐私模式：持久化只是加速，失败时保留内存缓存即可。
    try { target.removeItem(STORAGE_PREFIX + key); } catch { /* ignore */ }
  }
}

function removeStored(match) {
  const target = storage();
  if (!target) return;
  try {
    const keys = [];
    for (let index = 0; index < target.length; index += 1) {
      const name = target.key(index);
      if (name?.startsWith(STORAGE_PREFIX) && match(name.slice(STORAGE_PREFIX.length))) keys.push(name);
    }
    for (const name of keys) target.removeItem(name);
  } catch { /* ignore */ }
}
