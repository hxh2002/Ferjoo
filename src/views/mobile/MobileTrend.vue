<script setup>
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { deviceStatus, mobileDeviceService, mobileError } from '../../services/mobile-device.service.js';
import { localDateTimeValue } from '../../lib/localDateTime.js';
import { listStarterDeviceLinks } from '../../services/starter-device.service.js';
import { clipWindows, filterRowsByWindows } from '../../lib/starter-link-windows.js';
import { starterRoundDeviceWindows } from '../../lib/round-device-attribution.js';
import { listCareRecords } from '../../services/care.service.js';
import { loadWindowClosures } from '../../services/fermentation-window.service.js';
import { READ_TTL, cachedRead, invalidateReadCache, peekReadCache, readCacheKey } from '../../lib/read-cache.js';
import MDraggableChart from '../../components/mobile/MDraggableChart.vue';
import MCalendar from '../../components/mobile/MCalendar.vue';
import MGuestNotice from '../../components/mobile/MGuestNotice.vue';
import { guestLoginTarget, guestRegisterTarget, isAuthPending, isGuest } from '../../lib/mobile-guest.js';
import deviceHat from '../../assets/icons/nav-device-active.svg';
import emptyChart from '../../assets/device/icon-chart-up.svg';

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
const loading = ref(false); const refreshing = ref(false); const error = ref(''); const completeness = ref(''); const calendarOpen = ref(false);
const headerTitle = inject('mobileHeaderTitle', null);
const headerTone = inject('mobileHeaderTone', null);
// 游客不读云端：直接出统一的登录引导，也不把「无可绘制数据」误报成设备空态。
const guest = computed(() => isGuest(auth));
const authPending = computed(() => isAuthPending(auth));
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
const showEmpty = computed(() => !!device.value && !rows.value.length && !error.value && (!loading.value || refreshing.value));
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
function changeDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > todayValue.value) return;
  calendarOpen.value = false;
  router.replace({ path: route.path, query: { ...route.query, day: value } });
}
function syncHeader() {
  if (!headerTitle || !headerTone) return;
  headerTitle.value = showEmpty.value ? '设备数据' : '';
  headerTone.value = showEmpty.value ? 'settings' : '';
}
async function refresh() {
  refreshing.value = true;
  invalidateReadCache('device:trend');
  try { await load(); } finally { refreshing.value = false; }
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

  // 带 starter 参数时只展示该酵种在这台设备上的全部历史关联窗口（含已关闭窗口、重绑后的多段窗口）内的行；
  // 同一天里别的酵种占用该设备的时段不会混入，窗口之外（空窗期）的行也不属于这个酵种。
  let windows = null;
  if (starterId.value) {
    const [links, feedings] = await Promise.all([
      listStarterDeviceLinks({ userId: owner }),
      listCareRecords({ userId: owner, kind: 'feeding', limit: 200 })
    ]);
    const closures = await loadWindowClosures(owner, feedings.map((row) => row.id));
    const rounds = starterRoundDeviceWindows(links, { starterId: starterId.value, feedings, closures });
    windows = clipWindows(rounds.filter((window) => window.deviceId === id), startMs, endMs);
  }

  let measured = [];
  let complete = true;
  if (endMs - startMs >= 600000 && (!windows || windows.length)) {
    const result = await service.range(id, { from: new Date(startMs).toISOString(), to: new Date(endMs).toISOString(), ...(starterId.value ? { starterId: starterId.value } : {}) });
    // 登录过期 / 无权限与「这天没有数据」分开提示，不再把读取失败画成空曲线。
    if (result.error) throw new Error(result.error);
    measured = result.rows;
    complete = result.complete;
  }
  if (windows) measured = filterRowsByWindows(measured.map((row) => ({ ...row, device_id: row.device_id || id })), windows);
  return { info, rows: measured, complete };
}

function onVisibility() { hidden = document.hidden; if (!hidden) load(); }
watch(() => auth.user.value?.id, (next, old) => { if (next !== old) { version++; rows.value = []; device.value = null; loading.value = false; if (next) load(); } });
watch([deviceId, starterId, day], load);
watch(showEmpty, syncHeader);
onMounted(async () => {
  await auth.init();
  document.addEventListener('visibilitychange', onVisibility);
  if (auth.user.value) await load();
  syncHeader();
});
onBeforeUnmount(() => {
  version++;
  document.removeEventListener('visibilitychange', onVisibility);
  if (headerTitle) headerTitle.value = '';
  if (headerTone) headerTone.value = '';
});
</script>

