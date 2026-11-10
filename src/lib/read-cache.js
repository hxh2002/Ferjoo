// 移动端读缓存：同一份数据一次加载后复用，写入或手动刷新时按命名空间失效。
// 键统一写成「命名空间:参数」；命名空间可带层级（如 care:records），便于整类清除。

const MAX_ENTRIES = 240;
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
// 失效时推进：读取过程中被写入或手动刷新打断的结果不再写回缓存。
let epoch = 0;

export function readCacheKey(parts) {
  return parts.map((part) => String(part ?? '')).join(':');
}

// 时间戳只按分钟参与键：设备采样本身按十分钟聚合，秒级差异不该造成重复读取。
export function cacheStamp(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? String(Math.floor(time / 60_000)) : String(value ?? '');
}

// 页面首屏可以先用缓存值立即渲染，再在后台确认是否过期。
export function peekReadCache(key) {
  const hit = entries.get(key);
  if (!hit || hit.pending) return undefined;
  return Date.now() - hit.at < hit.ttl ? hit.value : undefined;
}

// cacheable：返回 false 的结果（例如带错误标记的部分读取）不写入缓存，下次访问会重新读取。
export function cachedRead(key, loader, { ttl = READ_TTL.records, cacheable = () => true } = {}) {
  const hit = entries.get(key);
  // 同一份数据正在读取时共享同一个 Promise，避免并发重复请求。
  if (hit?.pending) return hit.pending;
  if (hit && Date.now() - hit.at < hit.ttl) return Promise.resolve(hit.value);
  const startEpoch = epoch;
  const pending = Promise.resolve()
    .then(loader)
    .then(
      (value) => {
        entries.delete(key);
        // 读取期间发生过写入或手动刷新时，这份结果可能已经过期，直接丢弃。
        if (epoch === startEpoch && cacheable(value)) entries.set(key, { at: Date.now(), ttl, value });
        trim();
        return value;
      },
      (error) => {
        entries.delete(key);
        throw error;
      }
    );
  entries.set(key, { at: 0, ttl, value: undefined, pending });
  trim();
  return pending;
}

// 写入或手动刷新后调用：清掉对应命名空间，并推进全局修订号供页面判断是否需要重读。
export function invalidateReadCache(namespace = '') {
  epoch += 1;
  const prefix = namespace ? `${namespace}:` : '';
  for (const key of [...entries.keys()]) {
    if (!prefix || key.startsWith(prefix)) entries.delete(key);
  }
  bumpRevision(namespace || 'data');
  if (namespace !== 'data') bumpRevision('data');
}

export function readRevision(name = 'data') {
  return revisions.get(name) || 0;
}

export function clearReadCache() {
  epoch += 1;
  entries.clear();
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
