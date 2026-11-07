<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { listCareRecords } from '../../services/care.service.js';
import { loadFeedingEvidence } from '../../services/feeding-analysis.service.js';
import { formatDoctorRound, localDayKey, recordDayRange, validLocalDay } from '../../lib/mobile-records.js';
import { isUuid } from '../../lib/uuid.js';
import MCalendar from '../../components/mobile/MCalendar.vue';
import MWheelPicker from '../../components/mobile/MWheelPicker.vue';

defineOptions({ name: 'MobileDoctorRounds' });
const route = useRoute();
const router = useRouter();
const auth = useAuth();
const headerTone = inject('mobileHeaderTone', null);
const rows = ref([]);
const loading = ref(false);
const error = ref('');
const picker = ref('');
let generation = 0;

function dayFromQuery(value = route.query.date) {
  const today = localDayKey();
  return validLocalDay(value) && value <= today ? value : today;
}
const day = computed(() => dayFromQuery());
const earliestDay = computed(() => {
  const date = new Date(`${localDayKey()}T12:00:00`);
  date.setDate(date.getDate() - 365);
  return localDayKey(date);
});
const dayTitle = computed(() => {
  const [, month, date] = day.value.split('-');
  return `${Number(month)} 月 ${Number(date)} 日`;
});
const rounds = computed(() => rows.value.map((row) => ({ ...formatDoctorRound(row, { elapsedHours: row.elapsedHours, closed: row.closed }), id: row.id, starterId: row.starter_id })));
const yearOptions = computed(() => {
  const end = Number(localDayKey().slice(0, 4));
  const start = Number(earliestDay.value.slice(0, 4));
  return Array.from({ length: end - start + 1 }, (_, index) => ({ value: String(start + index), label: `${start + index} 年` }));
});
const monthOptions = Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1).padStart(2, '0'), label: `${index + 1} 月` }));

function chooseDay(value, close = true) {
  if (!validLocalDay(value) || value > localDayKey() || value < earliestDay.value) return;
  if (close) picker.value = '';
  router.replace({ query: { ...route.query, date: value } });
}
function chooseMonth(year = day.value.slice(0, 4), month = day.value.slice(5, 7)) {
  const candidate = `${year}-${month}-01`;
  const last = new Date(Number(year), Number(month), 0).getDate();
  const preferred = `${year}-${month}-${day.value.slice(-2)}`;
  const next = validLocalDay(preferred) && Number(preferred.slice(-2)) <= last ? preferred : candidate;
  chooseDay(next > localDayKey() ? localDayKey() : next < earliestDay.value ? earliestDay.value : next, false);
}

async function load() {
  const token = ++generation;
  const owner = auth.user.value?.id;
  error.value = '';
  rows.value = [];
  if (!owner) return;
  loading.value = true;
  try {
    const starter = typeof route.query.starter === 'string' && isUuid(route.query.starter) ? route.query.starter : undefined;
    const range = recordDayRange(day.value);
    const records = await listCareRecords({ userId: owner, ...(starter ? { starterId: starter } : {}), kind: 'feeding', ...range, limit: 50, ascending: true });
    const detailed = await Promise.all(records.map(async (row) => {
      try {
        const evidence = await loadFeedingEvidence(owner, row.starter_id, row.id);
        const summary = evidence?.summary;
        const elapsedHours = Number(summary?.elapsedHours);
        const closed = summary?.windowStatus === 'closed';
        return { ...row, elapsedHours: closed && Number.isFinite(elapsedHours) ? elapsedHours : undefined, closed };
      } catch {
        return row;
      }
    }));
    if (token === generation) rows.value = detailed;
  } catch (cause) {
    if (token === generation) error.value = cause?.message || '喂养记录读取失败，请重试。';
  } finally {
    if (token === generation) loading.value = false;
  }
}
watch([() => auth.user.value?.id, day, () => route.query.starter], () => { auth.init().then(load); }, { immediate: true });
onMounted(() => { if (headerTone) headerTone.value = 'detail'; });
onBeforeUnmount(() => { if (headerTone) headerTone.value = ''; });
</script>

