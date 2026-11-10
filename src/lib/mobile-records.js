import { localDateTimeValue } from './localDateTime.js';
import { summarizeFeedingMeasurements } from '../services/feeding-analysis.service.js';
import { BUCKET_MS, METRICS, metricValue, qualityLabel } from '../services/mobile-device.service.js';
import { readCacheKey, readRevision } from './read-cache.js';
import { READ_MESSAGES } from './read-errors.js';
import { clipWindows, linkCoveringInstant, rowInWindows, starterWindows } from './starter-link-windows.js';
import { roundDeviceWindows, starterRoundDeviceWindows } from './round-device-attribution.js';

// 轮次证据读取较重：同一次修订内跨页面复用，写入后修订号变化自然换键。
export function feedingEvidenceCacheKey(userId, starterId, feedingId) {
  return readCacheKey(['care', 'record', 'evidence', readRevision(), userId, starterId, feedingId]);
}

export const RECORD_PAGE_SIZE = 40;
export const localDayKey = (value = new Date()) => localDateTimeValue(new Date(value)).slice(0, 10);
export function validLocalDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return Number.isFinite(date.getTime()) && localDayKey(date) === value;
}
export function recentRecordDays(now = new Date()) {
  return Array.from({ length: 14 }, (_, index) => {
    const day = new Date(now); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() - 13 + index);
    return localDayKey(day);
  });
}
export function formatDoctorRound(row, { elapsedHours, closed = false } = {}) {
  const time = new Date(row?.occurred_at);
  const clock = Number.isFinite(time.getTime()) ? `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}` : '--:--';
  const ratio = row?.ratio === 'deep_reset'
    ? '大比例刷新'
    : (typeof row?.ratio === 'string' && row.ratio ? row.ratio.split(':').join(' : ') : '比例未记录');
  const elapsed = Number(elapsedHours);
  const duration = Number.isFinite(elapsed) && elapsed >= 0 ? `${elapsed >= 10 ? Math.round(elapsed) : Math.round(elapsed * 10) / 10} 小时` : '';
  return { title: `${clock} 喂养`, detail: [closed ? '已结束' : '喂养记录', ratio, duration].filter(Boolean).join(' · ') };
}
export function recordDayRange(day) {
  const start = new Date(`${day}T00:00:00`);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}
export function normalizeRecordsQuery(query, now = new Date()) {
  const today = localDayKey(now);
  const day = [query.from, query.to].find(value => validLocalDay(value) && value <= today) || today;
  const page = Number(query.page);
  const normalized = { from: day, to: day, page: String(Number.isSafeInteger(page) && page > 0 && page <= 500 ? page : 1) };
  // 记录页只按单只酵种查看，无效或缺失的 starter 由页面回落到默认酵种后回写。
  const starter = typeof query.starter === 'string' ? query.starter.trim() : '';
  if (/^[A-Za-z0-9_-]{1,64}$/.test(starter)) normalized.starter = starter;
  const scroll = Number(query.scroll);
  if (typeof query.scroll === 'string' && Number.isFinite(scroll) && scroll >= 0) normalized.scroll = String(scroll);
  return normalized;
}
export function recordsDetailTarget(row, returnTo) {
  return row.kind === 'device'
    ? { path: `/devices/${encodeURIComponent(row.device_id)}/trend`, query: { starter: row.starter_id, day: row.day, returnTo } }
    : { path: `/diary/records/${encodeURIComponent(row.id)}`, query: { returnTo } };
}
export const CLOSE_REASON_LABELS = { fallen: '峰值后回落', no_peak: '未见明显峰值', abnormal: '中途异常', record_only: '手动结束记录' };
// 轮次状态与设备观测质量分开：数据中断只降低可信度，不代表发酵结束。
export function roundState(summary = {}) {
  if (summary.windowStatus === 'closed') {
    return summary.windowEndReason === 'manual'
      ? { label: '手动结束', tone: 'closed' }
      : { label: '已结束', tone: 'closed' };
  }
  if (summary.baselineStatus === 'pending') return { label: '基线计算中', tone: 'pending' };
  if (summary.dataQuality === 'stale') return { label: '数据中断', tone: 'pending' };
  if (summary.dataQuality === 'insufficient' || summary.dataQuality === 'partial') return { label: '数据不足', tone: 'pending' };
  return { label: '进行中', tone: 'active' };
}

