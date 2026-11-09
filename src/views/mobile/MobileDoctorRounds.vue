<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { listCareRecords } from '../../services/care.service.js';
import { loadFeedingEvidence } from '../../services/feeding-analysis.service.js';
import { formatDoctorRound, localDayKey, recordDayRange, validLocalDay } from '../../lib/mobile-records.js';
import { isUuid } from '../../lib/uuid.js';
import { guestLoginTarget, guestRegisterTarget, isAuthPending, isGuest } from '../../lib/mobile-guest.js';
import MCalendar from '../../components/mobile/MCalendar.vue';
import MWheelPicker from '../../components/mobile/MWheelPicker.vue';
import MGuestNotice from '../../components/mobile/MGuestNotice.vue';

defineOptions({ name: 'MobileDoctorRounds' });
const route = useRoute();
const router = useRouter();
const auth = useAuth();
const headerTone = inject('mobileHeaderTone', null);
// 路由 meta.requiresAuth 已把游客挡在门外，这里再兜一层：直接渲染组件（或会话过期）时也不能请求云端。
const guest = computed(() => isGuest(auth));
const authPending = computed(() => isAuthPending(auth));
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
// 「完成」只收起年月滚轮、回到日历；滚轮已经把所选年月写进 route.query.date，这里不再改动。
function finishMonth() {
  picker.value = 'day';
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
    <!-- 370:18946 年月 / 双列滚轮示意：与日记页同款，右下角「完成 / 收起年月」。 -->
    <div v-if="picker === 'month'" class="month-wheels">
      <div class="month-wheel">
        <span class="month-wheel-caption">年份</span>
        <MWheelPicker :model-value="day.slice(0, 4)" :options="yearOptions" label="年份" :row-height="30" :height="140" @update:model-value="chooseMonth($event, day.slice(5, 7))" />
      </div>
      <div class="month-wheel">
        <span class="month-wheel-caption">月份</span>
        <MWheelPicker :model-value="day.slice(5, 7)" :options="monthOptions" label="月份" :row-height="30" :height="140" @update:model-value="chooseMonth(day.slice(0, 4), $event)" />
      </div>
      <button type="button" class="month-wheel-done" @click="finishMonth">完成</button>
    </div>
    <div v-if="loading" class="m-skeleton" role="status" aria-label="正在读取喂养记录"><span></span><span></span><span></span></div>
    <p v-else-if="error" class="m-error" role="alert">{{ error }} <button type="button" class="retry" @click="load">重试</button></p>
    <MGuestNotice
      v-else-if="authPending"
      compact
      title="正在恢复登录状态"
      description="稍候即可读取本账号的发酵轮次。"
      :login-to="guestLoginTarget(route)"
    />
    <MGuestNotice
      v-else-if="guest"
      title="登录后可以选择发酵轮次"
      description="诊断只读取你本人酵种的喂养与采样记录。"
      :login-to="guestLoginTarget(route)"
      :register-to="guestRegisterTarget(route)"
      register
    />
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
/* 370:18946：卡 295×178、圆角 14；与日记页 .month-wheels 逐条同款（渐隐用卡片底色，「完成」在文档流里单独一行、压在渐隐之上）。 */
.month-wheels{--m-wheel-fade-bg:var(--surface-card);position:relative;isolation:isolate;display:grid;grid-template-columns:1fr 1fr;column-gap:35px;margin:0 0 12px;padding:8px 16px 3px;border-radius:14px;background:var(--surface-card);box-shadow:0 3px 12px rgba(77,46,26,.12)}
.month-wheel{display:grid;gap:0;min-width:0}
.month-wheel-caption{display:block;height:20px;font-size:12px;line-height:20px;font-weight:400;color:var(--text-secondary);text-align:center}
.month-wheel :deep(.m-wheel-picker){height:140px}
.month-wheel-done{position:relative;z-index:3;grid-column:1 / -1;justify-self:end;margin-top:2px;min-width:64px;height:26px;padding:0;border:0;background:transparent;color:var(--m-text-link);font:inherit;font-size:13px;line-height:26px;font-weight:500;text-align:center;cursor:pointer}
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
