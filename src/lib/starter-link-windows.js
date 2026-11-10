// 酵种 ↔ 设备关联时间窗的共享工具。
//
// 设备测量只带 device_id，酵种的归属完全靠 starter_device_links 的 [active_from, active_to) 推断。
// 换绑 / 解绑 / 重绑会不断关闭旧窗口、新增窗口：历史口径必须取「该酵种全部历史窗口」的并集，
// 而不是只看当前活跃关联；只有「实时」展示才使用活跃关联。
//
// 约定：
// - 窗口为左闭右开 [from, to)，to = Infinity 表示仍在关联中；
// - 窗口按 device_id + starter_id 合并（重叠或首尾相接合并为一段）；
// - 多个酵种可以同时关联同一设备，各自窗口均有效；设备采样按各酵种自己的关联窗口读取。
//   windowsExcludingOthers 仅为旧版排他关联流程保留，新流程使用 starterWindows。

export const FRESH_GAP_MS = 40 * 60 * 1000;

const time = (value) => (value == null || value === '' ? NaN : new Date(value).getTime());
const iso = (ms) => new Date(ms).toISOString();

/** 一条关联记录转成窗口；缺设备、起点非法或零长度（to <= from）的记录返回 null。 */
export function linkWindow(link) {
  const from = time(link?.active_from);
  const to = link?.active_to == null ? Infinity : time(link.active_to);
  if (!link?.device_id || !Number.isFinite(from) || Number.isNaN(to) || !(to > from)) return null;
  return { deviceId: String(link.device_id), starterId: link.starter_id ?? null, from, to, links: [link] };
}