// 每个页面实例持有此缓存；重新进入或切换账号即丢弃，补录/手动关闭后不复用旧边界。
// 缓存与读取都按酵种分键，切换酵种不会串到另一罐的轮次。
// 采样与事实分页独立：正式数据标记只来自酵种关联设备的有效发酵采样。
export function formalMeasurementDays(rows = [], links = [], range = {}) {
  const from = Date.parse(range.from);
  const to = Date.parse(range.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return {};
  // 正式采样只认该酵种全部历史关联窗口（含已关闭、含重绑后的多段窗口）内、设备一致的有效发酵采样。
  const windows = starterWindows(links);
  const result = {};
  for (const row of rows) {
    const at = Date.parse(row.recorded_at);
    if (!Number.isFinite(at) || at < from || at >= to || row.mode !== 'fer' || row.sensor_error) continue;
    if (!rowInWindows(row, windows)) continue;
    result[localDayKey(at)] = true;
  }
  return result;
}

// 采样服务的有效范围至少为十分钟，早于这个范围不发起无效请求。
export function markReadRange(from, to) {
  const start = Date.parse(from);
  const end = Math.min(Date.parse(to), Date.now());
  if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < BUCKET_MS) return null;
  return { from: new Date(start).toISOString(), to: new Date(end).toISOString() };
}

