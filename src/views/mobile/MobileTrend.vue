<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import SeriesChart from '../../components/SeriesChart.vue';
import { mobileDeviceService, mobileError } from '../../services/mobile-device.service.js';
import { localDateTimeValue } from '../../lib/localDateTime.js';
import { listStarterDeviceLinks } from '../../services/starter-device.service.js';
import { listCareRecords } from '../../services/care.service.js';
import { loadWindowClosures } from '../../services/fermentation-window.service.js';
import { summarizeFeedingMeasurements } from '../../services/feeding-analysis.service.js';

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

const device = ref(null); const rows = ref([]); const windows = ref([]); const baseline = ref(null);
const loading = ref(false); const error = ref(''); const completeness = ref('');
const now = ref(Date.now());
let version = 0; let hidden = false;

const isToday = computed(() => day.value === todayValue.value);
const rangeText = computed(() => isToday.value ? '今天 00:00 – 现在' : `${formatDayLabel(day.value)} 00:00 – 24:00`);
// 图表横轴固定为整天，数据只覆盖其中一段时也保留两端的空档。
const chartFrom = computed(() => dayStart.value.toISOString());
const chartTo = computed(() => dayEnd.value.toISOString());
const heightPoints = computed(() => points('height_mm'));
const tempPoints = computed(() => points('temperature_c'));
const humidityPoints = computed(() => points('humidity_percent'));
const batteryPoints = computed(() => points('battery_percent'));
// 明细表与桌面版一致，最新采样排在最前。
const tableRows = computed(() => [...rows.value].reverse());

function points(key) {
  return rows.value.map((row) => ({ t: row.recorded_at, v: number(row[key]) }));
}
function number(value) {
  const n = Number(value);
  return value == null || value === '' || !Number.isFinite(n) ? null : n;
}
function cell(value, digits) {
  const n = number(value);
  return n == null ? '—' : n.toFixed(digits);
}
function rowTime(row) { return formatClock(row.recorded_at); }
function pad(value) { return String(value).padStart(2, '0'); }
function formatDayLabel(value) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isFinite(date.getTime()) ? `${date.getMonth() + 1}月${date.getDate()}日` : value;
}
function formatClock(value) {
  const date = new Date(value);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function formatWindowRange(fromValue, toValue) {
  const from = Date.parse(fromValue); const to = Date.parse(toValue);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return { from: '--', to: '--', offset: '', crossDay: false, title: '' };
  const fromDate = new Date(from); const toDate = new Date(to);
  const offset = Math.round((new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate()) - new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate())) / 86400000);
  const stamp = (date) => date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return {
    from: formatClock(fromDate), to: formatClock(toDate),
    offset: offset ? `${offset > 0 ? '−' : '+'}${Math.abs(offset)}` : '',
    crossDay: offset !== 0,
    title: `${stamp(fromDate)} – ${stamp(toDate)}`
  };
}
const displayedWindows = computed(() => windows.value.map((item) => ({
  ...item,
  range: formatWindowRange(item.from, item.closed ? item.to : new Date(now.value).toISOString())
})));
// 高度图用虚线标出每轮开始喂养的时刻。
const feedingMarkers = computed(() => windows.value.map((item) => ({ t: item.from, label: '开始喂养' })));
function durationText(hours) {
  if (!Number.isFinite(hours) || hours < 0) return '--';
  const minutes = Math.round(hours * 60);
  const h = Math.floor(minutes / 60); const m = minutes % 60;
  return h ? `${h} 小时 ${m} 分钟` : `${m} 分钟`;
}
function windowDuration(item) {
  const end = item.closed ? Date.parse(item.to) : now.value;
  return durationText((end - Date.parse(item.from)) / 3600000);
}
function changeDay(event) {
  const value = event.target.value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
  router.replace({ path: route.path, query: { ...route.query, day: value } });
}
// 一轮的结束点只来自下一次喂养或手动结束；设备断线不参与判断。
function buildWindows(feedings, closures, links) {
  const closureMap = new Map(closures.map((row) => [row.feeding_id, row]));
  const result = [];
  for (let index = 0; index < feedings.length; index += 1) {
    const feeding = feedings[index];
    const fedAt = Date.parse(feeding.occurred_at);
    if (!Number.isFinite(fedAt)) continue;
    const link = links.find((row) => row.device_id === deviceId.value
      && Date.parse(row.active_from) <= fedAt
      && (!row.active_to || fedAt < Date.parse(row.active_to))
      && (!row.starter_id || row.starter_id === feeding.starter_id)) || null;
    const summary = summarizeFeedingMeasurements({
      measurements: rows.value,
      feeding,
      link,
      now: now.value,
      nextFeedingAt: feedings[index + 1]?.occurred_at || null,
      windowEndedAt: closureMap.get(feeding.id)?.ended_at || null
    });
    const from = Date.parse(summary.windowFrom);
    const to = Date.parse(summary.windowTo);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    if (to <= dayStart.value.getTime() || from >= dayEnd.value.getTime()) continue;
    result.push({
      id: feeding.id,
      from: summary.windowFrom,
      to: summary.windowClosed ? summary.windowClosedAt : summary.windowTo,
      closed: !!summary.windowClosed,
      baselineHeightMm: summary.baselineHeightMm
    });
  }
  return result;
}