<template>
  <main class="m-page mobile-trend" :class="{ 'is-empty': showEmpty }">
    <!-- 游客态：不请求云端，也不显示任何他人的采样；登录后按 redirect 回到同一设备同一天。 -->
    <MGuestNotice
      v-if="guest || authPending"
      :title="guest ? '登录后查看设备数据' : '正在恢复登录状态'"
      :description="guest ? '采样按账号隔离，登录后才会读取。' : '稍候即可读取本账号的设备采样。'"
      :login-to="guestLoginTarget(route)"
      :register-to="guestRegisterTarget(route)"
      :register="guest && !authPending"
    />
    <header v-else-if="showEmpty" class="device-row">
      <span class="device-disc" aria-hidden="true"><img :src="deviceHat" alt="" width="32" height="21" /></span>
      <div>
        <strong>{{ device.name || '设备' }}</strong>
        <p>设备编号 {{ device.device_id }}</p>
      </div>
      <button type="button" class="day-picker" :aria-expanded="calendarOpen" @click="calendarOpen = !calendarOpen">{{ isToday ? '今天' : formatDayLabel(day) }}</button>
    </header>
    <header v-else class="trend-head">
      <p class="m-muted">{{ device?.name || '设备' }} · {{ summaryText }}</p>
      <button type="button" class="day-picker" :aria-expanded="calendarOpen" @click="calendarOpen = !calendarOpen">{{ isToday ? '今天' : formatDayLabel(day) }}</button>
    </header>
    <!-- 游客 / 会话恢复中不渲染任何图表与明细，避免把「没有数据」显示成设备空态。 -->
    <template v-if="!guest && !authPending">
    <MCalendar v-if="calendarOpen" class="trend-calendar" :model-value="day" :max="todayValue" @update:model-value="changeDay" />
    <p v-if="completeness" class="m-error">{{ completeness }}</p>
    <p v-if="error" class="m-error" role="alert">{{ error }}</p>
    <div v-if="loading && !showEmpty" class="m-skeleton" role="status" aria-label="正在读取设备数据"><span></span><span></span><span></span></div>

    <section v-if="showEmpty" class="sample-empty">
      <span class="empty-mark" aria-hidden="true"><img :src="emptyChart" alt="" width="18" height="18" /></span>
      <h2>暂无数据</h2>
      <p>设备同步后，可在这里查看采样记录。</p>
      <button type="button" class="empty-refresh" :disabled="refreshing" @click="refresh">刷新数据</button>
    </section>

    <section v-else class="metric-stack" aria-label="全天数据">
      <div class="metric-chart is-rise"><MDraggableChart label="高度" caption="当前" unit=" mm" color="var(--brand-primary)" :height="200" :points="chartPoints.height" :from="dayStart.toISOString()" :to="dayEnd.toISOString()" /></div>
      <div class="metric-chart is-temp"><MDraggableChart label="温度" caption="当前" unit="°C" color="var(--brand-primary)" :height="126" :points="chartPoints.temperature" :from="dayStart.toISOString()" :to="dayEnd.toISOString()" /></div>
      <div class="metric-chart is-humidity"><MDraggableChart label="湿度" caption="当前" unit="%" color="var(--brand-primary)" :height="126" :points="chartPoints.humidity" :from="dayStart.toISOString()" :to="dayEnd.toISOString()" /></div>
      <div class="metric-chart is-battery"><MDraggableChart label="电量" caption="当前" unit="%" color="var(--chart-battery)" :height="126" :points="chartPoints.battery" :from="dayStart.toISOString()" :to="dayEnd.toISOString()" /></div>
    </section>

    <section v-if="!showEmpty" class="table-card">
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
        <p class="table-note">休眠、传感器故障或模式异常的采样仍保留在明细中，但不参与膨胀倍数计算。</p>
      </details>
    </section>
    </template>
  </main>
</template>

<style scoped>
.mobile-area .m-page.mobile-trend{padding-top:12px;padding-bottom:calc(var(--m-tab-height) + env(safe-area-inset-bottom) + 24px);gap:0}
.mobile-area .m-page.mobile-trend.is-empty{padding-top:16px}
.device-row{display:flex;align-items:center;gap:12px;min-height:40px;margin:0 0 72px}
.device-disc{display:grid;place-items:center;flex:none;width:40px;height:40px;border-radius:20px;background:var(--m-icon-disc)}
.device-row div{min-width:0}
.device-row strong{display:block;overflow:hidden;font-size:16px;line-height:24px;font-weight:500;text-overflow:ellipsis;white-space:nowrap}
.device-row p{margin:0;overflow:hidden;color:var(--text-secondary);font-size:12px;line-height:18px;text-overflow:ellipsis;white-space:nowrap}
.device-row .day-picker{margin-left:auto}
.sample-empty{display:grid;justify-items:center;text-align:center}
.empty-mark{display:grid;place-items:center;width:64px;height:64px;border-radius:32px;background:var(--m-icon-disc)}
.sample-empty h2{margin:24px 0 0;font-size:18px;line-height:26px;font-weight:500}
.sample-empty p{margin:8px 0 0;color:var(--text-secondary);font-size:14px;line-height:21px}
/* 空态实测：设备行 → 空图标 0（设计稿在这里留 72）、图标 → 「暂无数据」0（设计稿 24）。
   前者被 `.m-page > *` 的 margin-block 归零吃掉，后者被全局 `.m-page h2` 的 `margin:0 0 12px`
   以更高选择器权重压过 scoped 单类；两处都改用别名选择器写回。 */
