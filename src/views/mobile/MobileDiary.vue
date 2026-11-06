<script>
const listPositions = new Map();
</script>

<script setup>
import { computed, nextTick, onActivated, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { listCareRecords, listStarters } from '../../services/care.service.js';
import MWheelPicker from '../../components/mobile/MWheelPicker.vue';
import doctorIcon from '../../assets/icons/diary-doctor.svg';
import doctorChevron from '../../assets/icons/diary-chevron.svg';
import calendarIcon from '../../assets/icons/diary-calendar.svg';

import { listStarterDeviceLinks } from '../../services/starter-device.service.js';
import { mobileDeviceService } from '../../services/mobile-device.service.js';
import { loadWindowClosures } from '../../services/fermentation-window.service.js';
import {
  createRecordsLoader, normalizeRecordsQuery, recentRecordDays, recordsDayModel,
  recordsDetailTarget, roundState, validLocalDay
} from '../../lib/mobile-records.js';
import { readSelectedStarter, rememberSelectedStarter } from '../../lib/mobile-selection.js';
import { readRevision } from '../../lib/read-cache.js';

const route = useRoute();
const router = useRouter();
const auth = useAuth();
defineOptions({ name: 'MobileDiary' });

const starters = ref([]);
const model = ref(null);
const marks = ref({});
const loading = ref(false);
const error = ref('');
const notice = ref('');
const hasMore = ref(false);
const scrollY = ref(0);
const datePanelRef = ref(null);
const calendarOpen = ref(false);
const calendarMonth = ref(Date.now());
const monthPicker = ref(false);

const loader = createRecordsLoader({ listCareRecords, listStarterDeviceLinks, loadWindowClosures, mobileDeviceService });
const accountId = computed(() => auth.user.value?.id || '');
const queryText = (key) => typeof route.query[key] === 'string' ? route.query[key] : '';

function pad(value) {
  return String(value).padStart(2, '0');
}
function formatClock(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : '--';
}
function durationText(fromMs, toMs) {
  const minutes = Math.max(0, Math.round((toMs - fromMs) / 60000));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} 小时 ${minutes % 60} 分钟` : `${minutes} 分钟`;
}
// 跨天偏移以所选日期为基准：同一轮的两端各自标 +/- 天，避免只看轮次内部差值。
function dayOffsetText(ms) {
  const date = new Date(ms);
  const base = new Date(`${selectedDay.value}T00:00:00`);
  const offset = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - base) / 86400000);
  return offset ? `${offset > 0 ? '+' : '−'}${Math.abs(offset)}` : '';
}
function rangeText(fromMs, toMs) {
  const fromDate = new Date(fromMs);
  const toDate = new Date(toMs);
  return {
    from: formatClock(fromMs), to: formatClock(toMs),
    fromOffset: dayOffsetText(fromMs), toOffset: dayOffsetText(toMs),
    title: `${fromDate.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} – ${toDate.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
  };
}
// 在线时长与采样数只作为文字摘要留在一级页面，曲线统一放进各轮次与数据明细。
function onlineText(fromMs, toMs) {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return '不足 1 分钟';
  return durationText(fromMs, toMs);
}
function ratioText(value) {
  return value === 'deep_reset' ? '大比例刷新' : value || '比例未记录';
}
function starterName(id) {
  return starters.value.find((item) => item.id === id)?.name || '名称不可用';
}
function metric(value) {
  return Number(value).toFixed(1);
}