<template>
  <main class="m-page doctor-rounds">
    <header class="doctor-head">
      <h1>选择发酵轮次</h1>
      <small>选择需要了解的一次喂养</small>
    </header>
    <div class="day-row">
      <strong>{{ dayTitle }}</strong>
      <button type="button" class="day-picker" :aria-expanded="picker === 'day'" @click="picker = picker === 'day' ? '' : 'day'">选择日期 ›</button>
    </div>
    <MCalendar v-if="picker === 'day'" :model-value="day" :min="earliestDay" :max="localDayKey()" @update:model-value="chooseDay" />
    <button v-if="picker === 'day'" type="button" class="month-entry" @click="picker = 'month'">选择年月</button>
    <div v-if="picker === 'month'" class="month-wheels">
      <MWheelPicker :model-value="day.slice(0, 4)" :options="yearOptions" label="年份" @update:model-value="chooseMonth($event, day.slice(5, 7))" />
      <MWheelPicker :model-value="day.slice(5, 7)" :options="monthOptions" label="月份" @update:model-value="chooseMonth(day.slice(0, 4), $event)" />
    </div>
    <div v-if="loading" class="m-skeleton" role="status" aria-label="正在读取喂养记录"><span></span><span></span><span></span></div>
    <p v-else-if="error" class="m-error" role="alert">{{ error }} <button type="button" class="retry" @click="load">重试</button></p>
    <p v-else-if="!auth.user.value" class="m-muted">登录后可以选择发酵轮次。<RouterLink :to="{ path: '/login', query: { redirect: route.fullPath } }">去登录</RouterLink></p>
    <p v-else-if="!rounds.length" class="empty">该日期暂无喂养记录，请选择其他日期</p>
    <RouterLink v-for="round in rounds" :key="round.id" class="round-card" :to="{ path: '/checkin', query: { starter: round.starterId, feeding: round.id, mode: 'diagnosis', returnTo: route.fullPath } }">
      <span><strong>{{ round.title }}</strong><small>{{ round.detail }}</small></span>
      <span class="round-chevron" aria-hidden="true">›</span>
    </RouterLink>
  </main>
</template>

<style scoped>
.mobile-area .m-page.doctor-rounds{padding-top:calc(41px + env(safe-area-inset-top));gap:0}
/* 370:17647：顶栏「酵种医生」底 91 → 标题 132（41）；标题 31 高 → 说明 169（6）；说明 20 高 → 日期行顶 215（26）。 */
.mobile-area .m-page.doctor-rounds .doctor-head h1{margin:0;font-size:22px;line-height:31px;font-weight:500;letter-spacing:0}
.doctor-head small{display:block;margin:6px 0 0;color:var(--text-secondary);font-size:14px;line-height:20px}
.mobile-area .m-page.doctor-rounds .day-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:26px 0 11px}
.day-row strong{font-size:14px;line-height:21px;font-weight:400}
.day-picker,.month-entry,.retry{min-height:34px;padding:0 12px;border:1px solid var(--border-warm);border-radius:17px;background:var(--surface-card);color:var(--text-primary);font:inherit;font-size:14px}
.day-picker{width:115px;height:34px;padding:0 10px;border:0;border-radius:17px;background:var(--m-date-capsule-bg);color:var(--m-date-capsule-text);font-size:13px}
.month-entry{margin:8px 0 12px}
.month-wheels{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.empty{margin:14px 0;color:var(--text-secondary);font-size:var(--text-sm);line-height:21px}
/* 370:17647：轮次卡 327×76、圆角 18、无边框无阴影，内边距 12 16；
   标题 x=40（卡内 16）、16/22 起于 y=272，次行 12/17 起于 y=302（间距 8），chevron 20×31 居中。
   内容顶端对齐，多出的 5px 留在卡底，才能同时命中标题与次行的 y。 */
.mobile-area .m-page.doctor-rounds .round-card{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;min-height:76px;margin:0 0 14px;padding:12px 16px;border:0;border-radius:18px;background:var(--surface-card);color:inherit;text-decoration:none;box-shadow:none}
.round-card span{display:grid;gap:8px;min-width:0}
.round-card strong{font-size:var(--text-md);font-weight:500;line-height:22px}
.round-card small{color:var(--text-secondary);font-size:var(--text-xs);line-height:17px}
.round-chevron{align-self:center;display:grid;place-items:center;width:20px;height:31px;color:var(--brand-action);font-size:22px;line-height:1}
.doctor-rounds .m-calendar{margin:0 0 11px}
</style>
