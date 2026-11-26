// 后台观察只汇总已入库的 analytics_events，不另建表。停留来自事件属性里的 duration_ms。

export const ANALYTICS_SUMMARY_LIMIT = 1000;

const RANGE_MS = { '24h': 24 * 60 * 60 * 1000, '7d': 7 * 24 * 60 * 60 * 1000, '30d': 30 * 24 * 60 * 60 * 1000 };

export const PAGE_LABELS = {
  device: '设备',
  device_trend: '设备数据',
  diary: '日记',
  record_detail: '阶段详情',
  doctor: '酵种医生',
  doctor_records: '诊断记录',
  report: '诊断报告',
  feeding: '记录喂养',
  devices: '设备绑定',
  me: '我的',
  notifications: '通知设置',
  unknown: '未标记页面'
};

export const EVENT_LABELS = {
  page_view: '页面停留',
  trend_page_view: '设备数据停留',
  trend_calendar_toggled: '设备数据日历',
  trend_day_selected: '设备数据选择日期',
  diary_date_selected: '日记选择日期',
  diary_calendar_toggled: '日记日历',
  diary_month_changed: '日记切换月份',
  diary_month_picker_opened: '日记打开月历',
  feeding_saved: '保存喂养',
  height_alert_targets_saved: '保存高度提醒',
  height_alert_push_changed: '开关高度推送',
  height_alert_peak_saved: '保存峰值提醒',
  feeding_gap_alert_saved: '保存喂养天数提醒',
  doctor_diagnosis_generated: '生成诊断'
};

const PROPERTY_LABELS = {
  duration_ms: '停留',
  exit_reason: '离开方式',
  day: '日期',
  previous_day: '之前的日期',
  device_id: '设备',
  starter_id: '酵种',
  enabled: '开关',
  source: '来源',
  expanded: '日历展开',
  is_today: '是否今天'
};

const EXIT_LABELS = {
  route: '切换页面',
  background: '切到后台',
  pagehide: '关闭页面',
  account: '切换账号',
  logout: '退出登录'
};

const EVENT_NAME = /^[a-z][a-z0-9_]{1,79}$/;
const PAGE_NAME = /^[a-z][a-z0-9_/-]{0,79}$/;

export function analyticsSince(range, now = Date.now()) {
  const span = RANGE_MS[range] || RANGE_MS['7d'];
  return new Date(now - span).toISOString();
}

export function analyticsFilter(value, kind) {
  const pattern = kind === 'page' ? PAGE_NAME : EVENT_NAME;
  return typeof value === 'string' && pattern.test(value) ? value : '';
}

export function pageLabel(page) {
  return PAGE_LABELS[page] || page || '未标记页面';
}

export function eventLabel(name) {
  return EVENT_LABELS[name] || name || '未命名事件';
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  if (ms < 1000) return '不足 1 秒';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest ? `${minutes} 分 ${rest} 秒` : `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours} 小时 ${mins} 分` : `${hours} 小时`;
}

export function eventDurationMs(row) {
  const value = Number(row?.properties?.duration_ms);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function summarizeAnalytics(rows = []) {
  const users = new Set();
  const byPage = new Map();
  const byEvent = new Map();
  let dwellVisits = 0;
  let dwellMs = 0;
  for (const row of rows) {
    if (row?.user_id) users.add(row.user_id);
    const eventName = row?.event_name || 'unknown';
    const event = byEvent.get(eventName) || { event: eventName, count: 0, users: new Set() };
    event.count += 1;
    if (row?.user_id) event.users.add(row.user_id);
    byEvent.set(eventName, event);
    const duration = eventDurationMs(row);
    if (duration == null) continue;
    dwellVisits += 1;
    dwellMs += duration;
    const page = row.page || 'unknown';
    const bucket = byPage.get(page) || { page, visits: 0, users: new Set(), durationMs: 0 };
    bucket.visits += 1;
    bucket.durationMs += duration;
    if (row.user_id) bucket.users.add(row.user_id);
    byPage.set(page, bucket);
  }
  return {
    events: rows.length,
    users: users.size,
    dwellVisits,
    dwellMs,
    averageMs: dwellVisits ? dwellMs / dwellVisits : 0,
    pages: [...byPage.values()]
      .map((bucket) => ({ page: bucket.page, visits: bucket.visits, users: bucket.users.size, durationMs: bucket.durationMs }))
      .sort((a, b) => b.durationMs - a.durationMs || b.visits - a.visits),
    eventCounts: [...byEvent.values()]
      .map((bucket) => ({ event: bucket.event, count: bucket.count, users: bucket.users.size }))
      .sort((a, b) => b.count - a.count || a.event.localeCompare(b.event))
  };
}

export function describeProperties(properties = {}) {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return [];
  return Object.entries(properties)
    .filter(([key]) => key !== 'duration_seconds' && !/password|token|secret|invite|api_key/i.test(key))
    .map(([key, value]) => ({
      label: PROPERTY_LABELS[key] || key,
      value: key === 'duration_ms'
        ? formatDuration(Number(value))
        : key === 'exit_reason'
          ? (EXIT_LABELS[value] || String(value ?? '—'))
          : key === 'enabled' || key === 'expanded' || key === 'is_today'
            ? (value ? '是' : '否')
            : value == null || value === ''
              ? '—'
              : typeof value === 'object'
                ? JSON.stringify(value).slice(0, 180)
                : String(value)
    }));
}