export function createRecordsLoader(api) {
  const days = new Map();
  const marks = new Map();
  function entry(day, starterId = '') {
    const key = `${day}:${starterId}`;
    if (!days.has(key)) days.set(key, { facts: [], exhausted: false, context: null, devices: null });
    return days.get(key);
  }
  return {
    clear() { days.clear(); marks.clear(); },
    async facts(userId, day, page, starterId = '', current = () => true) {
      const state = entry(day, starterId); const needed = page * RECORD_PAGE_SIZE + 1;
      const range = recordDayRange(day);
      while (!state.exhausted && state.facts.length < needed && current()) {
        const limit = Math.min(200, needed - state.facts.length);
        const batch = await api.listCareRecords({ userId, ...range, ...(starterId ? { starterId } : {}), offset: state.facts.length, limit, ascending: true });
        if (!current()) return null;
        state.facts.push(...batch); state.exhausted = batch.length < limit;
      }
      return { rows: state.facts.slice(0, page * RECORD_PAGE_SIZE), hasMore: state.facts.length > page * RECORD_PAGE_SIZE };
    },
    async marks(userId, visibleRange = {}, starterId = '', current = () => true) {
      const range = markReadRange(visibleRange.from, visibleRange.to);
      if (!range || !current()) return {};
      const key = JSON.stringify([starterId, range.from, range.to]);
      if (!marks.has(key)) {
        const pending = (async () => {
          // 共享设备的轮次交接需要其他酵种的喂养与关联，因此两者都按账号读取，再按酵种归属裁剪。
          const listFeedings = async () => {
            const rows = [];
            for (let offset = 0; current(); offset += 200) {
              const batch = await api.listCareRecords({ userId, kind: 'feeding', limit: 200, offset, ascending: true });
              rows.push(...batch);
              if (batch.length < 200) break;
            }
            return rows;
          };
          const [links, feedings] = await Promise.all([
            api.listStarterDeviceLinks({ userId }),
            listFeedings()
          ]);
          const closures = await api.loadWindowClosures(userId, feedings.map((row) => row.id));
          // 日历标记只认某一轮实际归属，不认仅存在于设置页的共享设备关联。
          const rounds = starterRoundDeviceWindows(links, { starterId, feedings, closures });
          const visible = clipWindows(rounds, Date.parse(range.from), Date.parse(range.to))
            .filter(window => window.to - window.from >= BUCKET_MS);
          if (!visible.length) return {};
          const service = await api.mobileDeviceService();
          const result = {};
          let failures = 0;
          await Promise.all(visible.map(async window => {
            try {
              const data = await service.range(window.deviceId, { from: new Date(window.from).toISOString(), to: new Date(window.to).toISOString(), ...(starterId ? { starterId } : {}) });
              if (!current()) return;
              if (data?.error) { failures += 1; return; }
              // 轮次窗口是裁剪后的 [from, to)；还原成关联形状，让正式采样按这一段归属判定。
              const roundLink = { starter_id: window.starterId, device_id: window.deviceId, active_from: new Date(window.from).toISOString(), active_to: new Date(window.to).toISOString() };
              Object.assign(result, formalMeasurementDays(data.rows, [roundLink], range));
            } catch {
              // 单段窗口失败不清空其他窗口的日期标记；失败数通过 failures 暴露，且不缓存，下次进入重试。
              failures += 1;
            }
          }));
          Object.defineProperty(result, 'failures', { value: failures, enumerable: false });
          return current() ? result : null;
        })();
        marks.set(key, pending);
        pending.catch(() => { if (marks.get(key) === pending) marks.delete(key); });
        pending.then((value) => { if (value?.failures && marks.get(key) === pending) marks.delete(key); }, () => {});
      }
      return marks.get(key);
    },
    context(userId, day, starterId = '', current = () => true) {
      const state = entry(day, starterId);
      if (state.context && !state.contextComplete && !state.contextCurrent()) state.context = null;
      if (!state.context) {
        state.contextCurrent = current;
        state.context = (async () => {
        const range = recordDayRange(day);
        const notices = [];
        const feedings = [];
        // 一次读取当天喂养索引；与事实分页独立，分页外相邻喂养也能正确截断轮次。
        for (let offset = 0; current(); offset += 200) {
          const batch = await api.listCareRecords({ userId, ...range, ...(starterId ? { starterId } : {}), kind: 'feeding', limit: 200, offset, ascending: true });
          feedings.push(...batch);
          if (batch.length < 200) break;
        }
        const ids = [...new Set([...(starterId ? [starterId] : []), ...feedings.map(row => row.starter_id)])];
        await Promise.all(ids.map(async id => {
          const adjacent = await Promise.allSettled([
            api.listCareRecords({ userId, starterId: id, kind: 'feeding', to: range.from, limit: 1, offset: 0 }),
            api.listCareRecords({ userId, starterId: id, kind: 'feeding', from: range.to, limit: 1, offset: 0, ascending: true })
          ]);
          for (const result of adjacent) {
            if (result.status === 'fulfilled') feedings.push(...result.value);
            else notices.push('部分相邻喂养未读到，轮次边界暂不完整。');
          }
        }));
        const closures = []; let closuresComplete = true;
        for (let offset = 0; offset < feedings.length && current(); offset += 200) {
          try { closures.push(...await api.loadWindowClosures(userId, feedings.slice(offset, offset + 200).map(row => row.id))); }
          catch { closuresComplete = false; notices.push('手动结束信息暂不可用，轮次结束状态待核实。'); }
        }
        if (current()) state.contextComplete = true;
        return { feedings, closures, closuresComplete, notices: [...new Set(notices)] };
        })();
      }
      return state.context;
    },
    devices(userId, day, starterIds = [], current = () => true) {
      const state = entry(day, [...starterIds].sort().join(','));
      if (!state.devices) state.devices = (async () => {
        const range = recordDayRange(day); const notices = [];
        // 先读取当天上下文及相邻轮次，设备数据按完整轮次而非设置页的共享关联裁剪。
        const context = await this.context(userId, day, starterIds[0] || '', current);
        const feedings = context.feedings;
        const results = await Promise.allSettled(starterIds.map(starterId => api.listStarterDeviceLinks({ userId, starterId })));
        const links = results.flatMap((result, index) => {
          if (result.status === 'rejected') { notices.push('部分设备关联读取失败，其他记录不受影响。'); return []; }
          return result.value.map(link => ({ ...link, starter_id: starterIds[index] })).filter(link => Date.parse(link.active_from) < Date.parse(range.to) && (!link.active_to || Date.parse(link.active_to) > Date.parse(range.from)));
        });
        if (!current()) return { links: [], samples: [], summaries: [], notices };
        const attributedLinks = starterIds.flatMap((starterId) => starterRoundDeviceWindows(links, {
          starterId, feedings, closures: context.closures || []
        }));
        const deviceIds = [...new Set(attributedLinks.map(link => link.device_id))];
        const samples = []; const summaries = [];
        if (!deviceIds.length) return { links, samples, summaries, notices };
        const service = await api.mobileDeviceService();
        await Promise.all(deviceIds.map(async deviceId => {
          const to = new Date(Math.min(Date.parse(range.to), Date.now())).toISOString();
          if (Date.parse(to) - Date.parse(range.from) < 600000) { notices.push('当日设备时间范围不足十分钟，暂无法读取曲线摘要。'); return; }
          try {
            const result = await service.range(deviceId, { from: range.from, to });
            if (!current()) return;
            // 登录过期 / 无权限 / 空数据是三种不同情况：不能都说成「没有数据」。
            if (result.error) notices.push(result.errorKind === 'auth' ? READ_MESSAGES.authExpired : result.errorKind === 'denied' ? READ_MESSAGES.deniedHistory : '部分设备数据读取失败，喂养与观察记录不受影响。');
            else if (!result.complete) notices.push('部分设备采样未完整加载，摘要仅代表已读取数据。');
            for (const starterId of [...new Set(attributedLinks.filter(link => link.deviceId === deviceId).map(link => link.starterId))]) {
              const related = attributedLinks.filter(link => link.deviceId === deviceId && link.starterId === starterId);
              const rows = result.rows.filter(row => (!row.device_id || row.device_id === deviceId) && Date.parse(row.recorded_at) >= Date.parse(range.from) && Date.parse(row.recorded_at) < Date.parse(to) && rowInWindows({ ...row, device_id: deviceId }, related));
              samples.push(...rows.map(row => ({ ...row, device_id: deviceId, starter_id: starterId })));
              summaries.push({ id: `device:${starterId}:${deviceId}:${day}`, kind: 'device', starter_id: starterId, device_id: deviceId, day, samples: rows, partial: !result.complete });
            }
          } catch { notices.push('部分设备数据读取失败，喂养与观察记录不受影响。'); }
        }));
        return { links, samples, summaries, notices: [...new Set(notices)] };
      })();
      return state.devices;
    }
  };
}