// 旧链接里的 type/starter/page 等参数由规范化统一收敛，避免空白页。
const query = computed(() => normalizeRecordsQuery(route.query));
// 记录页的读取与查询回写只在本页进行：离开后 query 会变，否则会把用户顶回记录页。
const onRecordsPage = () => route.name === 'mobile-diary';
const selectedDay = computed(() => query.value.from);
const page = computed(() => Number(query.value.page) || 1);
const selectedStarterId = computed(() => query.value.starter || '');
const selectedStarterName = computed(() => starters.value.find((item) => item.id === selectedStarterId.value)?.name || '');
const todayKey = computed(() => recentRecordDays().at(-1));
const isToday = computed(() => selectedDay.value === todayKey.value);
const dayHeading = computed(() => {
  const date = new Date(`${selectedDay.value}T12:00:00`);
  return Number.isFinite(date.getTime()) ? `${date.getMonth() + 1} 月 ${date.getDate()} 日` : '';
});
const feedingCaption = computed(() => `当天喂养 · ${model.value?.feedingCount || 0} 次`);
const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
function shiftDate(value, amount) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}
// 收起态以所选日期为中心，前后各 3 天；切周时整窗移动 7 天。
const compactDays = computed(() => Array.from({ length: 7 }, (_, index) => shiftDate(selectedDay.value, index - 3)));
const calendarTitle = computed(() => {
  const date = calendarOpen.value ? new Date(calendarMonth.value) : new Date(`${selectedDay.value}T12:00:00`);
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`;
});
const dateCells = computed(() => {
  const today = recentRecordDays().at(-1);
  let values = compactDays.value;
  if (calendarOpen.value) {
    const date = new Date(calendarMonth.value);
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const lead = (first.getDay() + 6) % 7;
    const count = Math.ceil((lead + new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()) / 7) * 7;
    values = Array.from({ length: count }, (_, index) => dateKey(new Date(date.getFullYear(), date.getMonth(), 1 - lead + index)));
  }
  return values.map((value) => {
    const date = new Date(`${value}T12:00:00`);
    return { value, day: date.getDate(), weekday: '一二三四五六日'[(date.getDay() + 6) % 7],
      off: calendarOpen.value && date.getMonth() !== new Date(calendarMonth.value).getMonth(),
      today: value === today, future: value > today };
  });
});
const weekdayColumns = computed(() => {
  if (!calendarOpen.value) {
    return compactDays.value.map((value, index) => ({
      label: '一二三四五六日'[(new Date(`${value}T12:00:00`).getDay() + 6) % 7],
      column: index + 1,
      key: value
    }));
  }
  return Array.from('一二三四五六日', (label, index) => ({ label, column: index + 1, key: label }));
});
const weekStripRef = ref(null);
const dateGridRef = ref(null);
let panelAnimation;
const positionKey = () => JSON.stringify([accountId.value, selectedStarterId.value, selectedDay.value]);

function returnTo() {
  const value = { from: selectedDay.value, to: selectedDay.value, page: String(page.value), scroll: String(Math.round(scrollY.value)) };
  if (selectedStarterId.value) value.starter = selectedStarterId.value;
  return router.resolve({ path: '/diary', query: value }).fullPath;
}
const feedingTarget = computed(() => ({ path: '/feeding' }));

// 记录页只按单只酵种查看：优先沿用地址里的酵种，其次跟随今日页记住的酵种，最后落到最新酵种。
function preferredStarter(list) {
  const ids = list.map((item) => item.id);
  if (ids.includes(selectedStarterId.value)) return selectedStarterId.value;
  const saved = readSelectedStarter(accountId.value);
  return ids.includes(saved) ? saved : ids[0] || '';
}

// 一行只回答三件事：几点到几点、比例与发酵时长、涨了多少。其余说明退到详情。
function roundItem(row, carried, now) {
  const summary = row.summary || {};
  const from = Date.parse(summary.windowFrom || row.occurred_at);
  const closed = summary.windowStatus === 'closed';
  const to = Date.parse(summary.windowClosedAt || (closed ? summary.windowTo : new Date(now).toISOString())) || now;
  const range = rangeText(from, to);
  const state = roundState(summary);
  const baseline = Number(summary.baselineHeightMm);
  const current = Number(summary.currentHeightMm);
  const expansion = summary.expansionPercent == null ? null : Number(summary.expansionPercent);
  const facts = [];
  if (baseline > 0) facts.push({ text: `基线 ${metric(baseline)} mm`, tone: 'base' });
  if (current > 0) facts.push({ text: `${closed ? '结束' : '当前'} ${metric(current)} mm`, tone: 'value' });
  if (expansion != null && Number.isFinite(expansion)) facts.push({ text: `${expansion >= 0 ? '+' : ''}${expansion.toFixed(0)}%`, tone: expansion >= 0 ? 'up' : 'down' });
  return {
    id: `round:${row.id}`, kind: 'round', at: from, atEnd: to,
    from: range.from,
    startedLabel: carried ? `${new Date(from).getMonth() + 1} 月 ${new Date(from).getDate()} 日 ${range.from}` : range.from,
    toLabel: closed ? range.to : '现在',
    fromOffset: range.fromOffset, toOffset: closed ? range.toOffset : '',
    titleTip: range.title,
    sub: [carried ? '跨日' : '', `比例 ${ratioText(row.ratio)}`, `${closed ? '历时' : '发酵'} ${durationText(from, to)}`].filter(Boolean).join(' · '),
    facts,
    expansion: expansion != null && Number.isFinite(expansion) ? expansion : null,
    meanTemp: summary.meanTempC == null || !Number.isFinite(Number(summary.meanTempC)) ? null : Number(summary.meanTempC),
    ratioLabel: ratioText(row.ratio),
    durationLabel: durationText(from, to),
    hint: roundHint(summary, row.linked, row.boundaryPending),
    state: state.label,
    tone: state.tone,
    deviceId: row.deviceId || '',
    baseline: baseline > 0 ? baseline : null,
    windowFrom: new Date(from).toISOString(),
    windowTo: new Date(to).toISOString(),
    to: recordsDetailTarget(row, returnTo())
  };
}
// 涨跌只在证据有效时显示；缺测原因用一句话说明，不把设备问题说成发酵结束。
function roundHint(summary, linked, boundaryPending) {
  const hint = !linked ? '未关联设备，无法计算膨胀率'
    : summary.baselineStatus === 'pending' ? '基线计算中'
      : summary.baselineStatus === 'insufficient' ? '基线采样不足'
        : summary.heightStale ? '数据偏旧，沿用上次读数'
          : summary.baselineIncomplete ? '基线采样未满，仅供参考' : '';
  return [hint, boundaryPending ? '结束边界待核实' : ''].filter(Boolean).join(' · ');
}
function observationItem(row) {
  return {
    id: `observation:${row.id}`, kind: 'observation', at: Date.parse(row.occurred_at),
    title: row.result?.title || '观察记录',
    offset: '',
    sub: `${formatClock(row.occurred_at)} · 观察 · ${starterName(row.starter_id)}`,
    note: '', state: '', tone: '',
    to: recordsDetailTarget(row, returnTo())
  };
}
// 保留各项时间顺序，再按发酵轮次、观察记录分组展示；设备采样统一进入单日数据。
const timeline = computed(() => {
  if (!model.value) return [];
  const now = Date.now();
  const items = model.value.continuations.map((row) => roundItem(row, true, now));
  for (const row of model.value.events) items.push(row.kind === 'feeding' ? roundItem(row, false, now) : observationItem(row));
  return items.sort((a, b) => a.at - b.at);
});
const roundItems = computed(() => timeline.value
  .filter((item) => item.kind === 'round')
  .map((item, index) => ({ ...item, index: index + 1 })));
const observationItems = computed(() => timeline.value.filter((item) => item.kind === 'observation'));
// 单日数据在一级页面只保留在线时长与采样数；曲线按设备与轮次分别展示。
const deviceBlocks = computed(() => {
  const rows = (model.value?.devices || []).filter((row) => row.samples?.length);
  return rows.map((row, index) => {
    const times = row.samples.map((sample) => Date.parse(sample.recorded_at)).filter(Number.isFinite).sort((a, b) => a - b);
    return {
      id: row.id,
      // 页面已限定单只酵种，标题直接写酵种名；多设备时再补序号区分。
      name: rows.length > 1 ? `${selectedStarterName.value || '酵种'} · 设备 ${index + 1}` : selectedStarterName.value || '设备',
      count: row.samples.length,
      online: onlineText(times[0], times.at(-1)),
      partial: !!row.partial,
      to: recordsDetailTarget(row, returnTo())
    };
  });
});
// 轮次摘要复用单日采样，按设备归并后裁到本轮窗口。
const deviceSamples = computed(() => {
  const map = new Map();
  for (const row of model.value?.devices || []) {
    if (!row.device_id) continue;
    map.set(row.device_id, [...(map.get(row.device_id) || []), ...(row.samples || [])]);
  }
  return map;
});
function meanOf(values) {
  const nums = values.filter((value) => Number.isFinite(value));
  return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : null;
}
function metricText(value, suffix) {
  return value == null || !Number.isFinite(value) ? '—' : `${Math.round(value)}${suffix}`;
}
// 卡片上的三项来自本轮实测：最高膨胀率取窗口内最高高度，温度优先用采样均值。
function roundMetrics(item) {
  const samples = item.deviceId ? deviceSamples.value.get(item.deviceId) || [] : [];
  const rows = samples.filter((row) => {
    const at = Date.parse(row.recorded_at);
    return Number.isFinite(at) && at >= item.at && at <= item.atEnd;
  });
  const heights = rows.map((row) => Number(row.height_mm)).filter((value) => value > 0);
  let peak = item.expansion;
  if (item.baseline > 0 && heights.length) peak = ((Math.max(...heights) - item.baseline) / item.baseline) * 100;
  const temp = meanOf(rows.map((row) => Number(row.temperature_c))) ?? item.meanTemp;
  const humidity = meanOf(rows.map((row) => Number(row.humidity_percent)));
  return { peak: metricText(peak, '%'), temp: metricText(temp, '°C'), humidity: metricText(humidity, '%') };
}
const roundCards = computed(() => roundItems.value.map((item) => ({ ...item, metrics: roundMetrics(item) })));

let generation = 0;
let disposed = false;
// 同一位置再次进入时保留已渲染内容，避免重新加载造成闪空。
let loadedPosition = '';
let loadedRevision = -1;
async function load() {
  if (!onRecordsPage()) return;
  const token = ++generation;
  const owner = accountId.value;
  const day = selectedDay.value;
  const currentPage = page.value;
  const starterId = selectedStarterId.value;
  const current = () => !disposed && token === generation && owner === accountId.value && day === selectedDay.value && currentPage === page.value && starterId === selectedStarterId.value && onRecordsPage();
  const position = positionKey();
  const keep = !!model.value && loadedPosition === position;
  if (!keep) { model.value = null; hasMore.value = false; }
  error.value = ''; notice.value = ''; loading.value = false;
  if (!owner) return;
  loading.value = true;
  try {
    const names = await listStarters({ userId: owner }).catch(() => []);
    if (!current()) return;
    starters.value = names;
    const resolved = preferredStarter(names);
    if (resolved !== starterId) {
      // 默认酵种与今日页同步后写回地址，刷新、返回详情都停在同一只酵种上。
      router.replace({ path: '/diary', query: { ...query.value, starter: resolved, page: '1' } });
      return;
    }
    if (!resolved) return;
    const [factPage, context, devices] = await Promise.all([
      loader.facts(owner, day, currentPage, resolved, current),
      loader.context(owner, day, resolved, current),
      loader.devices(owner, day, [resolved], current)
    ]);
    if (!current() || !factPage) return;
    hasMore.value = factPage.hasMore;
    model.value = recordsDayModel({ day, facts: factPage.rows, context, devices, now: Date.now() });
    loadedPosition = position;
    loadedRevision = readRevision();
    notice.value = [...new Set([...(context?.notices || []), ...(devices?.notices || [])])].join(' ');
  } catch (cause) {
    if (current()) error.value = cause?.message || '记录读取失败，请稍后重试。';
  } finally {
    if (current()) {
      loading.value = false;
      restoreScroll(token);
    }
  }
}
let marksLoadedAt = 0;
async function loadMarks() {
  if (!onRecordsPage()) return;
  const owner = accountId.value;
  const starterId = selectedStarterId.value;
  if (!owner || !starterId) { marks.value = {}; return; }
  const result = await loader.marks(owner, new Date(), starterId, () => !disposed && owner === accountId.value && starterId === selectedStarterId.value).catch(() => null);
  if (result) { marks.value = result; marksLoadedAt = Date.now(); }
}

function selectDay(value) {
  if (!validLocalDay(value) || value > todayKey.value) return;
  if (calendarOpen.value) toggleCalendar();
  listPositions.delete(positionKey());
  router.replace({ path: '/diary', query: { ...query.value, from: value, to: value, page: '1', scroll: '0' } });
}
function selectStarter(id) {
  if (!id || id === selectedStarterId.value) return;
  rememberSelectedStarter(accountId.value, id);
  listPositions.delete(positionKey());
  router.replace({ path: '/diary', query: { from: selectedDay.value, to: selectedDay.value, page: '1', starter: id, scroll: '0' } });
}
function toToday() {
  selectDay(todayKey.value);
}
function shiftWeek(amount) {
  const next = shiftDate(selectedDay.value, amount * 7);
  selectDay(next > todayKey.value ? todayKey.value : next);
}
let weekSwipeX = 0;
function onWeekPointerDown(event) {
  weekSwipeX = event.clientX;
}
function onWeekPointerUp(event) {
  if (calendarOpen.value) return;
  const delta = event.clientX - weekSwipeX;
  if (Math.abs(delta) < 42) return;
  shiftWeek(delta < 0 ? 1 : -1);
}
function nextPage() {
  router.replace({ path: '/diary', query: { ...query.value, page: String(page.value + 1), scroll: String(Math.round(window.scrollY)) } });
}
async function toggleCalendar() {
  if (monthPicker.value) monthPicker.value = false;
  await nextTick();
  const panel = datePanelRef.value;
  const grid = dateGridRef.value;
  const weekdayRow = weekStripRef.value;
  if (!panel || !grid || !weekdayRow) return;
  const firstRects = new Map([...grid.querySelectorAll('.date-cell')].map((cell) => [cell.dataset.date, cell.getBoundingClientRect()]));
  const weekdayRects = new Map([...weekdayRow.children].map((cell) => [cell.dataset.weekday, cell.getBoundingClientRect()]));
  const fromHeight = panel.getBoundingClientRect().height;
  if (!calendarOpen.value) calendarMonth.value = new Date(`${selectedDay.value}T00:00:00`).getTime();
  calendarOpen.value = !calendarOpen.value;
  await nextTick();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const easing = 'cubic-bezier(.22,.8,.24,1)';
  if (!reduceMotion) {
    for (const cell of grid.querySelectorAll('.date-cell')) {
      const first = firstRects.get(cell.dataset.date);
      if (!first) {
        cell.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing });
        continue;
      }
      const last = cell.getBoundingClientRect();
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      if (dx || dy) cell.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'translate(0,0)' }], { duration: 360, easing });
    }
    for (const cell of weekdayRow.children) {
      const first = weekdayRects.get(cell.dataset.weekday);
      const last = cell.getBoundingClientRect();
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      if (dx || dy) cell.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'translate(0,0)' }], { duration: 360, easing });
    }
    const toHeight = panel.scrollHeight;
    panelAnimation?.cancel();
    panelAnimation = panel.animate([{ height: `${fromHeight}px` }, { height: `${toHeight}px` }], { duration: 360, easing });
  }
}
function changeMonth(delta) {
  const date = new Date(calendarMonth.value);
  calendarMonth.value = delta === 0 ? Date.now() : new Date(date.getFullYear(), date.getMonth() + delta, 1).getTime();
}
const shownYear = computed(() => String(new Date(calendarMonth.value).getFullYear()));
const shownMonth = computed(() => String(new Date(calendarMonth.value).getMonth() + 1).padStart(2, '0'));
const yearOptions = computed(() => {
  const end = Number(String(todayKey.value).slice(0, 4));
  const start = Math.min(end - 10, Number(shownYear.value));
  return Array.from({ length: end - start + 1 }, (_, index) => {
    const value = String(start + index);
    return { value, label: `${value} 年` };
  });
});
const monthWheelOptions = Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1).padStart(2, '0'), label: `${index + 1} 月` }));
function chooseCalendarMonth(year = shownYear.value, month = shownMonth.value) {
  const today = new Date(`${todayKey.value}T12:00:00`);
  let nextYear = Number(year);
  let nextMonth = Number(month);
  if (nextYear > today.getFullYear() || (nextYear === today.getFullYear() && nextMonth > today.getMonth() + 1)) {
    nextYear = today.getFullYear();
    nextMonth = today.getMonth() + 1;
  }
  calendarMonth.value = new Date(nextYear, nextMonth - 1, 1).getTime();
}

async function restoreScroll(token) {
  await nextTick();
  if (disposed || token !== generation) return;
  const saved = listPositions.get(positionKey());
  const value = Number.isFinite(saved) ? saved : Number(queryText('scroll')) || 0;
  window.scrollTo({ top: Math.max(0, value), behavior: 'instant' });
  scrollY.value = Math.max(0, value);
}
function trackScroll() {
  if (loading.value) return;
  scrollY.value = Math.max(0, window.scrollY);
  listPositions.set(positionKey(), scrollY.value);
}

watch(accountId, (owner, previous) => {
  if (previous) { listPositions.clear(); loader.clear(); }
  if (owner) loadMarks();
}, { immediate: true, flush: 'sync' });
watch([accountId, selectedDay, page, selectedStarterId], load, { immediate: true });
watch(selectedStarterId, () => { void loadMarks(); });
// 旧链接（type/starter/from-to 范围）在进入时规范化，页面不会读到过期筛选。
// 只在记录页生效：离开本页时 query 会变，否则会把详情页或今日页直接顶回列表。
watch(query, (value) => {
  if (!onRecordsPage()) return;
  const keys = ['from', 'to', 'page', 'scroll', 'starter'];
  const changed = Object.keys(route.query).length !== Object.keys(value).length
    || keys.some((key) => (queryText(key) || '') !== (value[key] || ''));
  if (changed) router.replace({ path: '/diary', query: value });
}, { immediate: true });
onMounted(async () => {
  auth.init();
  window.addEventListener('scroll', trackScroll, { passive: true });
  await nextTick();
});
let reentered = false;
// 从详情或记录页返回时，只有写入过新数据才丢弃当日缓存；否则直接复用已读到的内容。
onActivated(() => {
  if (!reentered) { reentered = true; return; }
  const changed = readRevision() !== loadedRevision;
  if (changed) loader.clear();
  load();
  // 日期圆点只是近两周索引，写入或超过五分钟才需要重读。
  if (changed || Date.now() - marksLoadedAt > 5 * 60_000) loadMarks();
});
onUnmounted(() => {
  disposed = true;
  generation++;
  window.removeEventListener('scroll', trackScroll);
});
</script>

<template>
  <main class="m-page mobile-diary">
    <header class="diary-head">
      <h1>日记</h1>
    </header>
    <section ref="datePanelRef" class="date-card date-board" :class="{ expanded: calendarOpen }">
      <div class="month-row">
        <button v-if="calendarOpen" type="button" class="month-title" :aria-expanded="monthPicker" aria-label="选择年月" @click="monthPicker = !monthPicker">
          <strong>{{ calendarTitle }}</strong><small>{{ monthPicker ? '滚动选择年月' : '选择日期' }}</small>
        </button>
        <p v-else class="month-label">{{ calendarTitle }}</p>
        <button type="button" class="date-calendar" :aria-expanded="calendarOpen" :aria-label="calendarOpen ? '收起日历' : '展开日历'" @click="toggleCalendar">
          <img :src="calendarIcon" alt="" width="44" height="44" />
        </button>
      </div>
      <div v-if="calendarOpen && monthPicker" class="month-wheels">
        <MWheelPicker :model-value="shownYear" :options="yearOptions" label="年份" @update:model-value="chooseCalendarMonth($event, shownMonth)" />
        <MWheelPicker :model-value="shownMonth" :options="monthWheelOptions" label="月份" @update:model-value="chooseCalendarMonth(shownYear, $event)" />
      </div>
      <div v-show="!(calendarOpen && monthPicker)" class="date-view" :class="{ expanded: calendarOpen }" @pointerdown="onWeekPointerDown" @pointerup="onWeekPointerUp">
        <div ref="weekStripRef" class="weekday-row weekday-row-shared" aria-hidden="true">
          <span v-for="item in weekdayColumns" :key="item.label" :data-weekday="item.label" :style="{ gridColumn: item.column }">{{ item.label }}</span>
        </div>
        <div ref="dateGridRef" class="date-grid date-grid-shared" :class="{ expanded: calendarOpen }" role="group" :aria-label="calendarOpen ? '选择日期' : '七日日期'">
          <button v-for="item in dateCells" :key="item.value" :data-date="item.value" type="button" class="date-cell"
            :class="{ active: item.value === selectedDay, today: item.today, off: item.off, future: item.future, marked: marks[item.value] }"
            :style="calendarOpen ? { gridColumn: `${((new Date(`${item.value}T12:00:00`).getDay() + 6) % 7) + 1}` } : null"
            :disabled="item.future" :aria-pressed="item.value === selectedDay" :aria-label="`${item.value} 周${item.weekday}`" @click="selectDay(item.value)">
            <span v-if="!calendarOpen" class="cell-weekday">{{ item.weekday }}</span>
            <span class="cell-day">{{ item.day }}</span>
          </button>
        </div>
        <div v-if="calendarOpen" class="calendar-nav">
          <button type="button" aria-label="上个月" @click="changeMonth(-1)">‹</button>
          <button type="button" class="calendar-today" @click="changeMonth(0); toToday()">今天</button>
          <button type="button" aria-label="下个月" @click="changeMonth(1)">›</button>
        </div>
      </div>
    </section>

    <section class="day-board">
      <div class="day-summary">
        <div>
          <p class="day-title">{{ dayHeading }}</p>
          <p class="day-count">{{ feedingCaption }}</p>
        </div>
        <RouterLink class="doctor-link" :to="{ path: '/doctor/rounds', query: selectedStarterId ? { starter: selectedStarterId } : {} }">
          <img :src="doctorIcon" alt="" width="16" height="16" />
          <span>酵种医生</span>
          <img :src="doctorChevron" alt="" width="14" height="14" />
        </RouterLink>
      </div>
      <div v-if="!auth.user.value" class="records-empty"><img class="jojo-mascot" src="/assets/jojo1.png" alt="Jojo 吉祥物" /><div><p>登录后读取你的喂养与观察记录。</p><RouterLink :to="{ path: '/login', query: { redirect: route.fullPath } }">去登录</RouterLink></div></div>
      <template v-else>
        <div v-if="loading && !model" class="m-skeleton" role="status" aria-label="正在读取记录"><span></span><span></span></div>
        <p v-if="error" class="m-error" role="alert">{{ error }}</p>
        <p v-if="notice" class="m-muted" role="status">{{ notice }}</p>
        <template v-if="!error && model">
          <section v-if="roundCards.length" class="record-group round-group">
            <RouterLink v-for="item in roundCards" :key="item.id" class="feed-card" :to="item.to" :title="item.titleTip">
              <span class="feed-card-head">
                <strong>{{ item.startedLabel }} 喂养</strong>
                <span v-if="item.state" class="feed-card-state">{{ item.state }}</span>
                <span class="feed-card-detail">详情 ›</span>
              </span>
              <span class="feed-card-sub">喂养比例 {{ item.ratioLabel }} · 发酵 {{ item.durationLabel }}</span>
              <span class="feed-metrics">
                <span><strong>{{ item.metrics.peak }}</strong><small>最高膨胀率</small></span>
                <span><strong>{{ item.metrics.temp }}</strong><small>平均温度</small></span>
                <span><strong>{{ item.metrics.humidity }}</strong><small>平均湿度</small></span>
              </span>
            </RouterLink>
          </section>
          <section v-if="deviceBlocks.length" class="record-group chart-group">
            <h2 class="record-group-title">
              <span class="group-mark chart-mark" aria-hidden="true"></span>单日数据
            </h2>
            <RouterLink v-for="item in deviceBlocks" :key="item.id" class="m-list-row record-row device-row" :to="item.to">
              <span class="record-main">
                <span class="record-head"><strong class="record-title">{{ item.name }}</strong></span>
                <small class="record-sub">在线 {{ item.online }} · {{ item.count }} 条采样</small>
                <small v-if="item.partial" class="record-note">部分采样未完整加载，明细只代表已读取数据。</small>
              </span>
              <span class="record-side"><span class="record-go" aria-hidden="true">›</span></span>
            </RouterLink>
          </section>
          <section v-if="observationItems.length" class="record-group observation-group">
            <h2 class="record-group-title"><span class="group-mark observation-mark" aria-hidden="true"></span>观察记录<small class="group-note">{{ observationItems.length }} 条</small></h2>
            <RouterLink v-for="item in observationItems" :key="item.id" class="m-list-row record-row observation-row" :to="item.to">
              <span class="record-main"><span class="record-head"><strong class="record-title">{{ item.title }}</strong></span><small class="record-sub">{{ item.sub }}</small></span>
              <span class="record-side"><span class="record-go" aria-hidden="true">›</span></span>
            </RouterLink>
          </section>
          <div v-if="!starters.length" class="records-empty">
            <img class="jojo-mascot" src="/assets/jojo2.png" alt="Jojo 吉祥物" />
            <div><p>还没有酵种，创建后才能按酵种查看记录。</p><RouterLink :to="{ path: '/device' }">去创建酵种</RouterLink></div>
          </div>
          <div v-else-if="!timeline.length && !deviceBlocks.length" class="records-empty">
            <img class="jojo-mascot" src="/assets/jojo2.png" alt="Jojo 吉祥物" />
            <div><p>{{ isToday ? '今天还没有记录。' : '这一天没有记录。' }}</p><RouterLink :to="feedingTarget">记录一次喂养</RouterLink></div>
          </div>
          <button v-if="hasMore" type="button" class="more-row" :disabled="loading" @click="nextPage">加载更多记录</button>
        </template>
      </template>
    </section>
  </main>
</template>

<style scoped>
.m-page{padding-bottom:calc(8rem + env(safe-area-inset-bottom))}
.mobile-area .m-page.mobile-diary{padding-top:calc(12px + env(safe-area-inset-top));gap:0}
.mobile-area .mobile-main .m-page.mobile-diary > .date-board{margin-block:0 28px;padding:0;border:0;background:transparent;box-shadow:none}
.mobile-area .mobile-main .m-page.mobile-diary > .day-board{margin-block:0 12px}
.diary-head{display:flex;align-items:center;min-height:36px;margin:0 0 8px}
.diary-head h1{margin:0;font-size:28px;line-height:36px;font-weight:500;letter-spacing:-.02em;color:var(--text-primary)}
.month-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;margin:0 0 12px}
.month-label{margin:0;font-size:14px;line-height:21px;font-weight:500;color:var(--text-primary)}
.month-title{min-width:0;padding:0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.month-title strong,.month-title small{display:block}
.month-title strong{font-size:16px;line-height:24px;font-weight:500}
.month-title small{margin-top:2px;font-size:12px;line-height:18px;color:var(--text-secondary)}
.month-wheels{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:8px 0 4px}
.date-calendar{display:grid;place-items:center;flex:none;width:44px;height:44px;padding:0;border:0;background:transparent;cursor:pointer}
.date-calendar img{display:block;width:44px;height:44px}
.day-summary{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin:0 0 12px}
.day-title{margin:0;font-size:var(--m-text-confirm);line-height:29px;font-weight:500}
.day-count{margin:2px 0 0;font-size:14px;line-height:21px;color:var(--text-secondary)}
.doctor-link{display:inline-flex;align-items:center;gap:6px;flex:none;min-height:32px;color:var(--brand-action);font-size:14px;line-height:21px;font-weight:500;text-decoration:none}
.doctor-link img{display:block;flex:none}
.feed-card{display:grid;gap:8px;min-height:137px;padding:10px 14px 14px;border-radius:var(--radius-card);background:var(--surface-card);box-shadow:var(--m-shadow);color:inherit;text-decoration:none}
.feed-card-head{display:grid;grid-template-columns:auto auto minmax(0,1fr);align-items:baseline;gap:8px}
.feed-card-head strong{font-size:16px;line-height:24px;font-weight:500}
.feed-card-state{font-size:11px;line-height:16px;color:var(--text-secondary)}
.feed-card-detail{justify-self:end;font-size:12px;line-height:18px;font-weight:500;color:var(--brand-accent)}
.feed-card-sub{font-size:11px;line-height:16px;color:var(--text-secondary)}
.feed-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.feed-metrics > span{display:grid;align-content:center;gap:2px;min-height:57px;padding:8px 8px 8px 8px;border-radius:10px;background:color-mix(in srgb,var(--brand-light) 34%,var(--surface-card))}
.feed-metrics strong{font-size:14px;line-height:20px;font-weight:500}
.feed-metrics small{font-size:10px;line-height:14px;color:var(--text-secondary)}
.date-view{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));grid-template-rows:18px auto;transform-origin:top center;overflow:hidden}
.weekday-row-shared{grid-column:1/-1;grid-row:1;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));column-gap:2px;align-items:center;margin-bottom:2px;text-align:center;color:var(--text-secondary);font-size:var(--text-xs)}
.date-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));column-gap:.18rem;row-gap:.1rem}
.date-grid-shared{grid-column:1/-1;grid-row:2;grid-auto-rows:34px;overflow:visible}
.date-view:not(.expanded){grid-template-rows:auto}
.date-view:not(.expanded) .weekday-row-shared{display:none}
.date-view:not(.expanded) .date-grid-shared{grid-template-rows:82px;grid-template-columns:repeat(7,42px);justify-content:space-between;column-gap:0}
.date-grid-shared.expanded{grid-template-columns:repeat(7,minmax(0,1fr))}
.date-grid-shared .date-cell{min-height:0;height:36px}
.date-view:not(.expanded) .date-grid-shared .date-cell{height:82px;border-radius:20px;background:var(--surface-card)}
.date-view:not(.expanded) .date-grid-shared .date-cell.active{background:var(--brand-light)}
.cell-weekday{font-size:14px;line-height:21px;font-weight:400;color:var(--text-secondary)}
.date-view:not(.expanded) .cell-day{font-size:18px;line-height:26px;font-weight:500}
.date-cell{position:relative;display:grid;place-items:center;min-width:0;min-height:38px;padding:0;border:1px solid transparent;border-radius:var(--radius-control);background:transparent;color:var(--text-primary);font:inherit;font-size:var(--text-sm);font-variant-numeric:tabular-nums;cursor:pointer;transition:background-color var(--motion-fast) var(--ease-standard),color var(--motion-fast) var(--ease-standard),transform var(--motion-fast) var(--ease-standard)}
.date-cell:active{transform:scale(.96)}
.date-cell.active{background:var(--brand-light);color:var(--text-primary);font-weight:500}
.date-cell.marked:not(.active){background:var(--m-icon-disc)}
.date-cell.today:not(.active){font-weight:500}
.date-cell.off{opacity:.36}
.date-cell.future{opacity:.32;cursor:default}
.calendar-nav{display:flex;align-items:center;justify-content:space-between;margin-top:.25rem;border-top:1px solid var(--border-warm)}
.calendar-nav button{min-width:44px;min-height:44px;border:0;background:transparent;color:var(--brand-action);font:inherit;font-size:var(--text-lg);cursor:pointer}
.calendar-nav .calendar-today{font-size:var(--text-xs);font-weight:500}
.day-card{padding:var(--m-card-space)}
.day-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px}
.day-head strong{display:block;font-size:var(--m-text-confirm);line-height:28px;font-weight:500}
.day-head small{display:block;margin-top:2px;font-size:var(--text-xs);line-height:18px;color:var(--text-secondary)}
.day-today{padding:2px 8px;border-radius:var(--radius-badge);background:var(--success-bg);color:var(--success-text);font-size:var(--text-xs);font-weight:500;white-space:nowrap}
.record-group{display:grid;gap:8px;margin-top:16px;min-width:0}
.record-group-title{display:flex;align-items:center;gap:6px;margin:0;font-size:var(--text-sm);line-height:21px;font-weight:500;color:var(--text-secondary)}
.group-mark{width:3px;height:12px;border-radius:2px;background:var(--brand-action);flex:none}
.chart-mark{background:var(--chart-height)}.observation-mark{background:var(--chart-humidity)}
.group-note{margin-left:auto;font-size:var(--text-xs);line-height:18px;font-weight:500;color:var(--text-secondary);font-variant-numeric:tabular-nums}
/* 每轮一张卡片：上方是可点的轮次摘要，下方复用单日数据同一套曲线。 */
.round-card{display:grid;gap:.55rem;padding:.7rem;border:1px solid color-mix(in srgb,var(--chart-height) 16%,var(--border-warm));border-radius:var(--radius-card);background:color-mix(in srgb,var(--chart-height) 3%,var(--surface-card))}
.round-summary{display:grid;gap:.25rem;min-width:0;color:inherit;text-decoration:none}
.round-head{display:flex;align-items:center;gap:.3rem;min-width:0}
.round-head .record-title{display:inline-flex;align-items:center;gap:2px;font-size:var(--text-md);line-height:24px;font-weight:500;color:var(--text-primary);font-variant-numeric:tabular-nums;white-space:nowrap}
.round-head .record-state{margin-left:auto}
.round-arrow{font-size:var(--text-md);color:var(--text-secondary)}
@media(max-width:360px){.round-head{flex-wrap:wrap}.round-head .record-state{margin-left:0}}
.round-summary .record-sub,.round-summary .record-note{display:block;min-width:0;line-height:18px}
.round-summary .record-sub{font-size:var(--text-xs);color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.round-summary .record-note{font-size:var(--text-xs);color:var(--text-secondary);font-variant-numeric:tabular-nums;white-space:normal;overflow-wrap:anywhere}
.round-chart{display:grid;gap:.4rem;padding-top:.55rem;border-top:1px solid color-mix(in srgb,var(--chart-height) 12%,var(--border-warm))}
.round-axis-note{margin:0;font-size:var(--text-xs);line-height:18px;color:var(--text-secondary)}
.round-chart-empty{margin:0;font-size:var(--text-xs);line-height:18px;color:var(--text-secondary)}
.chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:.7rem}
.chart-grid :deep(.series-chart){min-width:0;--series-stroke:1.5px}
.chart-grid :deep(.series-plot){position:relative;height:88px}
.chart-grid :deep(svg){display:block;width:100%;height:88px}
.chart-grid :deep(.series-line){fill:none;stroke-width:1.5}
.chart-grid :deep(.series-grid){stroke:var(--border-warm);stroke-width:.3;stroke-dasharray:2 2}
.chart-grid :deep(.series-dot),.chart-grid :deep(.series-hover-dot){position:absolute;transform:translate(-50%,-50%)}
.chart-grid :deep(.series-dot){border-radius:0}
.chart-grid :deep(.series-hover-dot){width:6px;height:6px;border-radius:50%}
.chart-grid :deep(.series-guide){stroke:var(--text-secondary);stroke-width:.5;stroke-dasharray:2 2;vector-effect:non-scaling-stroke}
.chart-grid :deep(.series-tip){position:absolute;z-index:2;transform:translate(-50%,-115%);background:var(--surface-card);border:1px solid var(--border-warm);padding:4px 6px;pointer-events:none;font-size:var(--text-xs);box-shadow:var(--m-shadow)}
.chart-grid :deep(.series-tip span){display:block;color:var(--text-secondary)}
.chart-grid :deep(.series-empty){min-height:88px;display:grid;place-items:center;font-size:var(--text-xs);color:var(--text-secondary);background:var(--surface-card)}
.chart-grid :deep(.series-value){font-size:var(--text-md);letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.chart-grid :deep(.series-head){display:flex;align-items:baseline;justify-content:space-between;gap:.35rem;margin-bottom:.25rem}
.chart-grid :deep(.series-headline){display:flex;align-items:baseline;gap:.2rem;flex-wrap:nowrap;min-width:0;justify-content:flex-end}
.chart-grid :deep(.series-label){font-size:var(--text-xs);font-weight:500}
.chart-grid :deep(.series-delta){display:none}
.chart-grid :deep(.series-range){display:flex;flex-wrap:nowrap;align-items:center;justify-content:space-between;gap:.2rem;min-width:0}
.chart-grid :deep(.series-time-range){white-space:nowrap}
.day-card .record-row{align-items:center;gap:.6rem;min-width:0;padding:.75rem;border:1px solid var(--border-warm);border-radius:var(--radius-card);background:var(--surface-card);text-decoration:none}
.window-facts{display:flex;flex-wrap:wrap;gap:.3rem .4rem;margin-top:.15rem}
.window-fact{padding:2px 6px;border-radius:var(--radius-badge);background:var(--surface-warm);font-size:var(--text-xs);font-weight:500;line-height:18px;font-variant-numeric:tabular-nums;color:var(--text-primary)}
.window-fact[data-tone="base"]{background:var(--info-bg);color:var(--info-text)}
.window-fact[data-tone="up"]{background:var(--success-bg);color:var(--success-text)}
.window-fact[data-tone="down"]{background:var(--danger-bg);color:var(--danger-text)}
.record-main{display:grid;gap:.25rem;min-width:0;flex:1}
.day-card .record-note{white-space:normal;overflow-wrap:anywhere}
.day-card .record-sub{white-space:normal;overflow-wrap:anywhere}
.record-head{display:flex;align-items:center;gap:.25rem;min-width:0}
.round-index{display:inline-grid;place-items:center;flex:none;min-width:18px;height:18px;padding:0 4px;border-radius:50%;background:var(--brand-action);color:var(--surface-card);font-size:var(--text-xs);font-weight:500;line-height:1;font-variant-numeric:tabular-nums}
.record-row .record-title{font-size:var(--text-md);font-weight:500;color:var(--text-primary);font-variant-numeric:tabular-nums;white-space:nowrap}
.record-row .record-sub,.record-row .record-note{display:block;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:18px}
.record-row .record-sub{font-size:var(--text-xs);color:var(--text-secondary)}
.record-row .record-note{font-size:var(--text-xs);color:var(--text-secondary);font-variant-numeric:tabular-nums}
.day-offset{display:inline-grid;place-items:center;min-width:16px;height:16px;padding:0 4px;border-radius:var(--radius-badge);background:var(--danger-bg);color:var(--danger-text);font-size:var(--text-xs);line-height:1;font-weight:500}
.record-side{display:flex;align-items:center;gap:.3rem;flex:none}
.record-state{padding:2px 8px;border-radius:var(--radius-badge);font-size:var(--text-xs);font-weight:500;background:var(--info-bg);color:var(--info-text);white-space:nowrap}
.record-state[data-tone="closed"]{background:var(--success-bg);color:var(--success-text)}
.record-state[data-tone="pending"]{background:var(--warning-bg);color:var(--warning-text)}
.record-go{font-size:var(--text-md);line-height:1;color:var(--text-muted)}
.more-row{width:100%;min-height:44px;margin-top:8px;border:1px solid var(--border-warm);border-radius:var(--m-radius-bubble);background:transparent;color:var(--brand-action);font:inherit;font-size:var(--text-sm);font-weight:500;cursor:pointer}
.records-empty{display:flex;align-items:center;gap:.75rem;padding:.5rem 0}
.records-empty p{margin:.1rem 0 .35rem}
.jojo-mascot{width:76px;height:76px;object-fit:contain;flex:none}
@media(prefers-reduced-motion:reduce){.date-cell{transition:none}.date-cell:active{transform:none}}
</style>
