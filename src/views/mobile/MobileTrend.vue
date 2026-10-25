<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { deviceStatus, mobileDeviceService, mobileError } from '../../services/mobile-device.service.js';
import { localDateTimeValue } from '../../lib/localDateTime.js';
import { listStarterDeviceLinks } from '../../services/starter-device.service.js';

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const deviceId = computed(() => String(route.params.deviceId || ''));
const starterId = computed(() => typeof route.query.starter === 'string' ? route.query.starter : '');
const todayValue = computed(() => localDateTimeValue(new Date()).slice(0, 10));
const day = computed(() => {
  const value = typeof route.query.day === 'string' ? route.query.day : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : todayValue.value;
});
const dayStart = computed(() => new Date(`${day.value}T00:00:00`));
const dayEnd = computed(() => {
  const value = new Date(dayStart.value);
  value.setDate(value.getDate() + 1);
  return value;
});

const device = ref(null); const rows = ref([]);
const loading = ref(false); const error = ref(''); const completeness = ref('');
const now = ref(Date.now());
let version = 0; let hidden = false;

const isToday = computed(() => day.value === todayValue.value);
const rangeText = computed(() => isToday.value ? '今天 00:00 – 现在' : `${formatDayLabel(day.value)} 00:00 – 24:00`);
// 明细表与桌面版一致，最新采样排在最前。
const tableRows = computed(() => [...rows.value].reverse().map((row) => ({ ...row, status: deviceStatus(row) })));
const validCount = computed(() => rows.value.filter((row) => !row.sensor_error && row.mode === 'fer').length);
const summaryText = computed(() => {
  const latest = rows.value.at(-1);
  return [
    rangeText.value,
    rows.value.length ? `${rows.value.length} 条采样` : '',
    validCount.value !== rows.value.length ? `有效 ${validCount.value} 条` : '',
    latest ? `最新 ${formatClock(latest.recorded_at)}` : ''
  ].filter(Boolean).join(' · ');
});

function cell(value, digits) {
  const n = Number(value);
  return value == null || value === '' || !Number.isFinite(n) ? '—' : n.toFixed(digits);
}
function pad(value) { return String(value).padStart(2, '0'); }
function formatDayLabel(value) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isFinite(date.getTime()) ? `${date.getMonth() + 1}月${date.getDate()}日` : value;
}
function formatClock(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : '--';
}
function changeDay(event) {
  const value = event.target.value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
  router.replace({ path: route.path, query: { ...route.query, day: value } });
}

async function load() {
  const token = ++version; const owner = auth.user.value?.id; const id = deviceId.value;
  rows.value = [];
  error.value = ''; completeness.value = ''; loading.value = true; now.value = Date.now();
  if (!owner || !id) { loading.value = false; return; }
  try {
    const service = await mobileDeviceService();
    const startMs = dayStart.value.getTime();
    const endMs = Math.min(dayEnd.value.getTime(), now.value);
    const info = await service.getDevice(id, owner);
    if (token !== version) return;
    device.value = info;

    let periods = [];
    if (starterId.value) {
      const links = await listStarterDeviceLinks({ userId: owner, starterId: starterId.value });
      if (token !== version) return;
      periods = links.filter((row) => row.device_id === id)
        .map((row) => [Date.parse(row.active_from), row.active_to ? Date.parse(row.active_to) : Infinity])
        .filter(([from, to]) => to > startMs && from < endMs);
    }

    let measured = [];
    if (endMs - startMs >= 600000) {
      const result = await service.range(id, { from: new Date(startMs).toISOString(), to: new Date(endMs).toISOString() });
      if (token !== version) return;
      measured = result.rows;
      completeness.value = result.complete ? '' : '这一天的采样尚未完整加载，请稍后重试。';
    }
    if (periods.length) {
      measured = measured.filter((row) => {
        const at = Date.parse(row.recorded_at);
        return periods.some(([from, to]) => at >= from && at < to);
      });
    }
    rows.value = measured;
  } catch (cause) {
    if (token === version) error.value = cause?.message || mobileError(cause);
  } finally {
    if (token === version) loading.value = false;
  }
}

