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

const route = useRoute();
const router = useRouter();
const auth = useAuth();
defineOptions({ name: 'MobileRecords' });

const starters = ref([]);
const facts = ref([]);
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
const isToday = computed(() => selectedDay.value === recentRecordDays().at(-1));
const dayLabel = computed(() => formatDayLabel(selectedDay.value));
const days = computed(() => recentRecordDays().map((value) => ({
  value,
  weekday: `周${'日一二三四五六'[new Date(`${value}T00:00:00`).getDay()]}`,
  day: Number(value.slice(8, 10))
})));
const stripRange = computed(() => `${days.value[0].value.slice(5).replace('-', '/')} – ${days.value.at(-1).value.slice(5).replace('-', '/')}`);
const inStrip = computed(() => days.value.some((item) => item.value === selectedDay.value));
const positionKey = () => JSON.stringify([accountId.value, selectedDay.value]);
// 展开日历只保留“有记录”一种标记，不恢复四态图例。
const calendarStats = computed(() => Object.fromEntries(Object.keys(marks.value).map((key) => [key, 'feeding'])));

function returnTo() {
  const value = { from: selectedDay.value, to: selectedDay.value, page: String(page.value), scroll: String(Math.round(scrollY.value)) };
  return router.resolve({ path: '/records', query: value }).fullPath;
}
const feedingTarget = computed(() => ({ path: '/feeding' }));