/** 按 device_id + starter_id 合并重叠 / 首尾相接的窗口，结果按起点升序。 */
export function mergeWindows(windows) {
  const groups = new Map();
  for (const window of windows || []) {
    if (!window) continue;
    const key = `${window.deviceId}\u0000${window.starterId ?? ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(window);
  }
  const merged = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.from - b.from || a.to - b.to);
    let current = null;
    for (const window of group) {
      if (current && window.from <= current.to) {
        current.to = Math.max(current.to, window.to);
        current.links = [...current.links, ...window.links];
      } else {
        current = { ...window, links: [...window.links] };
        merged.push(current);
      }
    }
  }
  return merged.sort((a, b) => a.from - b.from || a.to - b.to || a.deviceId.localeCompare(b.deviceId));
}

/**
 * 该酵种的全部历史窗口（含已关闭窗口）。
 * starterId 为 undefined 时不按酵种过滤；为字符串/null 时，记录自带的 starter_id 不一致则丢弃。
 */
export function starterWindows(links, { starterId, deviceId } = {}) {
  const windows = [];
  for (const link of links || []) {
    if (starterId !== undefined && link?.starter_id && link.starter_id !== starterId) continue;
    if (deviceId && link?.device_id !== deviceId) continue;
    windows.push(linkWindow(link));
  }
  return mergeWindows(windows);
}

/** 扣除同设备上其他酵种的窗口：重叠的部分只属于对方（防御本地回退或时钟边界造成的重叠）。 */
export function subtractWindows(windows, foreign) {
  const result = [];
  for (const window of windows || []) {
    let pieces = [{ ...window }];
    for (const other of foreign || []) {
      if (other.deviceId !== window.deviceId) continue;
      pieces = pieces.flatMap((piece) => {
        if (other.to <= piece.from || other.from >= piece.to) return [piece];
        const parts = [];
        if (other.from > piece.from) parts.push({ ...piece, to: other.from });
        if (other.to < piece.to) parts.push({ ...piece, from: other.to });
        return parts;
      });
    }
    result.push(...pieces);
  }
  return result;
}

/** 某个酵种的历史窗口，且不含同设备上其他酵种占用的时段。links 为账号下全部关联（至少包含该酵种与相关设备）。 */
export function windowsExcludingOthers(links, starterId) {
  const own = starterWindows(links, { starterId });
  const others = mergeWindows((links || []).filter((link) => link?.starter_id && link.starter_id !== starterId).map(linkWindow));
  return subtractWindows(own, others);
}

export const currentLink = (links, starterId) => (links || []).find((link) => link?.active_to == null && (starterId === undefined || link.starter_id === starterId)) || null;
export const hasLinkHistory = (links, starterId) => (links || []).some((link) => link?.starter_id === starterId);
export const windowCovers = (window, at) => at >= window.from && at < window.to;

/** 覆盖某个时刻（可限定设备）的窗口里的第一条关联记录。 */
export function linkCoveringInstant(links, instant, { starterId, deviceId } = {}) {
  const at = time(instant);
  if (!Number.isFinite(at)) return null;
  const candidates = (links || []).filter((link) => {
    const window = linkWindow(link);
    return window && windowCovers(window, at)
      && (starterId === undefined || !link.starter_id || link.starter_id === starterId)
      && (!deviceId || link.device_id === deviceId);
  });
  return candidates.sort((a, b) => time(b.active_from) - time(a.active_from))[0] || null;
}

/** 与 [from, to] 有交集的窗口（to 为闭区间，便于「此刻」落在窗口起点的情形）。 */
export function windowsOverlapping(windows, from, to = Infinity) {
  return (windows || []).filter((window) => window.from <= to && window.to > from);
}

/** 把窗口裁剪到 [from, to)，丢弃空窗口。 */
export function clipWindows(windows, from, to) {
  return (windows || []).flatMap((window) => {
    const start = Math.max(window.from, from);
    const end = Math.min(window.to, to);
    return end > start ? [{ ...window, from: start, to: end }] : [];
  });
}

/** 采样行是否落在任一窗口内；行自带 device_id 时必须与窗口设备一致。 */
export function rowInWindows(row, windows) {
  const at = time(row?.recorded_at);
  if (!Number.isFinite(at)) return false;
  return (windows || []).some((window) => (!row.device_id || row.device_id === window.deviceId) && windowCovers(window, at));
}

export function filterRowsByWindows(rows, windows, { from = -Infinity, to = Infinity } = {}) {
  return (rows || []).filter((row) => {
    const at = time(row?.recorded_at);
    return Number.isFinite(at) && at >= from && at < to && rowInWindows(row, windows);
  });
}

/** [from, to) 内没有任何窗口覆盖的缺口（跨设备取并集）。 */
export function coverageGaps(windows, from, to) {
  if (!(to > from)) return { gaps: [], gapMs: 0, firstCoveredAt: null };
  const covered = clipWindows(windows, from, to).sort((a, b) => a.from - b.from);
  const gaps = [];
  let cursor = from;
  for (const window of covered) {
    if (window.from > cursor) gaps.push({ from: cursor, to: window.from });
    cursor = Math.max(cursor, window.to);
  }
  if (cursor < to) gaps.push({ from: cursor, to });
  return { gaps, gapMs: gaps.reduce((sum, gap) => sum + (gap.to - gap.from), 0), firstCoveredAt: covered[0]?.from ?? null };
}

/**
 * 读取计划：每个合并窗口与 [from, to) 的交集各读一次（只读该酵种自己的时段，不读空窗期或别的酵种时段）。
 * 返回 { deviceId, starterId, from, to, windows }：from / to 为 ISO，to 为闭区间终点（窗口终点减 1 毫秒，保持右开）。
 */
export function readPlans(windows, { from, to }) {
  return clipWindows(windows, from, to)
    .sort((a, b) => a.from - b.from)
    .map((window) => ({ deviceId: window.deviceId, starterId: window.starterId, from: iso(window.from), to: iso(window.to - 1), windows: [window] }));
}

/** 一个酵种在某设备上是否有任何历史窗口。 */
export const hasWindowOnDevice = (windows, deviceId) => (windows || []).some((window) => window.deviceId === deviceId);
