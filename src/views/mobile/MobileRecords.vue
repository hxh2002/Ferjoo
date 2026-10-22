<script>
const listPositions = new Map();
</script>

<script setup>
import { computed, nextTick, onActivated, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { listCareRecords, listStarters } from '../../services/care.service.js';
import HistoryCalendar from '../../components/HistoryCalendar.vue';
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
const stripRef = ref(null);
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
const selectedDay = computed(() => query.value.from);
const page = computed(() => Number(query.value.page) || 1);
const selectedStarterId = computed(() => query.value.starter || '');
const selectedStarterName = computed(() => starters.value.find((item) => item.id === selectedStarterId.value)?.name || '');
const isToday = computed(() => selectedDay.value === recentRecordDays().at(-1));
const dayLabel = computed(() => formatDayLabel(selectedDay.value));
const days = computed(() => recentRecordDays().map((value) => ({
  value,
  weekday: `周${'日一二三四五六'[new Date(`${value}T00:00:00`).getDay()]}`,
  day: Number(value.slice(8, 10))
})));
const stripRange = computed(() => `${days.value[0].value.slice(5).replace('-', '/')} – ${days.value.at(-1).value.slice(5).replace('-', '/')}`);
const inStrip = computed(() => days.value.some((item) => item.value === selectedDay.value));
const positionKey = () => JSON.stringify([accountId.value, selectedStarterId.value, selectedDay.value]);
// 展开日历只保留“有记录”一种标记，不恢复四态图例。
const calendarStats = computed(() => Object.fromEntries(Object.keys(marks.value).map((key) => [key, 'feeding'])));

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
  const token = ++generation;
  const owner = accountId.value;
  const day = selectedDay.value;
  const currentPage = page.value;
  const starterId = selectedStarterId.value;
  const current = () => !disposed && token === generation && owner === accountId.value && day === selectedDay.value && currentPage === page.value && starterId === selectedStarterId.value;
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
  const owner = accountId.value;
  const starterId = selectedStarterId.value;
  if (!owner || !starterId) { marks.value = {}; return; }
  const result = await loader.marks(owner, new Date(), starterId, () => !disposed && owner === accountId.value && starterId === selectedStarterId.value).catch(() => null);
  if (result) marks.value = result;
}

function selectDay(value) {
  if (!validLocalDay(value)) return;
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
  selectDay(days.value.at(-1).value);
}
function nextPage() {
  router.replace({ path: '/records', query: { ...query.value, page: String(page.value + 1), scroll: String(Math.round(window.scrollY)) } });
}
function toggleCalendar() {
  if (!calendarOpen.value) calendarMonth.value = new Date(`${selectedDay.value}T00:00:00`).getTime();
  calendarOpen.value = !calendarOpen.value;
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
// 日期带可能横向溢出；始终把当前选中日期滚进可视区。
function revealSelected() {
  stripRef.value?.querySelector('.date-cell.active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

watch(accountId, (owner, previous) => {
  if (previous) { listPositions.clear(); loader.clear(); }
  if (owner) loadMarks();
}, { immediate: true, flush: 'sync' });
watch([accountId, selectedDay, page, selectedStarterId], load, { immediate: true });
watch(selectedStarterId, () => { void loadMarks(); });
watch(selectedDay, () => nextTick(revealSelected));
// 旧链接（type/starter/from-to 范围）在进入时规范化，页面不会读到过期筛选。
// 只在记录页生效：离开本页时 query 会变，否则会把详情页直接顶回列表。
watch(query, (value) => {
  if (route.name !== 'mobile-records') return;
  const keys = ['from', 'to', 'page', 'scroll', 'starter'];
  const changed = Object.keys(route.query).length !== Object.keys(value).length
    || keys.some((key) => (queryText(key) || '') !== (value[key] || ''));
  if (changed) router.replace({ path: '/records', query: value });
}, { immediate: true });
onMounted(async () => {
  auth.init();
  window.addEventListener('scroll', trackScroll, { passive: true });
  await nextTick();
  revealSelected();
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
    <section class="m-card date-card">
      <div class="date-head">
        <div><strong>最近两周</strong><small>{{ stripRange }}</small></div>
        <button type="button" class="date-more" @click="toggleCalendar">{{ calendarOpen ? '收起日期' : '更多日期' }}</button>
      </div>
      <div ref="stripRef" class="date-strip" role="group" aria-label="选择日期">
        <button v-for="item in days" :key="item.value" type="button" class="date-cell" :class="{ active: item.value === selectedDay }" :aria-pressed="item.value === selectedDay" @click="selectDay(item.value)">
          <span class="date-weekday">{{ item.weekday }}</span>
          <span class="date-number">{{ item.day }}</span>
          <span class="date-mark" :class="{ on: marks[item.value] }"></span>
        </button>
      </div>
      <p v-if="!inStrip" class="date-outside">
        已选择 {{ dayLabel }}
        <button type="button" class="date-reset" @click="toToday">回到最近两周</button>
      </p>
      <div v-if="calendarOpen" class="date-calendar">
        <div v-if="starters.length" class="starter-picker" role="group" aria-label="选择酵种">
          <button v-for="item in starters" :key="item.id" type="button" class="starter-chip" :class="{ active: item.id === selectedStarterId }" :aria-pressed="item.id === selectedStarterId" @click="selectStarter(item.id)">{{ item.name }}</button>
        </div>
        <HistoryCalendar :month="calendarMonth" :stats="calendarStats" :selected="selectedDay" @change-month="changeMonth" @select="selectDay" />
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
.date-card{padding:.75rem}
.date-head{display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem}
.date-head strong{display:block;font-size:.9rem}
.date-head small{display:block;margin-top:.1rem;font-size:.72rem;color:var(--m-muted,#625e56)}
.date-more{min-height:32px;padding:.2rem .6rem;border:1px solid var(--m-border,#d8d2c8);border-radius:999px;background:transparent;color:#a44213;font:inherit;font-size:.75rem;font-weight:600;cursor:pointer}
.date-strip{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(34px,1fr);gap:.15rem;margin-top:.6rem;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}
.date-strip::-webkit-scrollbar{display:none}
.date-cell{display:grid;justify-items:center;gap:.1rem;min-height:58px;padding:.25rem .1rem;border:1px solid transparent;border-radius:10px;background:transparent;color:inherit;font:inherit;cursor:pointer}
.date-cell.active{border-color:rgba(164,66,20,.5);background:#fdf3ec;color:#a44213}
.date-weekday{font-size:.62rem;color:var(--m-muted,#625e56)}
.date-number{font-size:.9rem;font-weight:700;font-variant-numeric:tabular-nums}
.date-mark{width:5px;height:5px;border-radius:50%;background:transparent}
.date-mark.on{background:#a44213}
.date-outside{margin:.5rem 0 0;font-size:.75rem;color:var(--m-muted,#625e56)}
.date-reset{margin-left:.35rem;border:0;padding:.1rem 0;background:transparent;color:#a44213;font:inherit;font-size:.75rem;cursor:pointer}
.date-calendar{margin-top:.6rem;padding-top:.4rem;border-top:1px solid var(--m-border,#d8d2c8)}
.date-calendar :deep(.cal-legend){display:none}
.starter-picker{display:flex;flex-wrap:wrap;gap:.4rem;padding:.55rem 0 .1rem}
.starter-chip{max-width:100%;min-height:32px;padding:.2rem .7rem;border:1px solid var(--m-border,#d8d2c8);border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:.76rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
.starter-chip.active{border-color:rgba(164,66,20,.5);background:#fdf3ec;color:#a44213}
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