function onVisibility() { hidden = document.hidden; if (!hidden) load(); }
watch(() => auth.user.value?.id, (next, old) => { if (next !== old) { version++; rows.value = []; device.value = null; loading.value = false; if (next) load(); } });
watch([deviceId, starterId, day], load);
onMounted(async () => {
  await auth.init();
  document.addEventListener('visibilitychange', onVisibility);
  if (auth.user.value) load();
});
onBeforeUnmount(() => { version++; document.removeEventListener('visibilitychange', onVisibility); });
</script>

<template>
  <main class="m-page">
    <header class="day-head">
      <div>
        <h1>{{ device?.name || '数据明细' }}</h1>
        <p class="m-muted">{{ summaryText }}</p>
      </div>
      <label class="m-field">日期<input type="date" :value="day" :max="todayValue" @change="changeDay"></label>
    </header>
    <p v-if="completeness" class="m-error">{{ completeness }}</p>
    <p v-if="error" class="m-error" role="alert">{{ error }}</p>
    <p v-if="loading" class="m-muted" role="status">正在读取设备数据…</p>

    <section class="table-card">
      <div class="chart-title"><strong>数据明细</strong><span>{{ tableRows.length }} 条 · 最新在前</span></div>
      <p v-if="!tableRows.length && !loading" class="m-muted">这一天还没有采样数据。</p>
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">时间</th>
              <th scope="col">设备状态</th>
              <th scope="col">高度<small>mm</small></th>
              <th scope="col">温度<small>°C</small></th>
              <th scope="col">湿度<small>%</small></th>
              <th scope="col">电量<small>%</small></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in tableRows" :key="row.id" :class="{ 'is-bad': row.status.tone === 'bad' }">
              <td>{{ formatClock(row.recorded_at) }}</td>
              <td class="status-cell"><span class="row-status" :data-tone="row.status.tone">{{ row.status.label }}</span></td>
              <td>{{ cell(row.height_mm, 1) }}</td>
              <td>{{ cell(row.temperature_c, 1) }}</td>
              <td>{{ cell(row.humidity_percent, 0) }}</td>
              <td>{{ cell(row.battery_percent, 0) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="table-note">休眠、传感器故障或模式异常的采样仍保留在明细中，但不参与膨胀率计算。</p>
    </section>
  </main>
</template>

<style scoped>
.day-head{display:grid;gap:.5rem;margin-bottom:.75rem}
.day-head p{margin:.2rem 0 0;font-size:.8rem}
.m-field{display:flex;align-items:center;gap:.5rem;font-size:.8rem;color:var(--m-muted,#625e56)}
.m-field input{flex:1;min-height:44px;padding:.45rem .65rem;font:inherit;color:inherit;background:var(--m-surface,#fffdf8);border:1px solid var(--m-border,#d8d2c8);border-radius:8px}
.table-card{margin:.75rem 0;padding:.85rem;border:1px solid var(--m-border,#d8d2c8);border-radius:12px}
.chart-title{display:flex;align-items:center;justify-content:space-between;gap:.75rem;margin-bottom:.65rem}
.chart-title span{font-size:.75rem;color:var(--m-muted,#625e56)}
.table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
.table-card table{width:100%;border-collapse:collapse;font-size:.75rem;font-variant-numeric:tabular-nums}
.table-card th,.table-card td{padding:.4rem .3rem;text-align:right;white-space:nowrap;border-bottom:1px solid #ece5d9}
.table-card thead th{color:var(--m-muted,#625e56);font-weight:600;font-size:.7rem;border-bottom-color:var(--m-border,#d8d2c8)}
.table-card th small{display:block;font-size:.62rem;font-weight:400}
.table-card th:first-child,.table-card td:first-child{text-align:left}
.table-card .status-cell{text-align:left}
.row-status{display:inline-block;padding:.1rem .4rem;border-radius:var(--radius-badge);background:#e8f0fa;font-size:.66rem;font-weight:600;line-height:1.5;color:#2B6CB0}
.row-status[data-tone="ok"]{background:#e7f4ed;color:#2B7A55}
.row-status[data-tone="idle"]{background:#f1ece4;color:#625e56}
.row-status[data-tone="bad"]{background:#fdf1ee;color:#8a4a42}
.row-status[data-tone="warn"]{background:#fdf3e2;color:#8a5a17}
.table-card tbody tr.is-bad{background:#fdf1ee;color:#8a4a42}
.table-card tbody tr:last-child td{border-bottom:0}
.table-note{margin:.4rem 0 0;font-size:.7rem;line-height:1.5;color:var(--m-muted,#625e56)}
</style>