function roundItem(row, carried, now) {
  const summary = row.summary || {};
  const from = Date.parse(summary.windowFrom || row.occurred_at);
  const closed = summary.windowStatus === 'closed';
  const to = Date.parse(summary.windowClosedAt || (closed ? summary.windowTo : new Date(now).toISOString())) || now;
  const bits = [];
  if (summary.baselineHeightMm > 0) bits.push(`基线 ${metric(summary.baselineHeightMm)} mm · ${summary.baselineSource === 'manual' ? '手工' : '自动'}`);
  if (summary.currentHeightMm != null && summary.expansionPercent != null) bits.push(`当前 ${metric(summary.currentHeightMm)} mm · 膨胀 ${summary.expansionPercent >= 0 ? '+' : ''}${summary.expansionPercent.toFixed(1)}%`);
  if (row.boundaryPending) bits.push('轮次结束待核实');
  else if (closed) bits.push(summary.windowEndReason === 'manual' ? '手动结束' : '下一次喂养结束');
  if (summary.dataQuality === 'insufficient') bits.push('暂无设备数据');
  else if (summary.heightStale) bits.push('设备数据偏旧');
  return {
    id: `round:${row.id}`, at: from,
    title: `${carried ? '跨日 · 上一轮' : '喂养'} · ${ratioText(row.ratio)}`,
    range: rangeText(from, to),
    meta: `${starterName(row.starter_id)} · ${durationText(from, to)}`,
    extra: bits.join(' · '),
    state: closed ? '已结束' : '进行中',
    tone: closed ? 'closed' : 'active',
    to: recordsDetailTarget(row, returnTo())
  };
}
function observationItem(row) {
  return {
    id: `observation:${row.id}`, at: Date.parse(row.occurred_at),
    title: row.result?.title || '观察记录',
    range: null,
    meta: `${starterName(row.starter_id)} · ${formatClock(row.occurred_at)}`,
    extra: '', state: '', tag: '观察',
    to: recordsDetailTarget(row, returnTo())
  };
}
function deviceItem(row) {
  const latest = row.samples?.length ? row.samples.at(-1).recorded_at : null;
  return {
    id: row.id, at: latest ? Date.parse(latest) : Date.parse(`${row.day}T12:00:00`),
    title: `设备数据 · ${row.samples?.length || 0} 条采样`,
    range: null,
    meta: `${starterName(row.starter_id)} · 最新 ${formatClock(latest)}`,
    extra: recordDeviceMetrics(row.samples || []),
    state: '', tag: '设备',
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

let generation = 0;
let disposed = false;
async function load() {
  const token = ++generation;
  const owner = accountId.value;
  const day = selectedDay.value;
  const currentPage = page.value;
  const current = () => !disposed && token === generation && owner === accountId.value && day === selectedDay.value && currentPage === page.value;
  facts.value = []; model.value = null; hasMore.value = false;
  error.value = ''; notice.value = ''; loading.value = false;
  if (!owner) return;
  loading.value = true;
  try {
    const names = await listStarters({ userId: owner }).catch(() => []);
    if (!current()) return;
    starters.value = names;
    const starterIds = names.map((item) => item.id);
    const [factPage, context, devices] = await Promise.all([
      loader.facts(owner, day, currentPage, current),
      loader.context(owner, day, starterIds, current),
      loader.devices(owner, day, starterIds, current)
    ]);
    if (!current() || !factPage) return;
    facts.value = factPage.rows;
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
  if (!owner) return;
  const result = await loader.marks(owner, new Date(), () => !disposed && owner === accountId.value).catch(() => null);
  if (result) marks.value = result;
}

function selectDay(value) {
  if (!validLocalDay(value)) return;
  calendarOpen.value = false;
  listPositions.delete(positionKey());
  router.replace({ path: '/records', query: { from: value, to: value, page: '1', scroll: '0' } });
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
watch([accountId, selectedDay, page], load, { immediate: true });
watch(selectedDay, () => nextTick(revealSelected));
// 旧链接（type/starter/from-to 范围）在进入时规范化，页面不会读到过期筛选。
watch(query, (value) => {
  const keys = ['from', 'to', 'page', 'scroll'];
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
        <HistoryCalendar :month="calendarMonth" :stats="calendarStats" :selected="selectedDay" @change-month="changeMonth" @select="selectDay" />
      </div>
    </section>

    <section v-if="!auth.user.value" class="m-card records-empty"><img class="jojo-mascot" src="/assets/jojo1.png" alt="Jojo 吉祥物"><div><p>登录后读取你的喂养与观察记录。</p><RouterLink :to="{ path: '/login', query: { redirect: route.fullPath } }">去登录</RouterLink></div></section>
    <template v-else>
      <section class="m-card day-card">
        <div class="day-head">
          <div><strong>{{ dayLabel }}</strong><small>{{ daySummary || '这一天没有记录' }}</small></div>
          <span v-if="isToday" class="day-today">今天</span>
        </div>
        <p v-if="loading" class="m-muted" role="status">正在读取记录…</p>
        <p v-if="error" class="m-error" role="alert">{{ error }}</p>
        <p v-if="notice" class="m-muted" role="status">{{ notice }}</p>
        <template v-if="!loading && !error">
          <RouterLink v-for="item in timeline" :key="item.id" class="m-list-row record-row" :to="item.to">
            <span class="record-main">
              <strong>{{ item.title }}</strong>
              <small>
                <span v-if="item.range" class="record-range" :title="item.range.title">
                  <span v-if="item.range.offset" class="day-offset">{{ item.range.offset }}</span>
                  <span>{{ item.range.from }}</span><span class="range-separator">–</span><span>{{ item.range.to }}</span>
                </span>
                <span class="record-meta">{{ item.meta }}</span>
              </small>
              <small v-if="item.extra" class="record-extra">{{ item.extra }}</small>
            </span>
            <span class="record-side">
              <span v-if="item.state" class="record-state" :data-tone="item.tone">{{ item.state }}</span>
              <span v-else class="record-tag">{{ item.tag }}</span>
              <b>详情</b>
            </span>
          </RouterLink>
          <div v-if="!timeline.length" class="records-empty">
            <img class="jojo-mascot" src="/assets/jojo2.png" alt="Jojo 吉祥物">
            <div><p>{{ isToday ? '今天还没有记录。' : '这一天没有记录。' }}</p><RouterLink :to="feedingTarget">记录一次喂养</RouterLink></div>
          </div>
          <button v-if="hasMore" type="button" class="more-row" :disabled="loading" @click="nextPage">加载更多记录</button>
          <p v-else-if="timeline.length" class="records-hint">已显示 {{ facts.length }} 条记录</p>
        </template>
      </section>
      <p v-if="!inStrip" class="m-muted records-hint">更早的日期可通过“更多日期”选择，历史记录仍可查看。</p>
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
.day-card{padding:.75rem}
.day-head{display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-bottom:.25rem}
.day-head strong{display:block;font-size:.9rem}
.day-head small{display:block;margin-top:.1rem;font-size:.72rem;color:var(--m-muted,#625e56)}
.day-today{padding:.15rem .5rem;border-radius:999px;background:#e7f4ed;color:#2B7A55;font-size:.7rem;font-weight:600;white-space:nowrap}
.record-row{align-items:flex-start}
.record-main{display:grid;gap:2px;min-width:0}
.record-main strong{font-size:.85rem;font-weight:600}
.record-main small{display:flex;flex-wrap:wrap;align-items:center;gap:.2rem;min-width:0;font-size:.72rem;color:var(--m-muted,#625e56)}
.record-range{display:inline-flex;align-items:center;gap:.15rem;font-weight:600;color:var(--text-primary,#30251f);font-variant-numeric:tabular-nums;white-space:nowrap}
.record-range .day-offset{display:inline-grid;place-items:center;min-width:.7rem;height:.7rem;padding:0 .04rem;border-radius:50%;background:#f2dcd7;color:#a4524a;font-size:.46rem;line-height:1;font-weight:600}
.record-range .range-separator{color:var(--m-muted,#625e56)}
.record-meta{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.record-extra{color:var(--m-muted,#625e56)}
.record-side{display:grid;justify-items:end;gap:2px;flex:none}
.record-state{padding:.12rem .45rem;border-radius:999px;font-size:.68rem;font-weight:600;background:#e8f0fa;color:#2B6CB0;white-space:nowrap}
.record-state[data-tone="closed"]{background:#e7f4ed;color:#2B7A55}
.record-tag{padding:.12rem .45rem;border-radius:999px;font-size:.68rem;font-weight:600;background:var(--m-surface,#fffdf8);color:var(--m-muted,#625e56);border:1px solid var(--m-border,#d8d2c8);white-space:nowrap}
.record-row b{color:#a44213;font-size:.82rem;font-weight:600}
.more-row{width:100%;min-height:40px;margin-top:.5rem;border:1px solid var(--m-border,#d8d2c8);border-radius:8px;background:transparent;color:#a44213;font:inherit;font-size:.78rem;font-weight:600;cursor:pointer}
.records-empty{display:flex;align-items:center;gap:.75rem;padding:.5rem 0}
.records-empty p{margin:.1rem 0 .35rem}
.jojo-mascot{width:76px;height:76px;object-fit:contain;flex:none}
.records-hint{margin:.5rem 0 0;font-size:.72rem}
</style>
