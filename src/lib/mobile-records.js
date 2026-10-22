import { localDateTimeValue } from './localDateTime.js';
import { summarizeFeedingMeasurements } from '../services/feeding-analysis.service.js';
import { METRICS, metricValue, qualityLabel } from '../services/mobile-device.service.js';

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
    : { path: `/records/${encodeURIComponent(row.id)}`, query: { returnTo } };
}

// 每个页面实例持有此缓存；重新进入或切换账号即丢弃，补录/手动关闭后不复用旧边界。
// 缓存与读取都按酵种分键，切换酵种不会串到另一罐的轮次。
export function createRecordsLoader(api) {
  const days = new Map();
  function entry(day, starterId = '') {
    const key = `${day}:${starterId}`;
    if (!days.has(key)) days.set(key, { facts: [], exhausted: false, context: null, devices: null });
    return days.get(key);
  }
  return {
    clear() { days.clear(); },
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
    async marks(userId, now = new Date(), starterId = '', current = () => true) {
      const today = localDayKey(now); const start = new Date(`${today}T00:00:00`); start.setDate(start.getDate() - 13);
      const range = { from: start.toISOString(), to: recordDayRange(today).to };
      const result = {};
      for (let offset = 0; current(); offset += 200) {
        const batch = await api.listCareRecords({ userId, ...range, ...(starterId ? { starterId } : {}), offset, limit: 200 });
        if (!current()) return null;
        for (const row of batch) result[localDayKey(row.occurred_at)] = true;
        if (batch.length < 200) break;
      }
      return result;
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
        const results = await Promise.allSettled(starterIds.map(starterId => api.listStarterDeviceLinks({ userId, starterId })));
        const links = results.flatMap((result, index) => {
          if (result.status === 'rejected') { notices.push('部分设备关联读取失败，其他记录不受影响。'); return []; }
          return result.value.map(link => ({ ...link, starter_id: starterIds[index] })).filter(link => Date.parse(link.active_from) < Date.parse(range.to) && (!link.active_to || Date.parse(link.active_to) > Date.parse(range.from)));
        });
        if (!current()) return { links: [], samples: [], summaries: [], notices };
        const deviceIds = [...new Set(links.map(link => link.device_id))];
        const samples = []; const summaries = [];
        if (!deviceIds.length) return { links, samples, summaries, notices };
        const service = await api.mobileDeviceService();
        await Promise.all(deviceIds.map(async deviceId => {
          const to = new Date(Math.min(Date.parse(range.to), Date.now())).toISOString();
          if (Date.parse(to) - Date.parse(range.from) < 600000) { notices.push('当日设备时间范围不足十分钟，暂无法读取曲线摘要。'); return; }
          try {
            const result = await service.range(deviceId, { from: range.from, to });
            if (!current()) return;
            if (!result.complete) notices.push('部分设备采样未完整加载，摘要仅代表已读取数据。');
            for (const starterId of [...new Set(links.filter(link => link.device_id === deviceId).map(link => link.starter_id))]) {
              const related = links.filter(link => link.device_id === deviceId && link.starter_id === starterId);
              const rows = result.rows.filter(row => (!row.device_id || row.device_id === deviceId) && Date.parse(row.recorded_at) >= Date.parse(range.from) && Date.parse(row.recorded_at) < Date.parse(to) && related.some(link => Date.parse(row.recorded_at) >= Date.parse(link.active_from) && (!link.active_to || Date.parse(row.recorded_at) < Date.parse(link.active_to))));
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
    const link = devices?.links.find(link => link.starter_id === feeding.starter_id && Date.parse(link.active_from) <= Date.parse(feeding.occurred_at) && (!link.active_to || Date.parse(feeding.occurred_at) < Date.parse(link.active_to)));
    const summary = summarizeFeedingMeasurements({ feeding, link, measurements: devices?.samples.filter(row => row.starter_id === feeding.starter_id) || [], now, nextFeedingAt: next?.occurred_at, windowEndedAt: closure?.ended_at });
    return { ...feeding, summary, closure, boundaryPending: !context || context.closuresComplete === false || context.notices.some(notice => notice.includes('相邻喂养')) };
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