.mobile-area .mobile-main .m-page.mobile-trend > .device-row{margin-block:0 72px}
.mobile-area .mobile-main .m-page.mobile-trend .sample-empty h2{margin-block:24px 0}
.empty-refresh{width:100%;height:60px;margin-top:24px;border:0;border-radius:var(--m-radius-button);background:var(--brand-light);color:var(--text-primary);font:inherit;font-size:16px;line-height:24px;font-weight:500;box-shadow:var(--m-shadow-button);cursor:pointer}
.empty-refresh:disabled{opacity:.6;cursor:default}
.trend-head{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:36px;margin:0 0 14px}
.trend-head p{margin:0;font-size:12px;line-height:18px;color:var(--text-secondary)}
.day-picker{flex:none;min-height:36px;padding:0 12px;border:1px solid var(--border-warm);border-radius:18px;background:var(--surface-card);color:var(--text-primary);font:inherit;font-size:13px;cursor:pointer}
.trend-calendar{margin:0 0 14px}
/* 本页 gap 为 0，节奏靠 margin；`.m-page > *` 的 margin-block 归零会让页头 / 曲线组 / 明细卡
   三段紧贴（实测 0），这里用高优先级别名把设计稿的 14 写回。 */
.mobile-area .mobile-main .m-page.mobile-trend > .trend-head{margin-block:0 14px}
.mobile-area .mobile-main .m-page.mobile-trend > .trend-calendar{margin-block:0 14px}
.mobile-area .mobile-main .m-page.mobile-trend > .metric-stack{margin-block:0 14px}
.mobile-area .mobile-main .m-page.mobile-trend > .table-card{margin-block:0 14px}
.metric-stack{display:grid;gap:12px;margin:0 0 14px}
.metric-chart{min-width:0;padding:12px 16px 16px;border:0;border-radius:var(--radius-card);background:var(--m-chart-rise)}
.metric-chart.is-temp{background:var(--m-chart-warm)}
.metric-chart.is-humidity{background:var(--m-chart-pale)}
.metric-chart.is-battery{background:var(--surface-card);box-shadow:var(--m-shadow)}
.chart-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
.chart-title strong{font-size:15px;font-weight:500;color:var(--text-primary)}
.chart-title span{font-size:12px;color:var(--text-secondary)}
.metric-chart :deep(.series-chart){min-width:0;--series-stroke:1.5px}
.metric-chart :deep(.series-plot){position:relative;height:var(--m-chart-height,126px)}
.metric-chart :deep(svg){display:block;width:100%;height:var(--m-chart-height,126px)}
.metric-chart :deep(.series-line){fill:none;stroke-width:1.5}
.metric-chart :deep(.series-grid){stroke:var(--border-subtle);stroke-width:.3;stroke-dasharray:2 2}
.metric-chart :deep(.series-dot),.metric-chart :deep(.series-hover-dot){position:absolute;transform:translate(-50%,-50%)}
.metric-chart :deep(.series-dot){border-radius:0}
.metric-chart :deep(.series-hover-dot){border-radius:50%}
.metric-chart :deep(.series-guide){stroke:var(--text-secondary);stroke-width:.5;stroke-dasharray:2 2;vector-effect:non-scaling-stroke}
.metric-chart :deep(.series-empty){min-height:88px;display:grid;place-items:center;font-size:var(--text-xs);color:var(--text-secondary);background:transparent;border-radius:var(--radius-control)}
.metric-chart :deep(.series-value){font-size:16px;font-weight:500;line-height:23px;letter-spacing:0;font-variant-numeric:tabular-nums}
.metric-chart :deep(.series-head){display:flex;align-items:baseline;justify-content:space-between;gap:6px;margin-bottom:6px}
.metric-chart :deep(.series-headline){display:flex;align-items:baseline;gap:4px;flex-wrap:nowrap;min-width:0;justify-content:flex-end}
.metric-chart :deep(.series-label){font-size:14px;font-weight:500;letter-spacing:0;line-height:20px;color:var(--text-primary)}
.metric-chart :deep(.series-delta){display:none}
.metric-chart :deep(.series-value-label),.metric-chart :deep(.series-time-label){color:var(--m-chart-ink);border-radius:6px;font-weight:500;box-shadow:none}
.metric-chart :deep(.series-range){display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:4px;min-width:0}
.metric-chart :deep(.series-time-range){white-space:nowrap}
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
.row-status{display:inline-block;padding:2px 6px;border-radius:var(--radius-badge);background:var(--info-bg);font-size:11px;font-weight:500;line-height:1.5;color:var(--info-text)}
.row-status[data-tone="ok"]{background:var(--success-bg);color:var(--success-text)}
.row-status[data-tone="idle"]{background:var(--surface-warm);color:var(--text-muted)}
.row-status[data-tone="bad"]{background:var(--danger-bg);color:var(--danger-text)}
.row-status[data-tone="warn"]{background:var(--warning-bg);color:var(--warning-text)}
.table-card tbody tr.is-bad{background:var(--danger-bg);color:var(--danger-text)}
.table-card tbody tr:last-child td{border-bottom:0}
.table-note{margin:8px 0 0;font-size:11px;line-height:1.5;color:var(--text-secondary)}
</style>