export function recordsDayModel({ day, facts = [], context, devices, now = Date.now() }) {
  const { from, to } = recordDayRange(day);
  const feedings = [...new Map([...(context?.feedings || []), ...facts.filter(row => row.kind === 'feeding')].map(row => [row.id, row])).values()].sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at) || String(a.id).localeCompare(String(b.id)));
  const closures = new Map((context?.closures || []).map(row => [row.feeding_id, row]));
  function round(feeding) {
    const index = feedings.indexOf(feeding);
    const next = feedings.slice(index + 1).find(row => row.starter_id === feeding.starter_id);
    const closure = closures.get(feeding.id);
    // 轮次归属取该酵种的全部关联窗口（含已关闭、重绑后的多段）：窗口可以晚于喂养时刻开始。
    const starterLinks = (devices?.links || []).filter(link => link.starter_id === feeding.starter_id);
    const fedAt = Date.parse(feeding.occurred_at);
    const attributed = roundDeviceWindows(starterLinks, { feeding, feedings, nextFeedingAt: next?.occurred_at, windowEndedAt: closure?.ended_at, now });
    const link = linkCoveringInstant(starterLinks, feeding.occurred_at, { starterId: feeding.starter_id }) || attributed[0];
    const summary = summarizeFeedingMeasurements({ feeding, link, links: attributed, measurements: devices?.samples.filter(row => row.starter_id === feeding.starter_id) || [], now, nextFeedingAt: next?.occurred_at, windowEndedAt: closure?.ended_at });
    return { ...feeding, summary, closure, deviceId: link?.device_id || '', linked: !!link, boundaryPending: !context || context.closuresComplete === false || context.notices.some(notice => notice.includes('相邻喂养')) };
  }
  const events = facts.map(row => row.kind === 'feeding' ? round(feedings.find(item => item.id === row.id)) : row);
  const continuations = feedings.filter(row => Date.parse(row.occurred_at) < Date.parse(from)).map(round).filter(row => !row.summary.windowClosedAt || Date.parse(row.summary.windowClosedAt) > Date.parse(from));
  return {
    events, continuations,
    feedingCount: context ? feedings.filter(row => Date.parse(row.occurred_at) >= Date.parse(from) && Date.parse(row.occurred_at) < Date.parse(to)).length : facts.filter(row => row.kind === 'feeding').length,
    devices: devices?.summaries || []
  };
}
export function recordDeviceMetrics(samples) {
  return Object.entries(METRICS).flatMap(([key, metric]) => {
    const values = samples.filter(row => qualityLabel(row, key) === '有效采样').map(row => metricValue(row, key));
    if (!values.length) return [];
    const min = Math.min(...values); const max = Math.max(...values);
    return `${metric.label} ${min.toFixed(1)}${min === max ? '' : `–${max.toFixed(1)}`}${metric.unit}`;
  }).join(' · ') || '暂无有效指标，缺测/休眠/故障样本不作为数值结论';
}
