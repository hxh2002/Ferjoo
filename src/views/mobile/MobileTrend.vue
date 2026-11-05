<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { deviceStatus, mobileDeviceService, mobileError } from '../../services/mobile-device.service.js';
import { localDateTimeValue } from '../../lib/localDateTime.js';
import { listStarterDeviceLinks } from '../../services/starter-device.service.js';
import { READ_TTL, cachedRead, peekReadCache, readCacheKey } from '../../lib/read-cache.js';
import SeriesChart from '../../components/SeriesChart.vue';

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
const INCOMPLETE = '这一天的采样尚未完整加载，请稍后重试。';
// 同一天、同一设备的数据整体复用，设备变更会清空该命名空间。
const snapshotKey = computed(() => readCacheKey(['device', 'trend', auth.user.value?.id ?? '', deviceId.value, starterId.value, day.value]));

const device = ref(null); const rows = ref([]);
const loading = ref(false); const error = ref(''); const completeness = ref('');
let version = 0; let hidden = false;

const isToday = computed(() => day.value === todayValue.value);
const rangeText = computed(() => isToday.value ? '今天 00:00 – 现在' : `${formatDayLabel(day.value)} 00:00 – 24:00`);
// 明细表与桌面版一致，最新采样排在最前。
const tableRows = computed(() => [...rows.value].reverse().map((row) => ({ ...row, status: deviceStatus(row) })));
const chartPoints = computed(() => {
  const points = (key) => rows.value.map((row) => ({ t: row.recorded_at, v: row[key] == null ? null : Number(row[key]) }));
  return {
    height: points('height_mm'), temperature: points('temperature_c'),
    humidity: points('humidity_percent'), battery: points('battery_percent')
  };
});
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
  error.value = '';
  if (!owner || !id) { rows.value = []; device.value = null; completeness.value = ''; loading.value = false; return; }
  const key = snapshotKey.value;
  // 再次进入同一天时先用缓存立即渲染，避免整页先清空再出现。
  const cached = peekReadCache(key);
  if (cached) {
    device.value = cached.info;
    rows.value = cached.rows;
    completeness.value = cached.complete ? '' : INCOMPLETE;
    loading.value = false;
  } else {
    rows.value = []; completeness.value = ''; loading.value = true;
  }
  try {
    const snapshot = await cachedRead(key, () => fetchSnapshot(owner, id), { ttl: READ_TTL.device });
    if (token !== version) return;
    device.value = snapshot.info;
    rows.value = snapshot.rows;
    completeness.value = snapshot.complete ? '' : INCOMPLETE;
  } catch (cause) {
    if (token === version) error.value = cause?.message || mobileError(cause);
  } finally {
    if (token === version) loading.value = false;
  }
}

