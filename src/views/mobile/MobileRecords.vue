<script>
const listPositions = new Map();
</script>

<script setup>
import { computed, nextTick, onActivated, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { listCareRecords, listStarters } from '../../services/care.service.js';
import SeriesChart from '../../components/SeriesChart.vue';

import { listStarterDeviceLinks } from '../../services/starter-device.service.js';
import { mobileDeviceService } from '../../services/mobile-device.service.js';
import { loadWindowClosures } from '../../services/fermentation-window.service.js';
import {
  createRecordsLoader, normalizeRecordsQuery, recentRecordDays, recordsDayModel,
  recordsDetailTarget, roundState, validLocalDay
} from '../../lib/mobile-records.js';
import { readSelectedStarter, rememberSelectedStarter } from '../../lib/mobile-selection.js';

const route = useRoute();
const router = useRouter();
const auth = useAuth();
defineOptions({ name: 'MobileRecords' });

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
function formatDayLabel(value) {
  const date = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return value;
  return `${date.getMonth() + 1}月${date.getDate()}日 周${'日一二三四五六'[date.getDay()]}`;
}
function durationText(fromMs, toMs) {
  const minutes = Math.max(0, Math.round((toMs - fromMs) / 60000));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} 小时 ${minutes % 60} 分钟` : `${minutes} 分钟`;
}
// 跨天轮次用圆形小标提示偏移，避免把两天时间挤成一行长文本。
function rangeText(fromMs, toMs) {
  const fromDate = new Date(fromMs);
  const toDate = new Date(toMs);
  const offset = Math.round((new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate()) - new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate())) / 86400000);
  return {
    from: formatClock(fromMs), to: formatClock(toMs),
    offset: offset ? `${offset > 0 ? '+' : '−'}${Math.abs(offset)}` : '',
    title: `${fromDate.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} – ${toDate.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
  };
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
const onRecordsPage = () => route.name === 'mobile-records';
const selectedDay = computed(() => query.value.from);
const page = computed(() => Number(query.value.page) || 1);
const selectedStarterId = computed(() => query.value.starter || '');
const selectedStarterName = computed(() => starters.value.find((item) => item.id === selectedStarterId.value)?.name || '');
const isToday = computed(() => selectedDay.value === recentRecordDays().at(-1));
const dayLabel = computed(() => formatDayLabel(selectedDay.value));
const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
// 历史日期收起后仍保留在两周视窗内，不跳回今天。
const compactDays = computed(() => {
  const recent = recentRecordDays();
  return recent.includes(selectedDay.value) ? recent : recentRecordDays(new Date(`${selectedDay.value}T12:00:00`));
});
const calendarTitle = computed(() => {
  if (!calendarOpen.value) {
    const first = compactDays.value[0];
    return `${first.slice(5).replace('-', '/')} – ${compactDays.value.at(-1).slice(5).replace('-', '/')}`;
  }
  const date = new Date(calendarMonth.value);
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
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
  const latest = new Date(`${compactDays.value.at(-1)}T12:00:00`);
  const latestWeekday = (latest.getDay() + 6) % 7;
  return Array.from('一二三四五六日', (label, index) => ({
    label, column: calendarOpen.value ? index + 1 : (index - latestWeekday + 7) % 7 + 1
  }));
});
const weekStripRef = ref(null);
const dateGridRef = ref(null);
let panelAnimation;
const positionKey = () => JSON.stringify([accountId.value, selectedStarterId.value, selectedDay.value]);

function returnTo() {
  const value = { from: selectedDay.value, to: selectedDay.value, page: String(page.value), scroll: String(Math.round(scrollY.value)) };
  if (selectedStarterId.value) value.starter = selectedStarterId.value;
  return router.resolve({ path: '/records', query: value }).fullPath;
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
    id: `round:${row.id}`, kind: 'round', at: from,
    title: `${range.from}–${range.to}`,
    offset: range.offset,
    titleTip: range.title,
    sub: [carried ? '跨日' : '', `比例 ${ratioText(row.ratio)}`, `${closed ? '历时' : '发酵'} ${durationText(from, to)}`].filter(Boolean).join(' · '),
    facts,
    hint: roundHint(summary, row.linked, row.boundaryPending),
    state: state.label,
    tone: state.tone,
    deviceId: row.deviceId || '',
    baseline: baseline > 0 ? baseline : null,
    to: recordsDetailTarget(row, returnTo())
  };
}
// 涨跌只在证据有效时显示；缺测原因用一句话说明，不把设备问题说成发酵结束。
function roundHint(summary, linked, boundaryPending) {
  const hint = !linked ? '未关联设备，无法计算膨胀率'
    : summary.baselineStatus === 'pending' ? '正在建立基线，稍后计算膨胀率'
      : summary.baselineStatus === 'insufficient' ? '基线有效采样不足，暂无法计算膨胀率'
        : summary.heightStale ? '设备数据偏旧，暂不采用旧读数'
          : summary.baselineWindowTruncated ? '起始观测不足 50 分钟，膨胀率仅供参考' : '';
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
// 保留各项时间顺序，再按发酵窗口、观察记录分组展示；设备采样统一进入单日数据。
const timeline = computed(() => {
  if (!model.value) return [];
  const now = Date.now();
  const items = model.value.continuations.map((row) => roundItem(row, true, now));
  for (const row of model.value.events) items.push(row.kind === 'feeding' ? roundItem(row, false, now) : observationItem(row));
  return items.sort((a, b) => a.at - b.at);
});
const roundItems = computed(() => timeline.value.filter((item) => item.kind === 'round'));
const observationItems = computed(() => timeline.value.filter((item) => item.kind === 'observation'));
// 单日数据直接铺在记录页：全天固定横轴，喂养时刻作为高度图上的竖线。
const dayStartIso = computed(() => new Date(`${selectedDay.value}T00:00:00`).toISOString());
const dayEndIso = computed(() => {
  const value = new Date(`${selectedDay.value}T00:00:00`);
  value.setDate(value.getDate() + 1);
  return value.toISOString();
});
const chartGroups = computed(() => {
  if (!model.value) return [];
  return model.value.devices.filter((row) => row.samples?.length).map((row) => {
    const related = roundItems.value.filter((item) => item.baseline && item.deviceId === row.device_id);
    const focus = related.find((item) => item.tone === 'active' || item.tone === 'pending')
      || (related.length === 1 ? related[0] : null);
    const points = (key) => row.samples.map((sample) => ({ t: sample.recorded_at, v: sample[key] == null ? null : Number(sample[key]) }));
    return {
      id: row.id, count: row.samples.length, partial: !!row.partial,
      height: points('height_mm'), temperature: points('temperature_c'),
      humidity: points('humidity_percent'), battery: points('battery_percent'),
      baseline: focus?.baseline || null,
      to: recordsDetailTarget(row, returnTo())
    };
  });
});
const sampleCount = computed(() => chartGroups.value.reduce((sum, group) => sum + group.count, 0));
const feedingMarkers = computed(() => {
  const start = Date.parse(dayStartIso.value);
  const end = Date.parse(dayEndIso.value);
  return roundItems.value
    .filter((item) => item.at >= start && item.at < end)
    .map((item) => ({ t: new Date(item.at).toISOString(), label: '开始喂养', accent: item.tone === 'active' }));
});
const daySummary = computed(() => {
  const value = model.value;
  if (!value) return '';
  const observations = value.events.filter((row) => row.kind === 'observation').length;
  return [value.feedingCount ? `${value.feedingCount} 次喂养` : '', observations ? `${observations} 条观察` : '', sampleCount.value ? `${sampleCount.value} 条采样` : '']
    .filter(Boolean).join(' · ');
});
const dayCaption = computed(() => [selectedStarterName.value, daySummary.value || '这一天没有记录'].filter(Boolean).join(' · '));

let generation = 0;
let disposed = false;
async function load() {
  if (!onRecordsPage()) return;
  const token = ++generation;
  const owner = accountId.value;
  const day = selectedDay.value;
  const currentPage = page.value;
  const starterId = selectedStarterId.value;
  const current = () => !disposed && token === generation && owner === accountId.value && day === selectedDay.value && currentPage === page.value && starterId === selectedStarterId.value && onRecordsPage();
  model.value = null; hasMore.value = false;
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
      router.replace({ path: '/records', query: { ...query.value, starter: resolved, page: '1' } });
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
async function loadMarks() {
  if (!onRecordsPage()) return;
  const owner = accountId.value;
  const starterId = selectedStarterId.value;
  if (!owner || !starterId) { marks.value = {}; return; }
  const result = await loader.marks(owner, new Date(), starterId, () => !disposed && owner === accountId.value && starterId === selectedStarterId.value).catch(() => null);
  if (result) marks.value = result;
}

function selectDay(value) {
  if (!validLocalDay(value) || value > recentRecordDays().at(-1)) return;
  if (calendarOpen.value) toggleCalendar();
  listPositions.delete(positionKey());
  router.replace({ path: '/records', query: { ...query.value, from: value, to: value, page: '1', scroll: '0' } });
}
function selectStarter(id) {
  if (!id || id === selectedStarterId.value) return;
  rememberSelectedStarter(accountId.value, id);
  listPositions.delete(positionKey());
  router.replace({ path: '/records', query: { from: selectedDay.value, to: selectedDay.value, page: '1', starter: id, scroll: '0' } });
}
function toToday() {
  selectDay(recentRecordDays().at(-1));
}
function nextPage() {
  router.replace({ path: '/records', query: { ...query.value, page: String(page.value + 1), scroll: String(Math.round(window.scrollY)) } });
}
async function toggleCalendar() {
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
  if (changed) router.replace({ path: '/records', query: value });
}, { immediate: true });
onMounted(async () => {
  auth.init();
  window.addEventListener('scroll', trackScroll, { passive: true });
  await nextTick();
});
let reentered = false;
// 从详情或记录页返回时丢弃当日缓存：补录与手动结束会改变轮次边界。
onActivated(() => {
  if (!reentered) { reentered = true; return; }
  loader.clear();
  load();
  loadMarks();
});
onUnmounted(() => {
  disposed = true;
  generation++;
  window.removeEventListener('scroll', trackScroll);
});
</script>

<template>
  <main class="m-page">
    <section ref="datePanelRef" class="m-card date-card" :class="{ expanded: calendarOpen }">
      <div class="date-head">
        <div><strong>{{ calendarTitle }}</strong><small>{{ calendarOpen ? '选择日期' : '近两周' }}</small></div>
        <div class="date-controls">
          <div v-if="starters.length" class="starter-picker" role="group" aria-label="选择酵种">
            <button v-for="item in starters" :key="item.id" type="button" class="starter-chip" :class="{ active: item.id === selectedStarterId }" :aria-pressed="item.id === selectedStarterId" @click="selectStarter(item.id)">{{ item.name }}</button>
          </div>
          <button type="button" class="date-more" :aria-expanded="calendarOpen" @click="toggleCalendar">
            <span>{{ calendarOpen ? '收起' : '更多日期' }}</span><span class="date-chevron" :class="{ up: calendarOpen }" aria-hidden="true">⌄</span>
          </button>
        </div>
      </div>
      <div class="date-view" :class="{ expanded: calendarOpen }">
        <div ref="weekStripRef" class="weekday-row weekday-row-shared" aria-hidden="true">
          <span v-for="item in weekdayColumns" :key="item.label" :data-weekday="item.label" :style="{ gridColumn: item.column }">{{ item.label }}</span>
        </div>
        <div ref="dateGridRef" class="date-grid date-grid-shared" :class="{ expanded: calendarOpen }" role="group" :aria-label="calendarOpen ? '选择日期' : '近两周日期'">
          <button v-for="item in dateCells" :key="item.value" :data-date="item.value" type="button" class="date-cell"
            :class="{ active: item.value === selectedDay, today: item.today, off: item.off, future: item.future, marked: marks[item.value] }"
            :style="calendarOpen ? { gridColumn: `${((new Date(`${item.value}T12:00:00`).getDay() + 6) % 7) + 1}` } : null"
            :disabled="item.future" :aria-pressed="item.value === selectedDay" :aria-label="`${item.value} 周${item.weekday}`" @click="selectDay(item.value)">
            <span>{{ item.day }}</span><i v-if="marks[item.value]" class="date-mark" aria-hidden="true"></i>
          </button>
        </div>
        <div v-if="calendarOpen" class="calendar-nav">
          <button type="button" aria-label="上个月" @click="changeMonth(-1)">‹</button>
          <button type="button" class="calendar-today" @click="changeMonth(0); toToday()">今天</button>
          <button type="button" aria-label="下个月" @click="changeMonth(1)">›</button>
        </div>
      </div>
    </section>

    <section v-if="!auth.user.value" class="m-card records-empty"><img class="jojo-mascot" src="/assets/jojo1.png" alt="Jojo 吉祥物" /><div><p>登录后读取你的喂养与观察记录。</p><RouterLink :to="{ path: '/login', query: { redirect: route.fullPath } }">去登录</RouterLink></div></section>
    <template v-else>
      <section class="m-card day-card">
        <div class="day-head">
          <div><strong>{{ dayLabel }}</strong><small>{{ dayCaption }}</small></div>
          <span v-if="isToday" class="day-today">今天</span>
        </div>
        <p v-if="loading" class="m-muted" role="status">正在读取记录…</p>
        <p v-if="error" class="m-error" role="alert">{{ error }}</p>
        <p v-if="notice" class="m-muted" role="status">{{ notice }}</p>
        <template v-if="!loading && !error">
          <section v-if="chartGroups.length" class="record-group chart-group">
            <h2 class="record-group-title">
              <span class="group-mark chart-mark" aria-hidden="true"></span>单日数据
              <small class="group-note">{{ sampleCount }} 条采样</small>
            </h2>
            <article v-for="(group, index) in chartGroups" :key="group.id" class="chart-card">
              <p v-if="chartGroups.length > 1" class="chart-device">设备 {{ index + 1 }}</p>
              <div class="chart-grid">
                <SeriesChart label="高度" unit=" mm" color="#2B6CB0" :points="group.height" :baseline="group.baseline" :from="dayStartIso" :to="dayEndIso" :markers="feedingMarkers" />
                <SeriesChart label="温度" unit="°C" color="#C04B0A" :points="group.temperature" :from="dayStartIso" :to="dayEndIso" />
                <SeriesChart label="湿度" unit="%" color="#2B7A55" :points="group.humidity" :from="dayStartIso" :to="dayEndIso" />
                <SeriesChart label="电量" unit="%" color="#7A5C14" :points="group.battery" :from="dayStartIso" :to="dayEndIso" />
              </div>
              <div class="chart-foot">
                <span v-if="group.partial" class="chart-warning">部分采样未完整加载</span>
                <RouterLink class="chart-detail" :to="group.to">数据明细<span aria-hidden="true">›</span></RouterLink>
              </div>
            </article>
            <p v-if="feedingMarkers.length" class="chart-note">高度图中的虚线为每次喂养开始的时刻。</p>
          </section>
          <section v-if="roundItems.length" class="record-group round-group">
            <h2 class="record-group-title">
              <span class="group-mark round-mark" aria-hidden="true"></span>发酵窗口
              <small class="group-note">{{ roundItems.length }} 轮</small>
            </h2>
            <RouterLink v-for="item in roundItems" :key="item.id" class="m-list-row record-row round-row" :to="item.to">
              <span class="record-main">
                <span class="record-head"><strong class="record-title" :title="item.titleTip">{{ item.title }}</strong><span v-if="item.offset" class="day-offset">{{ item.offset }}</span></span>
                <small class="record-sub">{{ item.sub }}</small>
                <span v-if="item.facts.length" class="window-facts">
                  <span v-for="fact in item.facts" :key="fact.text" class="window-fact" :data-tone="fact.tone">{{ fact.text }}</span>
                </span>
                <small v-if="item.hint" class="record-note">{{ item.hint }}</small>
              </span>
              <span class="record-side"><span v-if="item.state" class="record-state" :data-tone="item.tone">{{ item.state }}</span><span class="record-go" aria-hidden="true">›</span></span>
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
            <div><p>还没有酵种，创建后才能按酵种查看记录。</p><RouterLink :to="{ path: '/today' }">去创建酵种</RouterLink></div>
          </div>
          <div v-else-if="!timeline.length && !chartGroups.length" class="records-empty">
            <img class="jojo-mascot" src="/assets/jojo2.png" alt="Jojo 吉祥物" />
            <div><p>{{ isToday ? '今天还没有记录。' : '这一天没有记录。' }}</p><RouterLink :to="feedingTarget">记录一次喂养</RouterLink></div>
          </div>
          <button v-if="hasMore" type="button" class="more-row" :disabled="loading" @click="nextPage">加载更多记录</button>
        </template>
      </section>
    </template>
  </main>
</template>

<style scoped>
.m-page{padding-bottom:calc(8rem + env(safe-area-inset-bottom))}
.date-card{padding:.7rem .75rem;overflow:hidden}
.date-head{display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-bottom:.35rem}
.date-head strong{display:block;font-size:.9rem}
.date-head small{display:block;margin-top:.1rem;font-size:.7rem;color:var(--m-muted,#625e56)}
.date-controls{display:flex;align-items:center;justify-content:flex-end;gap:.4rem;min-width:0}
.date-more{display:flex;align-items:center;gap:.25rem;min-height:36px;padding:.2rem .55rem;border:1px solid var(--border-subtle);border-radius:var(--radius-control);background:var(--m-surface);color:var(--brand-action);font:inherit;font-size:.74rem;font-weight:650;white-space:nowrap;cursor:pointer}
.date-chevron{display:inline-block;font-size:1rem;line-height:1;transition:transform var(--motion-fast) var(--ease-standard)}
.date-chevron.up{transform:rotate(180deg)}
.starter-picker{display:flex;align-items:center;gap:.25rem;max-width:min(54vw,15rem);overflow-x:auto;scrollbar-width:none}
.starter-picker::-webkit-scrollbar{display:none}
.date-card .starter-chip{flex:none;max-width:100%;min-height:32px;padding:.3rem .7rem;border:1px solid var(--border-subtle);border-radius:var(--m-radius-button);background:transparent;color:var(--text-secondary);font:inherit;font-size:.75rem;line-height:1.4;font-weight:500;cursor:pointer}
.date-card .starter-chip.active{border-color:var(--brand-action);background:var(--surface-selected);color:var(--brand-action)}
.date-view{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));grid-template-rows:18px auto;transform-origin:top center;overflow:hidden}
.weekday-row-shared{grid-column:1/-1;grid-row:1;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));column-gap:.18rem;align-items:center;margin-bottom:.15rem;text-align:center;color:var(--m-muted,#756d63);font-size:.62rem}
.date-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));column-gap:.18rem;row-gap:.1rem}
.date-grid-shared{grid-column:1/-1;grid-row:2;grid-auto-rows:34px;overflow:visible}
.date-view:not(.expanded) .date-grid-shared{grid-template-rows:repeat(2,34px);grid-template-columns:repeat(7,minmax(0,1fr))}
.date-grid-shared.expanded{grid-template-columns:repeat(7,minmax(0,1fr))}
.date-grid-shared .date-cell{min-height:0;height:34px}
.date-cell{position:relative;display:grid;place-items:center;min-width:0;min-height:38px;padding:0;border:1px solid transparent;border-radius:var(--radius-control);background:transparent;color:var(--text-primary);font:inherit;font-size:.78rem;font-variant-numeric:tabular-nums;cursor:pointer;transition:background-color var(--motion-fast) var(--ease-standard),color var(--motion-fast) var(--ease-standard),transform var(--motion-fast) var(--ease-standard)}
.date-cell:active{transform:scale(.96)}
.date-cell.active{background:var(--brand-action);color:#fff}
.date-cell.today:not(.active){border-color:var(--brand-action);font-weight:700}
.date-cell.off{opacity:.36}
.date-cell.future{opacity:.32;cursor:default}
.date-cell .date-mark{position:absolute;bottom:3px;width:4px;height:4px;border:0;border-radius:50%;background:var(--brand-action)}
.date-cell.active .date-mark{background:#fff}
.calendar-nav{display:flex;align-items:center;justify-content:space-between;margin-top:.25rem;border-top:1px solid var(--m-border,#e7e0d7)}
.calendar-nav button{min-width:44px;min-height:38px;border:0;background:transparent;color:#8f3b18;font:inherit;font-size:1.2rem;cursor:pointer}
.calendar-nav .calendar-today{font-size:.74rem;font-weight:600}
.day-card{padding:.75rem}
.day-head{display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-bottom:.25rem}
.day-head strong{display:block;font-size:.9rem}
.day-head small{display:block;margin-top:.1rem;font-size:.72rem;color:var(--m-muted,#625e56)}
.day-today{padding:.15rem .5rem;border-radius:var(--radius-badge);background:#e7f4ed;color:#2B7A55;font-size:.7rem;font-weight:600;white-space:nowrap}
.record-group{display:grid;gap:.5rem;margin-top:1rem;min-width:0}
.record-group-title{display:flex;align-items:center;gap:.4rem;margin:0;font-size:.78rem;font-weight:700;color:var(--text-secondary,#5f574e)}
.group-mark{width:3px;height:12px;border-radius:2px;background:var(--brand-action);flex:none}
.chart-mark{background:#2B6CB0}.observation-mark{background:#2B7A55}
.group-note{margin-left:auto;font-size:.7rem;font-weight:500;color:var(--m-muted,#8a8277);font-variant-numeric:tabular-nums}
.chart-card{display:grid;gap:.5rem;padding:.7rem;border:1px solid color-mix(in srgb,#2B6CB0 16%,var(--m-border,#d8d2c8));border-radius:var(--m-radius-card,12px);background:color-mix(in srgb,#2B6CB0 3%,var(--m-surface,#fffdf8))}
.chart-device{margin:0;font-size:.7rem;font-weight:600;color:var(--m-muted,#625e56)}
.chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:.7rem}
.chart-grid :deep(.series-chart){min-width:0;--series-stroke:1.5px}
.chart-grid :deep(.series-plot){position:relative;height:88px}
.chart-grid :deep(svg){display:block;width:100%;height:88px}
.chart-grid :deep(.series-line){fill:none;stroke-width:1.5}
.chart-grid :deep(.series-grid){stroke:var(--m-border,#d8d2c8);stroke-width:.3;stroke-dasharray:2 2}
.chart-grid :deep(.series-dot),.chart-grid :deep(.series-hover-dot){position:absolute;transform:translate(-50%,-50%)}
.chart-grid :deep(.series-dot){border-radius:0}
.chart-grid :deep(.series-hover-dot){width:6px;height:6px;border-radius:50%}
.chart-grid :deep(.series-guide){stroke:var(--m-muted,#625e56);stroke-width:.5;stroke-dasharray:2 2;vector-effect:non-scaling-stroke}
.chart-grid :deep(.series-tip){position:absolute;z-index:2;transform:translate(-50%,-115%);background:var(--m-card,#fff);border:1px solid var(--m-border,#d8d2c8);padding:.25rem .4rem;pointer-events:none;white-space:nowrap;font-size:.72rem;box-shadow:0 3px 12px #30251f12}
.chart-grid :deep(.series-tip span){display:block;color:var(--m-muted,#625e56)}
.chart-grid :deep(.series-empty){min-height:88px;display:grid;place-items:center;font-size:.72rem;color:var(--m-muted,#625e56);background:var(--m-surface,#fffdf8)}
.chart-grid :deep(.series-value){font-size:1.02rem;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.chart-grid :deep(.series-head){display:flex;align-items:baseline;justify-content:space-between;gap:.35rem;margin-bottom:.25rem}
.chart-grid :deep(.series-headline){display:flex;align-items:baseline;gap:.2rem;flex-wrap:nowrap;min-width:0;justify-content:flex-end}
.chart-grid :deep(.series-label){font-size:.78rem;font-weight:700}
.chart-grid :deep(.series-delta){display:none}
.chart-grid :deep(.series-range){display:flex;flex-wrap:nowrap;align-items:center;justify-content:space-between;gap:.2rem;min-width:0}
.chart-grid :deep(.series-time-range){white-space:nowrap}
.chart-foot{display:flex;align-items:center;justify-content:flex-end;gap:.5rem;min-height:32px}
.chart-warning{font-size:.7rem;color:#a4524a}
.chart-detail{display:inline-flex;align-items:center;gap:.15rem;margin-left:auto;min-height:32px;color:var(--brand-action);font-size:.74rem;font-weight:650;text-decoration:none}
.chart-note{margin:0;font-size:.7rem;line-height:1.5;color:var(--m-muted,#8a8277)}
.day-card .record-row{align-items:center;gap:.6rem;min-width:0;padding:.75rem;border:1px solid var(--m-border,#d8d2c8);border-radius:var(--m-radius-card,12px);background:var(--m-surface,#fffdf8);text-decoration:none}
.window-facts{display:flex;flex-wrap:wrap;gap:.3rem .4rem;margin-top:.15rem}
.window-fact{padding:.1rem .4rem;border-radius:var(--radius-badge);background:#f1ece4;font-size:.7rem;font-weight:650;line-height:1.5;font-variant-numeric:tabular-nums;color:var(--text-primary,#30251f)}
.window-fact[data-tone="base"]{background:#eef2f7;color:#4c5b6b}
.window-fact[data-tone="up"]{background:#e7f4ed;color:#2B7A55}
.window-fact[data-tone="down"]{background:#fdf1ee;color:#a4524a}
.record-main{display:grid;gap:.25rem;min-width:0;flex:1}
.day-card .record-note{white-space:normal;overflow-wrap:anywhere}
.day-card .record-sub{white-space:normal;overflow-wrap:anywhere}
.day-card .round-row{align-items:flex-start}
.round-row .record-side{padding-top:.15rem}
@media(max-width:360px){.day-card .round-row{flex-wrap:wrap}.round-row .record-side{margin-left:auto}}
.record-head{display:flex;align-items:center;gap:.25rem;min-width:0}
.record-row .record-title{font-size:.92rem;font-weight:650;color:var(--text-primary,#30251f);font-variant-numeric:tabular-nums;white-space:nowrap}
.record-row .record-sub,.record-row .record-note{display:block;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.35}
.record-row .record-sub{font-size:.74rem;color:var(--text-secondary,#5f574e)}
.record-row .record-note{font-size:.72rem;color:var(--m-muted,#8a8277);font-variant-numeric:tabular-nums}
.day-offset{display:inline-grid;place-items:center;min-width:.95rem;height:.85rem;padding:0 .16rem;border-radius:var(--radius-badge);background:#f2dcd7;color:#a4524a;font-size:.56rem;line-height:1;font-weight:600}
.record-side{display:flex;align-items:center;gap:.3rem;flex:none}
.record-state{padding:.12rem .45rem;border-radius:var(--radius-badge);font-size:.68rem;font-weight:600;background:#e8f0fa;color:#2B6CB0;white-space:nowrap}
.record-state[data-tone="closed"]{background:#e7f4ed;color:#2B7A55}
.record-state[data-tone="pending"]{background:#fdf3e2;color:#8a5a17}
.record-go{font-size:1.1rem;line-height:1;color:#b9b1a5}
.more-row{width:100%;min-height:40px;margin-top:.5rem;border:1px solid var(--m-border,#d8d2c8);border-radius:8px;background:transparent;color:#a44213;font:inherit;font-size:.78rem;font-weight:600;cursor:pointer}
.records-empty{display:flex;align-items:center;gap:.75rem;padding:.5rem 0}
.records-empty p{margin:.1rem 0 .35rem}
.jojo-mascot{width:76px;height:76px;object-fit:contain;flex:none}
@media(prefers-reduced-motion:reduce){.date-cell{transition:none}.date-cell:active{transform:none}}
</style>