async function load() {
  const token = ++version; const owner = auth.user.value?.id; const id = deviceId.value;
  rows.value = []; windows.value = []; baseline.value = null;
  error.value = ''; completeness.value = ''; loading.value = true; now.value = Date.now();
  if (!owner || !id) { loading.value = false; return; }
  try {
    const service = await mobileDeviceService();
    const startMs = dayStart.value.getTime();
    const endMs = Math.min(dayEnd.value.getTime(), now.value);
    const info = await service.getDevice(id, owner);
    if (token !== version) return;
    device.value = info;

    let feedings = []; let closures = []; let links = []; let periods = [];
    if (starterId.value) {
      const [linkRows, before, during, after] = await Promise.all([
        listStarterDeviceLinks({ userId: owner, starterId: starterId.value }),
        listCareRecords({ userId: owner, starterId: starterId.value, kind: 'feeding', to: new Date(startMs).toISOString(), limit: 1 }),
        listCareRecords({ userId: owner, starterId: starterId.value, kind: 'feeding', from: new Date(startMs).toISOString(), to: dayEnd.value.toISOString(), limit: 200 }),
        listCareRecords({ userId: owner, starterId: starterId.value, kind: 'feeding', from: dayEnd.value.toISOString(), limit: 1, ascending: true })
      ]);
      const seen = new Set();
      feedings = [...(before[0] ? [before[0]] : []), ...during, ...after]
        .filter((row) => !seen.has(row.id) && seen.add(row.id))
        .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
      links = linkRows || [];
      periods = links.filter((row) => row.device_id === id)
        .map((row) => [Date.parse(row.active_from), row.active_to ? Date.parse(row.active_to) : Infinity])
        .filter(([from, to]) => to > startMs && from < endMs);
      closures = await loadWindowClosures(owner, feedings.map((row) => row.id)).catch(() => []);
      if (token !== version) return;
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
    windows.value = starterId.value ? buildWindows(feedings, closures, links) : [];
    baseline.value = windows.value.length === 1 && windows.value[0].baselineHeightMm > 0 ? windows.value[0].baselineHeightMm : null;
  } catch (cause) {
    if (token === version) error.value = cause?.message || mobileError(cause);
  } finally {
    if (token === version) loading.value = false;
  }
}

function onVisibility() { hidden = document.hidden; if (!hidden) load(); }
watch(() => auth.user.value?.id, (next, old) => { if (next !== old) { version++; rows.value = []; windows.value = []; device.value = null; baseline.value = null; loading.value = false; if (next) load(); } });
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
        <h1>{{ device?.name || deviceId || '设备数据' }}</h1>
        <p class="m-muted">{{ rangeText }} · 每十分钟取最新一条</p>
      </div>
      <label class="m-field">日期<input type="date" :value="day" :max="todayValue" @change="changeDay"></label>
    </header>
    <p v-if="completeness" class="m-error">{{ completeness }}</p>
    <p v-if="error" class="m-error" role="alert">{{ error }}</p>
    <p v-if="loading" class="m-muted" role="status">正在读取设备数据…</p>

    <section v-if="starterId" class="m-card window-card">
      <h2>发酵窗口</h2>
      <p v-if="!windows.length && !loading" class="m-muted">这一天没有发酵窗口。</p>
      <ol v-else class="window-list">
        <li v-for="(item, index) in displayedWindows" :key="item.id" class="window-row">
          <div class="window-head">
            <strong>第 {{ index + 1 }} 轮</strong>
            <span class="window-state" :data-state="item.closed ? 'closed' : 'active'">{{ item.closed ? '已结束' : '进行中' }}</span>
          </div>
          <p class="window-range" :title="item.range.title"><span v-if="item.range.crossDay" class="day-offset">{{ item.range.offset }}</span><span>{{ item.range.from }}</span><span class="range-separator">–</span><span>{{ item.closed ? item.range.to : '现在' }}</span></p>
          <p class="window-duration">{{ item.closed ? '持续' : '已持续' }} {{ windowDuration(item) }}</p>
        </li>
      </ol>
    </section>

    <section class="chart-card">
      <div class="chart-title"><strong>单日数据</strong><span>{{ day }}</span></div>
      <div class="metric-grid">
        <SeriesChart label="高度" unit=" mm" color="#2B6CB0" :points="heightPoints" :baseline="baseline" :from="chartFrom" :to="chartTo" :markers="feedingMarkers" />
        <SeriesChart label="温度" unit="°C" color="#C04B0A" :points="tempPoints" :from="chartFrom" :to="chartTo" />
        <SeriesChart label="湿度" unit="%" color="#2B7A55" :points="humidityPoints" :from="chartFrom" :to="chartTo" />
        <SeriesChart label="电量" unit="%" color="#7A5C14" :points="batteryPoints" :from="chartFrom" :to="chartTo" />
      </div>
      <p v-if="feedingMarkers.length" class="chart-note">高度图中的虚线为开始喂养的时刻。</p>
    </section>

    <section class="table-card">
      <div class="chart-title"><strong>数据明细</strong><span>{{ tableRows.length }} 条 · 最新在前</span></div>
      <p v-if="!tableRows.length && !loading" class="m-muted">这一天还没有采样数据。</p>
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">时间</th>
              <th scope="col">高度<small>mm</small></th>
              <th scope="col">温度<small>°C</small></th>
              <th scope="col">湿度<small>%</small></th>
              <th scope="col">电量<small>%</small></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in tableRows" :key="row.id" :class="{ 'is-bad': row.sensor_error }">
              <td>{{ rowTime(row) }}</td>
              <td>{{ cell(row.height_mm, 1) }}</td>
              <td>{{ cell(row.temperature_c, 1) }}</td>
              <td>{{ cell(row.humidity_percent, 0) }}</td>
              <td>{{ cell(row.battery_percent, 0) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="tableRows.some((row) => row.sensor_error)" class="table-note">浅红行为传感器故障采样，数值可能不可用。</p>
    </section>
  </main>
</template>

<style scoped>
.day-head{display:grid;gap:.5rem;margin-bottom:.75rem}
.day-head p{margin:.2rem 0 0;font-size:.8rem}
.m-field{display:flex;align-items:center;gap:.5rem;font-size:.8rem;color:var(--m-muted,#625e56)}
.m-field input{flex:1;min-height:44px;padding:.45rem .65rem;font:inherit;color:inherit;background:var(--m-surface,#fffdf8);border:1px solid var(--m-border,#d8d2c8);border-radius:8px}
.window-card{padding:.85rem;border-radius:12px}
.window-card h2{font-size:.9rem;margin:0 0 .5rem}
.window-list{display:grid;gap:.5rem;margin:0;padding:0;list-style:none}
.window-row{display:grid;gap:.2rem;padding:.6rem .7rem;border:1px solid var(--m-border,#d8d2c8);border-radius:10px;background:var(--m-card,#fff)}
.window-head{display:flex;align-items:center;justify-content:space-between;gap:.5rem}
.window-head strong{font-size:.85rem}
.window-state{padding:.15rem .5rem;border-radius:999px;font-size:.7rem;font-weight:600;color:var(--info-text);background:var(--info-bg);white-space:nowrap}
.window-state[data-state="closed"]{color:var(--success-text);background:var(--success-bg)}
.window-range{display:inline-flex;align-items:center;gap:.2rem;min-width:0;margin:0;font-size:.8rem;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}.window-range .day-offset{display:inline-grid;place-items:center;min-width:.7rem;height:.7rem;padding:0 .04rem;border-radius:50%;background:#f2dcd7;color:#a4524a;font-size:.46rem;line-height:1;font-weight:600}.window-range .range-separator{color:var(--m-muted,#625e56)}
.window-duration{margin:0;font-size:.72rem;color:var(--m-muted,#625e56)}
.chart-card{margin:.75rem 0;padding:.85rem;border:1px solid var(--m-border,#d8d2c8);border-radius:12px}
.chart-title{display:flex;align-items:center;justify-content:space-between;gap:.75rem;margin-bottom:.65rem}
.chart-title span{font-size:.75rem;color:var(--m-muted,#625e56)}
.chart-note{margin:.4rem 0 0;font-size:.7rem;line-height:1.5;color:var(--m-muted,#625e56)}
.metric-grid{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
.chart-card :deep(.series-chart){min-width:0;--series-stroke:1.5px}
.chart-card :deep(.series-plot){position:relative;height:96px}
.chart-card :deep(svg){display:block;width:100%;height:96px}
.chart-card :deep(.series-line){fill:none;stroke-width:1.5}
.chart-card :deep(.series-grid){stroke:var(--m-border,#d8d2c8);stroke-width:.3;stroke-dasharray:2 2}
.chart-card :deep(.series-dot),.chart-card :deep(.series-hover-dot){position:absolute;transform:translate(-50%,-50%)}
.chart-card :deep(.series-dot){border-radius:0}
.chart-card :deep(.series-hover-dot){width:6px;height:6px;border-radius:50%}
.chart-card :deep(.series-guide){stroke:var(--m-muted,#625e56);stroke-width:.5;stroke-dasharray:2 2;vector-effect:non-scaling-stroke}
.chart-card :deep(.series-tip){position:absolute;z-index:2;transform:translate(-50%,-115%);background:var(--m-card,#fff);border:1px solid var(--m-border,#d8d2c8);padding:.25rem .4rem;pointer-events:none;white-space:nowrap;font-size:.72rem;box-shadow:0 3px 12px #30251f12}
.chart-card :deep(.series-tip span){display:block;color:var(--m-muted,#625e56)}
.chart-card :deep(.series-empty){min-height:96px;display:grid;place-items:center;font-size:.78rem;color:var(--m-muted,#625e56);background:var(--m-surface,#fffdf8)}
.chart-card :deep(.series-value){font-size:1.15rem;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.chart-card :deep(.series-head){display:flex;align-items:baseline;justify-content:space-between;gap:.5rem;margin-bottom:.25rem}
.chart-card :deep(.series-headline){display:flex;align-items:baseline;gap:.25rem;flex-wrap:nowrap;min-width:0;justify-content:flex-end}
.chart-card :deep(.series-label){font-weight:700}.metric-grid :deep(.series-delta){display:none}
.chart-card :deep(.series-range){display:flex;flex-wrap:nowrap;align-items:center;justify-content:space-between;gap:.25rem;min-width:0}.chart-card :deep(.series-time-range){white-space:nowrap}
.table-card{margin:.75rem 0;padding:.85rem;border:1px solid var(--m-border,#d8d2c8);border-radius:12px}
.table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
.table-card table{width:100%;border-collapse:collapse;font-size:.75rem;font-variant-numeric:tabular-nums}
.table-card th,.table-card td{padding:.4rem .3rem;text-align:right;white-space:nowrap;border-bottom:1px solid #ece5d9}
.table-card thead th{color:var(--m-muted,#625e56);font-weight:600;font-size:.7rem;border-bottom-color:var(--m-border,#d8d2c8)}
.table-card th small{display:block;font-size:.62rem;font-weight:400}
.table-card th:first-child,.table-card td:first-child{text-align:left}
.table-card tbody tr.is-bad{background:#fdf1ee;color:#8a4a42}
.table-card tbody tr:last-child td{border-bottom:0}
.table-note{margin:.4rem 0 0;font-size:.7rem;line-height:1.5;color:var(--m-muted,#625e56)}
@media(max-width:360px){.metric-grid{gap:.5rem}}
</style>