async function fetchSnapshot(owner, id) {
  const service = await mobileDeviceService();
  const startMs = dayStart.value.getTime();
  const endMs = Math.min(dayEnd.value.getTime(), Date.now());
  const info = await service.getDevice(id, owner);

  let periods = [];
  if (starterId.value) {
    const links = await listStarterDeviceLinks({ userId: owner, starterId: starterId.value });
    periods = links.filter((row) => row.device_id === id)
      .map((row) => [Date.parse(row.active_from), row.active_to ? Date.parse(row.active_to) : Infinity])
      .filter(([from, to]) => to > startMs && from < endMs);
  }

  let measured = [];
  let complete = true;
  if (endMs - startMs >= 600000) {
    const result = await service.range(id, { from: new Date(startMs).toISOString(), to: new Date(endMs).toISOString() });
    measured = result.rows;
    complete = result.complete;
  }
  if (starterId.value) {
    measured = measured.filter((row) => {
      const at = Date.parse(row.recorded_at);
      return periods.some(([from, to]) => at >= from && at < to);
    });
  }
  return { info, rows: measured, complete };
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
  <main class="m-page mobile-trend">
    <header class="trend-head">
      <div class="trend-title">
        <h1>{{ device?.name || '数据明细' }}</h1>
        <p class="m-muted">{{ summaryText }}</p>
      </div>
      <label class="day-picker">
        <span class="day-picker-label">日期</span>
        <input type="date" :value="day" :max="todayValue" @change="changeDay" />
      </label>
    </header>
    <p v-if="completeness" class="m-error">{{ completeness }}</p>
    <p v-if="error" class="m-error" role="alert">{{ error }}</p>
    <p v-if="loading" class="m-muted" role="status">正在读取设备数据…</p>

    <section class="chart-card" aria-label="全天设备数据">
      <div class="chart-title"><strong>全天数据</strong><span>{{ rows.length }} 条采样</span></div>
      <div class="chart-grid">
        <SeriesChart label="高度" unit=" mm" color="#2B6CB0" :points="chartPoints.height" :from="dayStart.toISOString()" :to="dayEnd.toISOString()" />
        <SeriesChart label="温度" unit="°C" color="#C04B0A" :points="chartPoints.temperature" :from="dayStart.toISOString()" :to="dayEnd.toISOString()" />
        <SeriesChart label="湿度" unit="%" color="#2B7A55" :points="chartPoints.humidity" :from="dayStart.toISOString()" :to="dayEnd.toISOString()" />
        <SeriesChart label="电量" unit="%" color="#7A5C14" :points="chartPoints.battery" :from="dayStart.toISOString()" :to="dayEnd.toISOString()" />
      </div>
    </section>

    <section class="table-card">
      <details class="table-details">
        <summary class="chart-title">
          <strong>数据明细</strong>
          <span>{{ tableRows.length }} 条 · 最新在前<span class="table-caret" aria-hidden="true"></span></span>
        </summary>
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
      </details>
    </section>
  </main>
</template>

<style scoped>
.mobile-area .m-page.mobile-trend{padding-top:calc(12px + env(safe-area-inset-top));padding-bottom:calc(var(--m-tab-height) + env(safe-area-inset-bottom) + 24px);gap:0}
.trend-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;min-height:36px;margin:0 0 14px}
.trend-title h1{margin:0;font-size:24px;line-height:32px;font-weight:500;letter-spacing:-.02em;color:var(--text-primary)}
.trend-title p{margin:4px 0 0;font-size:12px;line-height:18px;color:var(--text-secondary)}
.day-picker{display:grid;gap:4px;flex:none;font-size:12px;color:var(--text-secondary)}
.day-picker-label{display:block;font-weight:500}
.day-picker input{min-height:36px;padding:6px 10px;font:inherit;font-size:13px;color:var(--text-primary);background:var(--surface-input);border:1px solid var(--border-input);border-radius:var(--radius-control)}
.chart-card{margin:0 0 14px;padding:var(--m-card-space);border:1px solid var(--border-subtle);border-radius:var(--radius-card);background:var(--surface-card);box-shadow:var(--m-shadow)}
.chart-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
.chart-title strong{font-size:15px;font-weight:500;color:var(--text-primary)}
.chart-title span{font-size:12px;color:var(--text-secondary)}
.chart-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.chart-grid :deep(.series-chart){min-width:0;--series-stroke:1.5px}
.chart-grid :deep(.series-plot){position:relative;height:88px}
.chart-grid :deep(svg){display:block;width:100%;height:88px}
.chart-grid :deep(.series-line){fill:none;stroke-width:1.5}
.chart-grid :deep(.series-grid){stroke:var(--border-subtle);stroke-width:.3;stroke-dasharray:2 2}
.chart-grid :deep(.series-dot),.chart-grid :deep(.series-hover-dot){position:absolute;transform:translate(-50%,-50%)}
.chart-grid :deep(.series-dot){border-radius:0}
.chart-grid :deep(.series-hover-dot){width:6px;height:6px;border-radius:50%}
.chart-grid :deep(.series-guide){stroke:var(--text-secondary);stroke-width:.5;stroke-dasharray:2 2;vector-effect:non-scaling-stroke}
.chart-grid :deep(.series-tip){position:absolute;z-index:2;transform:translate(-50%,-115%);background:var(--surface-card);border:1px solid var(--border-subtle);border-radius:var(--radius-control);padding:6px 10px;pointer-events:none;white-space:nowrap;font-size:12px;box-shadow:0 3px 12px rgba(48,37,31,.08)}
.chart-grid :deep(.series-tip span){display:block;color:var(--text-secondary)}
.chart-grid :deep(.series-empty){min-height:88px;display:grid;place-items:center;font-size:12px;color:var(--text-secondary);background:var(--surface-warm);border-radius:var(--radius-control)}
.chart-grid :deep(.series-value){font-size:16px;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.chart-grid :deep(.series-head){display:flex;align-items:baseline;justify-content:space-between;gap:6px;margin-bottom:6px}
.chart-grid :deep(.series-headline){display:flex;align-items:baseline;gap:4px;flex-wrap:nowrap;min-width:0;justify-content:flex-end}
.chart-grid :deep(.series-label){font-size:13px;font-weight:500}
.chart-grid :deep(.series-delta){display:none}
.chart-grid :deep(.series-range){display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:4px;min-width:0}
.chart-grid :deep(.series-time-range){white-space:nowrap}
.table-card{margin:0 0 14px;padding:var(--m-card-space);border:1px solid var(--border-subtle);border-radius:var(--radius-card);background:var(--surface-card);box-shadow:var(--m-shadow)}
/* 明细默认折叠：只留一行标题，用户点开才铺开采样表。 */
.table-details>summary{list-style:none;cursor:pointer;min-height:32px;margin-bottom:0;display:flex;align-items:center;justify-content:space-between;gap:12px}
.table-details>summary::-webkit-details-marker{display:none}
.table-details[open]>summary{margin-bottom:10px}
.table-caret{display:inline-block;margin-left:6px;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid currentColor;vertical-align:middle;transition:transform var(--motion-fast) var(--ease-standard)}
.table-details[open] .table-caret{transform:rotate(180deg)}
.table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
.table-card table{width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums}
.table-card th,.table-card td{padding:8px 6px;text-align:right;white-space:nowrap;border-bottom:1px solid var(--border-subtle)}
.table-card thead th{color:var(--text-secondary);font-weight:500;font-size:11px;border-bottom-color:var(--border-default)}
.table-card th small{display:block;font-size:10px;font-weight:400;color:var(--text-secondary)}
.table-card th:first-child,.table-card td:first-child{text-align:left}
.table-card .status-cell{text-align:left}
.row-status{display:inline-block;padding:2px 6px;border-radius:var(--radius-badge);background:#e8f0fa;font-size:11px;font-weight:500;line-height:1.5;color:#2B6CB0}
.row-status[data-tone="ok"]{background:#e7f4ed;color:#2B7A55}
.row-status[data-tone="idle"]{background:#f1ece4;color:#625e56}
.row-status[data-tone="bad"]{background:#fdf1ee;color:#8a4a42}
.row-status[data-tone="warn"]{background:#fdf3e2;color:#8a5a17}
.table-card tbody tr.is-bad{background:#fdf1ee;color:#8a4a42}
.table-card tbody tr:last-child td{border-bottom:0}
.table-note{margin:8px 0 0;font-size:11px;line-height:1.5;color:var(--text-secondary)}
</style>
