<script>
const listPositions = new Map();
</script>

<script setup>
import { computed, nextTick, onActivated, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { listCareRecords, listStarters } from '../../services/care.service.js';

import { listStarterDeviceLinks } from '../../services/starter-device.service.js';
import { mobileDeviceService } from '../../services/mobile-device.service.js';
import { loadWindowClosures } from '../../services/fermentation-window.service.js';
import {
  createRecordsLoader, normalizeRecordsQuery, recentRecordDays, recordDeviceMetrics,
  recordsDayModel, recordsDetailTarget, validLocalDay
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
let panelAnimation;
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
  return values.map((value) => ({ value, day: Number(value.slice(8)),
    off: calendarOpen.value && Number(value.slice(5, 7)) !== new Date(calendarMonth.value).getMonth() + 1,
    today: value === today, future: value > today }));
});
const weekdays = computed(() => {
  const start = calendarOpen.value ? 1 : new Date(`${compactDays.value[0]}T12:00:00`).getDay();
  return Array.from({ length: 7 }, (_, index) => '日一二三四五六'[(start + index) % 7]);
});
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
  const baseline = Number(summary.baselineHeightMm);
  const height = summary.currentHeightMm != null && summary.expansionPercent != null
    ? [baseline > 0 ? `${metric(baseline)} → ${metric(summary.currentHeightMm)} mm` : `${metric(summary.currentHeightMm)} mm`,
      `${summary.expansionPercent >= 0 ? '+' : ''}${summary.expansionPercent.toFixed(0)}%`].join(' · ')
    : '';
  const caveat = summary.dataQuality === 'insufficient' ? '暂无设备数据' : summary.heightStale ? '设备数据偏旧' : '';
  return {
    id: `round:${row.id}`, at: from,
    title: `${range.from}–${range.to}`,
    offset: range.offset,
    titleTip: range.title,
    sub: [carried ? '跨日' : '', `比例 ${ratioText(row.ratio)}`, `${closed ? '历时' : '发酵'} ${durationText(from, to)}`].filter(Boolean).join(' · '),
    note: [height, caveat, row.boundaryPending ? '结束待核实' : ''].filter(Boolean).join(' · '),
    state: closed ? (summary.windowEndReason === 'manual' ? '手动结束' : '已结束') : '进行中',
    tone: closed ? 'closed' : 'active',
    to: recordsDetailTarget(row, returnTo())
  };
}
function observationItem(row) {
  return {
    id: `observation:${row.id}`, at: Date.parse(row.occurred_at),
    title: row.result?.title || '观察记录',
    offset: '',
    sub: `${formatClock(row.occurred_at)} · 观察 · ${starterName(row.starter_id)}`,
    note: '', state: '', tone: '',
    to: recordsDetailTarget(row, returnTo())
  };
}
function deviceItem(row) {
  const samples = row.samples || [];
  const latest = samples.reduce((max, item) => Math.max(max, Date.parse(item.recorded_at) || 0), 0);
  return {
    id: row.id, at: latest || Date.parse(`${row.day}T12:00:00`),
    title: '设备摘要',
    offset: '',
    sub: `${latest ? `最新 ${formatClock(latest)}` : '当天摘要'} · ${samples.length} 条采样`,
    note: recordDeviceMetrics(samples), state: '', tone: '',
    to: recordsDetailTarget(row, returnTo())
  };
}
// 一次喂养就是一轮；观察和设备摘要是同一天时间线上的事件，不再单独成为记录类型。
const timeline = computed(() => {
  if (!model.value) return [];
  const now = Date.now();
  const items = model.value.continuations.map((row) => roundItem(row, true, now));
  for (const row of model.value.events) items.push(row.kind === 'feeding' ? roundItem(row, false, now) : observationItem(row));
  for (const row of model.value.devices) if (row.samples?.length) items.push(deviceItem(row));
  return items.sort((a, b) => a.at - b.at);
});
const daySummary = computed(() => {
  const value = model.value;
  if (!value) return '';
  const observations = value.events.filter((row) => row.kind === 'observation').length;
  const devices = value.devices.filter((row) => row.samples?.length).length;
  return [value.feedingCount ? `${value.feedingCount} 次喂养` : '', observations ? `${observations} 条观察` : '', devices ? `${devices} 份设备摘要` : '']
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
  calendarOpen.value = false;
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
function toggleCalendar() {
  const panel = datePanelRef.value;
  const from = panel?.getBoundingClientRect().height || 0;
  if (!calendarOpen.value) calendarMonth.value = new Date(`${selectedDay.value}T00:00:00`).getTime();
  calendarOpen.value = !calendarOpen.value;
  nextTick(() => {
    if (!panel || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    panelAnimation?.cancel();
    panelAnimation = panel.animate([{ height: `${from}px` }, { height: `${panel.scrollHeight}px` }], {
      duration: 260, easing: 'cubic-bezier(.2,.7,.2,1)'
    });
  });
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
        <button type="button" class="date-more" :aria-expanded="calendarOpen" @click="toggleCalendar">
          <span>{{ calendarOpen ? '收起' : '更多日期' }}</span><span class="date-chevron" :class="{ up: calendarOpen }" aria-hidden="true">⌄</span>
        </button>
      </div>
      <div class="date-view">
          <div v-if="starters.length && calendarOpen" class="starter-picker" role="group" aria-label="选择酵种">
            <button v-for="item in starters" :key="item.id" type="button" class="starter-chip" :class="{ active: item.id === selectedStarterId }" :aria-pressed="item.id === selectedStarterId" @click="selectStarter(item.id)">{{ item.name }}</button>
          </div>
          <div class="weekday-row" :class="{ monthly: calendarOpen }" aria-hidden="true">
            <span v-for="weekday in weekdays" :key="weekday">{{ weekday }}</span>
          </div>
          <div class="date-grid" :class="{ monthly: calendarOpen }" role="group" aria-label="选择日期">
            <button v-for="item in dateCells" :key="item.value" type="button" class="date-cell"
              :class="{ active: item.value === selectedDay, today: item.today, off: item.off, future: item.future, marked: marks[item.value] }"
              :aria-pressed="item.value === selectedDay" :aria-label="formatDayLabel(item.value)" @click="selectDay(item.value)">
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
          <RouterLink v-for="item in timeline" :key="item.id" class="m-list-row record-row" :to="item.to">
            <span class="record-main">
              <span class="record-head">
                <strong class="record-title" :title="item.titleTip">{{ item.title }}</strong>
                <span v-if="item.offset" class="day-offset">{{ item.offset }}</span>
              </span>
              <small class="record-sub">{{ item.sub }}</small>
              <small v-if="item.note" class="record-note">{{ item.note }}</small>
            </span>
            <span class="record-side">
              <span v-if="item.state" class="record-state" :data-tone="item.tone">{{ item.state }}</span>
              <span class="record-go" aria-hidden="true">›</span>
            </span>
          </RouterLink>
          <div v-if="!starters.length" class="records-empty">
            <img class="jojo-mascot" src="/assets/jojo2.png" alt="Jojo 吉祥物" />
            <div><p>还没有酵种，创建后才能按酵种查看记录。</p><RouterLink :to="{ path: '/today' }">去创建酵种</RouterLink></div>
          </div>
          <div v-else-if="!timeline.length" class="records-empty">
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
.m-page{max-width:42rem;margin:auto;padding-bottom:calc(8rem + env(safe-area-inset-bottom))}
.date-card{padding:.7rem .75rem;overflow:hidden}
.date-head{display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-bottom:.35rem}
.date-head strong{display:block;font-size:.9rem}
.date-head small{display:block;margin-top:.1rem;font-size:.7rem;color:var(--m-muted,#625e56)}
.date-more{display:flex;align-items:center;gap:.25rem;min-height:36px;padding:.2rem .55rem;border:0;border-radius:999px;background:#f5eee5;color:#8f3b18;font:inherit;font-size:.74rem;font-weight:650;cursor:pointer}
.date-chevron{display:inline-block;font-size:1rem;line-height:1;transition:transform .22s ease}
.date-chevron.up{transform:rotate(180deg)}
.date-view{transform-origin:top center}
.weekday-row,.date-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));column-gap:.18rem}
.weekday-row{margin-bottom:.15rem;text-align:center;color:var(--m-muted,#756d63);font-size:.62rem}
.weekday-row span{min-height:18px}
.weekday-row.monthly{margin-top:.45rem}
.weekday-row:not(.monthly){visibility:hidden;height:0;margin:0}
.date-grid{row-gap:.1rem}
.date-cell{position:relative;display:grid;place-items:center;min-width:0;min-height:38px;padding:0;border:1px solid transparent;border-radius:50%;background:transparent;color:var(--text-primary,#30251f);font:inherit;font-size:.78rem;font-variant-numeric:tabular-nums;cursor:pointer;transition:background-color .14s ease,color .14s ease,transform .14s ease}
.date-cell:active{transform:scale(.9)}
.date-cell.active{background:#a44213;color:#fff}
.date-cell.today:not(.active){border-color:#a44213;font-weight:700}
.date-cell.off{opacity:.36}
.date-cell.future{opacity:.32;cursor:default}
.date-cell .date-mark{position:absolute;bottom:3px;width:4px;height:4px;border:0;border-radius:50%;background:#a44213}
.date-cell.active .date-mark{background:#fff}
.date-grid:not(.monthly){grid-template-columns:repeat(7,minmax(0,1fr));row-gap:.12rem}
.date-grid:not(.monthly) .date-cell{min-height:34px;border-radius:9px}
.date-grid:not(.monthly) .date-cell:first-child{grid-column:1}
.date-grid:not(.monthly) .date-cell{font-size:.76rem}
.calendar-nav{display:flex;align-items:center;justify-content:space-between;margin-top:.25rem;border-top:1px solid var(--m-border,#e7e0d7)}
.calendar-nav button{min-width:44px;min-height:38px;border:0;background:transparent;color:#8f3b18;font:inherit;font-size:1.2rem;cursor:pointer}
.calendar-nav .calendar-today{font-size:.74rem;font-weight:600}
.day-card{padding:.75rem}
.day-head{display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-bottom:.25rem}
.day-head strong{display:block;font-size:.9rem}
.day-head small{display:block;margin-top:.1rem;font-size:.72rem;color:var(--m-muted,#625e56)}
.day-today{padding:.15rem .5rem;border-radius:999px;background:#e7f4ed;color:#2B7A55;font-size:.7rem;font-weight:600;white-space:nowrap}
.record-row{align-items:center;gap:.6rem;padding:.6rem 0}
.record-main{display:grid;gap:.12rem;min-width:0}
.record-head{display:flex;align-items:center;gap:.25rem;min-width:0}
.record-row .record-title{font-size:.92rem;font-weight:650;color:var(--text-primary,#30251f);font-variant-numeric:tabular-nums;white-space:nowrap}
.record-row .record-sub,.record-row .record-note{display:block;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.35}
.record-row .record-sub{font-size:.74rem;color:var(--text-secondary,#5f574e)}
.record-row .record-note{font-size:.72rem;color:var(--m-muted,#8a8277);font-variant-numeric:tabular-nums}
.day-offset{display:inline-grid;place-items:center;min-width:.95rem;height:.85rem;padding:0 .16rem;border-radius:999px;background:#f2dcd7;color:#a4524a;font-size:.56rem;line-height:1;font-weight:600}
.record-side{display:flex;align-items:center;gap:.3rem;flex:none}
.record-state{padding:.12rem .45rem;border-radius:999px;font-size:.68rem;font-weight:600;background:#e8f0fa;color:#2B6CB0;white-space:nowrap}
.record-state[data-tone="closed"]{background:#e7f4ed;color:#2B7A55}
.record-go{font-size:1.1rem;line-height:1;color:#b9b1a5}
.more-row{width:100%;min-height:40px;margin-top:.5rem;border:1px solid var(--m-border,#d8d2c8);border-radius:8px;background:transparent;color:#a44213;font:inherit;font-size:.78rem;font-weight:600;cursor:pointer}
.records-empty{display:flex;align-items:center;gap:.75rem;padding:.5rem 0}
.records-empty p{margin:.1rem 0 .35rem}
.jojo-mascot{width:76px;height:76px;object-fit:contain;flex:none}
</style>
