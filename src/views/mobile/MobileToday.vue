<script setup>
import { computed, onMounted, onScopeDispose, ref, watch } from 'vue';
import { useAuth } from '../../composables/useAuth.js';
import { useVisiblePolling } from '../../composables/useVisiblePolling.js';
import { createStarter, listCareRecords, listStarters } from '../../services/care.service.js';
import { listMeasurementsRange } from '../../services/device.service.js';
import { mobileDeviceService } from '../../services/mobile-device.service.js';
import { linkStarterDevice, listStarterDeviceLinks } from '../../services/starter-device.service.js';
import { loadFeedingEvidence, summarizeFeedingMeasurements } from '../../services/feeding-analysis.service.js';
import { closeFeedingWindow, loadWindowClosure } from '../../services/fermentation-window.service.js';
import { loadSessionReport } from '../../services/mobile-diagnosis.service.js';
import SeriesChart from '../../components/SeriesChart.vue';

defineOptions({ name: 'MobileToday' });
const auth = useAuth();
const accountId = computed(() => auth.user.value?.id || '');
const devices = ref([]); const starters = ref([]); const measurements = ref([]);
const deviceId = ref(''); const starterId = ref(''); const records = ref([]); const link = ref(null);
const loading = ref(false); const saving = ref(false); const error = ref(''); const deviceError = ref('');
const deviceOpen = ref(false); const starterOpen = ref(false); const newStarterOpen = ref(false); const contextOpen = ref(false);
const newName = ref(''); const now = ref(Date.now()); const explicitStarter = ref(false);
const evidence = ref(null); const mutationError = ref('');
const nextFeedingAt = ref(null); const closure = ref(null);
const closeOpen = ref(false); const closing = ref(false); const closeError = ref('');
let generation = 0; let disposed = false; let inFlight = null; let pending = false; let mutationGeneration = 0;
// 与 feeding-analysis 的新鲜度窗口保持一致，仅用于「数据是否还新鲜」的提示。
const FRESH_MS = 40 * 60000;

const activeDevice = computed(() => devices.value.find((item) => item.device_id === deviceId.value));
const starter = computed(() => starters.value.find((item) => item.id === starterId.value));
const feeding = computed(() => records.value.find((item) => item.kind === 'feeding') || null);
const observation = computed(() => records.value.find((item) => item.kind === 'observation') || null);
const report = ref(null);
const lastAdvice = computed(() => {
  const saved = observation.value?.result?.title ? { result: observation.value.result, occurredAt: observation.value.occurred_at, savedId: observation.value.id } : null;
  return report.value && (!saved || Date.parse(report.value.occurredAt) >= Date.parse(saved.occurredAt)) ? report.value : saved;
});
const riskAdvice = computed(() => ['discard', 'needs-check'].includes(lastAdvice.value?.result?.status));
const from = computed(() => new Date(now.value - 24 * 3600000).toISOString());
const to = computed(() => new Date(now.value).toISOString());
const eligibleStarters = computed(() => starters.value.filter((item) => !item.link?.device_id || item.link.device_id === deviceId.value));
const summary = computed(() => feeding.value ? summarizeFeedingMeasurements({
  measurements: evidence.value || measurements.value,
  feeding: feeding.value,
  link: link.value,
  now: now.value,
  nextFeedingAt: nextFeedingAt.value,
  windowEndedAt: closure.value?.ended_at || null
}) : null);
const chartRows = computed(() => (starterId.value && !link.value ? [] : measurements.value.slice().sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at))));
const heightPoints = computed(() => chartRows.value.map((row) => ({ t: row.recorded_at, v: valid(row, 'height_mm') })));
const tempPoints = computed(() => chartRows.value.map((row) => ({ t: row.recorded_at, v: valid(row, 'temperature_c') })));
const humidityPoints = computed(() => chartRows.value.map((row) => ({ t: row.recorded_at, v: valid(row, 'humidity_percent') })));
const heightBaseline = computed(() => summary.value?.baselineHeightMm > 0 ? summary.value.baselineHeightMm : null);
// 高度图标出本轮开始喂养的位置。
const heightMarkers = computed(() => summary.value?.windowFrom ? [{ t: summary.value.windowFrom, label: '开始喂养' }] : []);
// 概览只保留三个关键值，采集中/未建立等状态压进对应值里，避免多出一行说明。
const baselineText = computed(() => {
  const value = summary.value;
  if (!value) return '未建立';
  // 来源必须写清：手工填写的基线和传感器窗口算出的基线不能混为一谈。
  if (value.baselineHeightMm != null) return `${value.baselineHeightMm.toFixed(1)} mm · ${value.baselineSource === 'manual' ? '手工' : '自动'}`;
  if (value.baselineStatus === 'pending') return `建立中 · ${value.baselineUsedCount}/3 个样本`;
  return '尚未建立';
});
const expansionText = computed(() => Number.isFinite(summary.value?.expansionPercent) ? `${summary.value.expansionPercent.toFixed(1)}%` : '-');
const currentHeightText = computed(() => Number.isFinite(summary.value?.currentHeightMm) ? `${summary.value.currentHeightMm.toFixed(1)} mm` : '-');
const closeReasonLabels = { fallen: '峰值后回落', no_peak: '未见明显峰值', abnormal: '中途异常', record_only: '手动结束记录' };
// 已结束的轮次必须说清是「被下一次喂养截断」还是「手动结束」，手动结束还要带上原因。
const endReasonText = computed(() => {
  const value = summary.value;
  if (value?.windowStatus !== 'closed') return '';
  if (value.windowEndReason === 'next_feeding') return '下一次喂养';
  return closeReasonLabels[closure.value?.detail] || '手动结束';
});
const roundStateText = computed(() => {
  const value = summary.value;
  if (!value) return '';
  if (value.windowStatus === 'closed') return `已结束 · ${endReasonText.value}`;
  if (value.baselineStatus === 'pending') return '基线建立中';
  if (value.dataQuality === 'stale') return '进行中 · 数据中断';
  if (value.dataQuality === 'insufficient' || value.dataQuality === 'partial') return '进行中 · 数据不足';
  return '进行中';
});
// 颜色只做快速提示，文案始终说明具体依据；设备缺测不等于发酵结束。
const roundTone = computed(() => {
  const value = summary.value;
  if (!value) return 'neutral';
  if (value.windowStatus === 'closed') return 'ok';
  if (value.baselineStatus === 'pending') return 'warn';
  if (['stale', 'insufficient', 'partial'].includes(value.dataQuality)) return 'warn';
  return 'ok';
});
// 罐状态压缩成一行：灰=无可用对象，绿=数据新鲜，橙=需要留意，红=明确故障。
// 只有采样证据时只断言「数据」，不把最近一次测量当成设备在线。
const jarStatus = computed(() => {
  if (!deviceId.value) return { tone: 'none', label: '未选择酵种罐', detail: '点按选择设备' };
  if (starterId.value && !link.value) return { tone: 'none', label: '未关联设备', detail: '点按切换或关联' };
  const latest = chartRows.value.at(-1);
  if (!latest) return { tone: 'none', label: '暂无数据', detail: '最近 24 小时未收到采样' };
  const detail = `最近更新 ${relative(latest.recorded_at)}`;
  if (latest.sensor_error) return { tone: 'fault', label: '传感器异常', detail };
  if (latest.mode && latest.mode !== 'fer') return { tone: latest.mode === 'sleep' ? 'none' : 'warn', label: latest.mode === 'sleep' ? '休眠中' : '模式异常', detail };
  const at = Date.parse(latest.recorded_at);
  if (Number.isFinite(at) && now.value - at <= FRESH_MS) return { tone: 'ok', label: '数据正常', detail };
  return { tone: 'warn', label: '数据偏旧', detail };
});
const chartRangeLabel = computed(() => link.value?.active_from && Date.parse(link.value.active_from) > Date.parse(from.value) ? '自关联起' : '最近 24 小时');
// 图里被排除的样本和断档要说明白，否则用户会把缺口误读成发酵停止。
const chartNote = computed(() => {
  const rows = chartRows.value;
  if (!rows.length) return '所选时间范围内没有采样；曲线为空不代表本轮已结束。';
  const excluded = rows.filter((row) => row.sensor_error || (row.mode && row.mode !== 'fer')).length;
  let gaps = 0;
  for (let i = 1; i < rows.length; i += 1) if (Date.parse(rows[i].recorded_at) - Date.parse(rows[i - 1].recorded_at) > FRESH_MS) gaps += 1;
  const notes = [];
  if (excluded) notes.push(`${excluded} 条休眠/异常样本未计入膨胀率`);
  if (gaps) notes.push(`${gaps} 段超过 40 分钟无采样`);
  return notes.join('；');
});
const windowRange = computed(() => {
  const value = summary.value;
  if (!value?.windowFrom) return null;
  const end = value.windowClosedAt || new Date(now.value).toISOString();
  return compactTimeRange(value.windowFrom, end);
});
// 设备缺测只说明观测质量，不能暗示发酵已经结束。
const dataNote = computed(() => {
  const value = summary.value;
  if (!value) return '';
  if (!link.value) return '该酵种未关联设备，本轮只记录喂养事实；膨胀率暂时无法计算。';
  if (value.heightStale) return '设备数据已超过 40 分钟未更新，本轮仍在进行；膨胀率暂不计算。';
  if (value.baselineStatus === 'pending') return `正在建立基线，已收集 ${value.baselineUsedCount}/3 个有效高度样本。`;
  if (value.baselineStatus === 'insufficient' && value.windowActive) return '有效高度样本不足，尚未建立基线。';
  return '';
});
const closeReasons = [
  { value: 'fallen', label: '已达到峰值后回落' },
  { value: 'no_peak', label: '没有明显达到峰值' },
  { value: 'abnormal', label: '中途异常，无法判断' },
  { value: 'record_only', label: '只是想结束记录' }
];

// 曲线只关心「这一条到底有没有值」；休眠/传感器故障行里的温湿度仍应正常绘制。
function valid(row, key) { return row ? number(row[key]) : null; }
function number(value) { const n = Number(value); return value == null || value === '' || !Number.isFinite(n) ? null : n; }
function relative(value) { const t = Date.parse(value); if (!Number.isFinite(t)) return '暂无记录'; const m = Math.max(0, Math.floor((now.value - t) / 60000)); return m < 1 ? '刚刚' : m < 60 ? `${m}分钟前` : `${Math.floor(m / 60)}小时前`; }
function dayStart(value) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
function clockText(value) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
function compactTimeRange(fromValue, toValue) {
  const from = Date.parse(fromValue); const to = Date.parse(toValue);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return { from: '--', to: '--', offset: '', crossDay: false };
  const dayOffset = Math.round((dayStart(to) - dayStart(from)) / 86400000);
  return {
    from: clockText(from),
    to: clockText(to),
    offset: dayOffset ? `${dayOffset > 0 ? '−' : '+'}${Math.abs(dayOffset)}` : '',
    crossDay: dayOffset !== 0,
    fullFrom: new Date(from).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    fullTo: new Date(to).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  };
}
function durationText(hours) {
  if (!Number.isFinite(hours) || hours < 0) return '--';
  const minutes = Math.round(hours * 60);
  const h = Math.floor(minutes / 60); const m = minutes % 60;
  return h ? `${h} 小时 ${m} 分钟` : `${m} 分钟`;
}
function target(path, extra = {}) { return { path, query: { ...(starterId.value ? { starter: starterId.value } : {}), ...extra } }; }
function scrollToChart() { if (typeof document !== 'undefined') document.getElementById('device-chart')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function current(token, owner) { return !disposed && token === generation && owner === accountId.value; }
function clearSelected() { records.value = []; link.value = null; measurements.value = []; evidence.value = []; report.value = null; nextFeedingAt.value = null; closure.value = null; closeOpen.value = false; closeError.value = ''; }
function selectDevice(id) {
  if (saving.value || id === deviceId.value) return;
  generation++; deviceId.value = id;
  const keepEmpty = explicitStarter.value && !starterId.value;
  starterId.value = ''; explicitStarter.value = keepEmpty;
  deviceOpen.value = false; clearSelected(); void refresh();
}
function selectStarter(id) {
  if (saving.value) return;
  const item = starters.value.find((row) => row.id === id);
  if (id && (!item || item.link?.device_id && item.link.device_id !== deviceId.value)) return;
  generation++; explicitStarter.value = true; starterId.value = id || ''; starterOpen.value = false; clearSelected(); void refresh();
}
async function refresh() {
  if (disposed || !accountId.value) return;
  if (inFlight || saving.value) { pending = true; return inFlight; }
  const owner = accountId.value; const token = generation; loading.value = true; error.value = ''; deviceError.value = ''; now.value = Date.now();
  inFlight = (async () => {
    try {
      const [starterResult, deviceResult, linkResult] = await Promise.all([
        listStarters({ userId: owner }).then(value => ({ value }), cause => ({ cause })),
        mobileDeviceService().then(service => service.listDevices(owner)).then(value => ({ value }), cause => ({ cause })),
        listStarterDeviceLinks({ userId: owner }).then(value => ({ value }), cause => ({ cause }))
      ]);
      if (!current(token, owner)) return;
      if (starterResult.cause) { error.value = '酵种列表读取失败，请重试。'; return; }
      if (deviceResult.cause) { deviceError.value = '设备列表读取失败，请刷新后重试。'; return; }
      if (linkResult.cause) { error.value = '设备关联读取失败，请刷新重试；暂不展示酵种曲线。'; return; }
      const allLinks = linkResult.value || []; const linkMap = new Map();
      for (const row of allLinks) if (row.active_to == null && !linkMap.has(row.starter_id)) linkMap.set(row.starter_id, row);
      const rows = starterResult.value || [];
      const contexts = await Promise.all(rows.map(async (item) => {
        const [latest, feedRows, obsRows] = await Promise.all([
          listCareRecords({ userId: owner, starterId: item.id, limit: 1 }),
          listCareRecords({ userId: owner, starterId: item.id, kind: 'feeding', limit: 1 }),
          listCareRecords({ userId: owner, starterId: item.id, kind: 'observation', limit: 1 })
        ]);
        return { ...item, link: linkMap.get(item.id) || null, latest: latest[0] || null, feeding: feedRows[0] || null, observation: obsRows[0] || null };
      }));
      if (!current(token, owner)) return;
      contexts.sort((a, b) => (Date.parse(b.latest?.occurred_at) || 0) - (Date.parse(a.latest?.occurred_at) || 0));
      devices.value = deviceResult.value || []; starters.value = contexts;
      const sortedDevices = devices.value.slice().sort((a, b) => { const aa = Date.parse(a.created_at); const bb = Date.parse(b.created_at); return (Number.isFinite(aa) ? aa : Infinity) - (Number.isFinite(bb) ? bb : Infinity); });
      if (!devices.value.some(row => row.device_id === deviceId.value)) deviceId.value = sortedDevices[0]?.device_id || '';
      let selected = contexts.find(row => row.id === starterId.value);
      if (!explicitStarter.value && !selected) { selected = contexts.find(row => row.link?.device_id === deviceId.value); if (selected) starterId.value = selected.id; }
      if (!selected || selected.link?.device_id && selected.link.device_id !== deviceId.value) { starterId.value = ''; selected = null; }
      link.value = selected?.link || null;
      records.value = [selected?.feeding, selected?.observation].filter(Boolean).sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));
      const session = loadSessionReport(owner);
      report.value = session?.accountId === owner && session.starterId === starterId.value ? session : null;
      evidence.value = []; nextFeedingAt.value = null; closure.value = null;
      if (feeding.value) {
        // 即使没有设备关联也要读取下一次喂养边界，本轮开始和结束才能说清楚。
        const [loadedResult, closureResult] = await Promise.all([
          loadFeedingEvidence(owner, starterId.value, feeding.value.id).then(value => ({ value }), cause => ({ cause })),
          loadWindowClosure(owner, feeding.value.id).then(value => ({ value }), cause => ({ cause }))
        ]);
        if (!current(token, owner)) return;
        if (loadedResult.cause) error.value = loadedResult.cause?.message || '本轮设备证据读取失败，可手动诊断。';
        else {
          const loaded = loadedResult.value;
          nextFeedingAt.value = loaded?.nextFeedingAt || null;
          evidence.value = loaded?.link?.device_id === deviceId.value && loaded?.link?.active_from === link.value?.active_from ? loaded.measurements : [];
        }
        closure.value = closureResult.value || null;
      }
      if (!current(token, owner)) return;
      if (!deviceId.value || starterId.value && !link.value) { measurements.value = []; return; }
      const rangeFrom = link.value?.active_from && Date.parse(link.value.active_from) > Date.parse(from.value) ? link.value.active_from : from.value;
      const measuredRows = await listMeasurementsRange(deviceId.value, { from: rangeFrom, to: to.value, bucketed: false });
      if (!current(token, owner)) return;
      measurements.value = measuredRows.filter(row => {
        const at = Date.parse(row.recorded_at);
        return at >= Date.parse(rangeFrom) && at <= now.value && (!row.device_id || row.device_id === deviceId.value)
          && (!link.value || link.value.device_id === deviceId.value && (!link.value.active_to || at < Date.parse(link.value.active_to)));
      }).map(row => ({ ...row, height_mm: number(row.height_mm) > 0 ? number(row.height_mm) : null }));
    } catch (cause) { if (current(token, owner)) error.value = cause?.message || '读取失败，请稍后重试。'; }
  })();
  try { await inFlight; } finally { inFlight = null; loading.value = false; if (pending && !disposed) { pending = false; void refresh(); } }
}
async function endRound(detail = null) {
  if (closing.value || !feeding.value || !summary.value?.windowActive) return;
  const owner = accountId.value; const token = generation; const feedingId = feeding.value.id;
  closing.value = true; closeError.value = '';
  try {
    const saved = await closeFeedingWindow({ feedingId, endedAt: new Date().toISOString(), detail });
    if (!current(token, owner)) return;
    closure.value = saved; closeOpen.value = false; now.value = Date.now();
  } catch (cause) {
    if (current(token, owner)) closeError.value = cause?.message || '结束本轮失败，请重试。';
  } finally {
    if (current(token, owner)) closing.value = false;
  }
}
async function associateSelected() {
  if (saving.value || !starterId.value || !deviceId.value) return;
  const owner = accountId.value; const id = starterId.value; const token = generation; const mutationToken = ++mutationGeneration; saving.value = true; mutationError.value = '';
  try { await linkStarterDevice({ userId: owner, starterId: id, deviceId: deviceId.value }); if (current(token, owner)) pending = true; }
  catch (cause) { if (current(token, owner) && mutationToken === mutationGeneration) mutationError.value = cause?.message || '关联失败，请重试。'; }
  finally { if (mutationToken === mutationGeneration) { saving.value = false; if (pending) { pending = false; void refresh(); } } }
}
async function addStarter() {
  if (saving.value || !accountId.value || !newName.value.trim()) return;
  const owner = accountId.value; const token = generation; const mutationToken = ++mutationGeneration; saving.value = true; error.value = '';
  try {
    const created = await createStarter(newName.value.trim());
    if (!current(token, owner)) return;
    starters.value.unshift({ ...created, link: null });
    explicitStarter.value = true; starterId.value = created.id; mutationError.value = ''; clearSelected();
    newName.value = ''; newStarterOpen.value = false;
    if (deviceId.value) {
      try { await linkStarterDevice({ userId: owner, starterId: created.id, deviceId: deviceId.value }); }
      catch (cause) { if (current(token, owner) && mutationToken === mutationGeneration) mutationError.value = '酵种已新建，但关联失败。请点击关联当前设备重试。'; }
    }
    if (!current(token, owner)) return;
    pending = true;
  } catch (cause) { if (current(token, owner)) error.value = cause?.message || '新建或关联失败，请重试。'; }
  finally { if (mutationToken === mutationGeneration) { saving.value = false; if (pending) { pending = false; void refresh(); } } }
}
watch(accountId, () => { generation++; mutationGeneration++; saving.value = false; deviceId.value = ''; starterId.value = ''; explicitStarter.value = false; devices.value = []; starters.value = []; newName.value = ''; newStarterOpen.value = false; deviceOpen.value = false; starterOpen.value = false; contextOpen.value = false; mutationError.value = ''; clearSelected(); error.value = ''; deviceError.value = ''; if (accountId.value) void refresh(); }, { immediate: true, flush: 'sync' });
useVisiblePolling(refresh, 60000); onMounted(() => auth.init()); onScopeDispose(() => { disposed = true; generation++; });
</script>

<template>
  <main class="m-page today-page">
    <header class="today-heading starter-section">
      <div v-if="accountId" class="status-row">
        <button type="button" class="jar-status status-toggle" :data-tone="jarStatus.tone" :aria-expanded="contextOpen" @click="contextOpen = !contextOpen">
          <span class="jar-dot" aria-hidden="true"></span>
          <strong>{{ jarStatus.label }}</strong>
          <span class="jar-detail">{{ jarStatus.detail }}</span>
          <span class="status-caret" aria-hidden="true"></span>
        </button>
        <button type="button" class="refresh-icon" :class="{ spinning: loading }" :disabled="loading || saving" :aria-label="loading ? '正在刷新' : '刷新'" @click="refresh">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 12a8.5 8.5 0 0 1-14.6 5.9L4 16" /><path d="M3.5 12A8.5 8.5 0 0 1 18.1 6.1L20 8" /><path d="M20 3.6V8h-4.4" /><path d="M4 20.4V16h4.4" /></svg>
        </button>
      </div>
      <div v-if="accountId && contextOpen" class="picker-row">
        <details class="picker" :open="deviceOpen" @toggle="deviceOpen = $event.target.open"><summary><span class="picker-label">酵种罐</span><span class="picker-value">{{ activeDevice?.name || activeDevice?.device_id || '未选择' }}</span></summary><div class="picker-menu"><button v-for="item in devices" :key="item.device_id" type="button" :class="{ active: item.device_id === deviceId }" @click="selectDevice(item.device_id)">{{ item.name || item.device_id }}</button><RouterLink to="/me/devices?bind=1">新增/连接酵种罐</RouterLink></div></details>
        <details class="picker" :open="starterOpen" @toggle="starterOpen = $event.target.open"><summary><span class="picker-label">酵种</span><span class="picker-value">{{ starter?.name || '未选择' }}</span></summary><div class="picker-menu starter-menu"><button type="button" :class="{ active: !starterId }" @click="selectStarter('')">不选择酵种</button><button v-for="item in eligibleStarters" :key="item.id" type="button" :class="{ active: item.id === starterId }" @click="selectStarter(item.id)">{{ item.name }}<small>{{ item.link ? '已关联当前设备' : '未关联设备 · 仅查看记录' }}</small></button><button class="menu-action" type="button" @click="newStarterOpen = !newStarterOpen">+ 新增酵种</button><form v-if="newStarterOpen" class="new-starter" @submit.prevent="addStarter"><input v-model="newName" maxlength="80" placeholder="酵种名称" :disabled="saving"><button class="m-primary" type="submit" :disabled="saving || !newName.trim()">{{ saving ? '保存中…' : '新建并关联当前设备' }}</button></form><button v-if="starterId && !link && deviceId" class="menu-action" type="button" :disabled="saving || loading" @click="associateSelected">关联当前设备</button></div></details>
      </div>
    </header>
    <p v-if="accountId && (!devices.length || !starters.length)" class="m-muted small picker-hint">{{ !devices.length ? '还没有酵种罐，先在「酵种罐」中新增或连接设备。' : '还没有酵种，在「酵种」中新建。' }}</p>
    <p v-if="accountId && starterId && !link" class="m-muted small picker-hint">该酵种未关联设备，暂不显示曲线。</p>
    <p v-if="error || mutationError" class="m-error" role="alert">{{ error || mutationError }}</p><p v-if="loading" class="m-muted" role="status">正在读取…</p>
    <section v-if="!accountId" class="m-card intro-card"><img class="jojo-mascot jojo-login" src="/assets/jojo1.png" alt="Jojo 吉祥物"><p class="eyebrow">今日</p><h1>连接设备，开始记录</h1><RouterLink class="m-primary" :to="{ path: '/login', query: { redirect: '/today' } }">登录后开始</RouterLink></section>
    <template v-else>
      <p v-if="deviceError" class="m-error" role="alert">{{ deviceError }}</p>
      <div v-if="starterId" class="round-section">
        <section v-if="feeding" class="round-card">
          <div class="round-head"><strong>本轮发酵</strong><span class="round-state" :data-tone="roundTone">{{ roundStateText }}</span></div>
          <p class="round-window"><span v-if="windowRange" class="compact-range" :title="`${windowRange.fullFrom} – ${windowRange.fullTo}`"><span v-if="windowRange.crossDay" class="day-offset">{{ windowRange.offset }}</span><span>{{ windowRange.from }}</span><span class="range-separator">–</span><span>{{ windowRange.to }}</span></span><span v-if="summary?.windowActive" class="round-duration">已持续 {{ durationText(summary?.elapsedHours) }}</span></p>
          <dl class="round-metrics">
            <div><dt>当前高度</dt><dd>{{ currentHeightText }}</dd></div>
            <div><dt>膨胀率</dt><dd>{{ expansionText }}</dd></div>
            <div><dt>基线</dt><dd>{{ baselineText }}</dd></div>
            <div v-if="summary?.windowActive"><dt>距上次喂养</dt><dd>{{ relative(feeding.occurred_at) }}</dd></div>
            <div v-else><dt>本轮时长</dt><dd>{{ durationText(summary?.elapsedHours) }}</dd></div>
          </dl>
          <p v-if="dataNote" class="round-note">{{ dataNote }}</p>
          <p v-if="closeError" class="m-error" role="alert">{{ closeError }}</p>
          <div class="round-actions">
            <template v-if="summary?.windowActive">
              <RouterLink class="m-primary" :to="target('/feeding')">记录下一次喂养</RouterLink>
              <button v-if="!closeOpen" type="button" class="m-secondary" @click="closeOpen = true">结束本轮</button>
              <div v-else class="close-panel" role="group" aria-label="结束本轮原因">
                <p>这次发酵处于什么状态？</p>
                <button v-for="option in closeReasons" :key="option.value" type="button" :disabled="closing" @click="endRound(option.value)">{{ option.label }}</button>
                <button type="button" class="text-button" :disabled="closing" @click="closeOpen = false">继续观察</button>
              </div>
              <RouterLink class="round-link" :to="target('/checkin', { feeding: feeding.id, mode: 'diagnosis' })">查看本轮详情</RouterLink>
            </template>
            <template v-else>
              <RouterLink class="m-primary" :to="target('/checkin', { feeding: feeding.id, mode: 'diagnosis' })">查看本轮详情</RouterLink>
              <RouterLink class="m-secondary" :to="target('/feeding')">记录下一次喂养</RouterLink>
            </template>
            <button v-if="deviceId && link" type="button" class="round-link round-link-button" @click="scrollToChart">查看设备曲线</button>
          </div>
        </section>
        <section v-else class="round-card round-empty">
          <img class="jojo-mascot jojo-empty" src="/assets/jojo2.png" alt="Jojo 吉祥物" loading="lazy">
          <div class="round-empty-copy"><strong>还没有开始新一轮</strong>
          <p>记录一次喂养后，本轮会从喂养时间开始，并在下一次喂养或手动结束时结束。</p></div>
          <RouterLink class="m-primary round-empty-action" :to="target('/feeding')">记录喂养</RouterLink>
        </section>
      </div>
        <section v-if="deviceId" id="device-chart" class="chart-card"><div class="chart-title"><strong>{{ starter ? starter.name : '未关联酵种的设备数据' }}</strong><span>{{ chartRangeLabel }}</span></div><p v-if="chartNote" class="chart-note">{{ chartNote }}</p><SeriesChart class="chart-feature" label="高度" unit=" mm" color="#2B6CB0" :points="heightPoints" :baseline="heightBaseline" :markers="heightMarkers" compact-time><template #after-header><div class="height-expansion"><span>膨胀率</span><strong>{{ expansionText }}</strong></div></template></SeriesChart><div class="small-charts"><SeriesChart label="温度" unit="°C" color="#C04B0A" :points="tempPoints" compact-time/><SeriesChart label="湿度" unit="%" color="#2B7A55" :points="humidityPoints" compact-time/></div></section>
      <div v-if="riskAdvice" class="risk-banner" role="alert"><strong>上次风险结果：{{ lastAdvice.result.title }}</strong><RouterLink :to="lastAdvice.savedId ? `/records/${lastAdvice.savedId}` : '/reports/session'">查看结果</RouterLink></div>
      <p v-if="!starterId" class="m-muted small picker-hint">选择酵种后可记录喂养，并查看这一轮发酵。</p>
    </template>
  </main>
</template>

<style scoped>
.today-page{max-width:42rem;margin:auto}.chart-title{display:flex;align-items:center;justify-content:space-between;gap:.75rem}.today-heading{display:grid;gap:.4rem;margin-bottom:.75rem}.status-row{display:flex;align-items:center;gap:.4rem}.picker-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:.4rem;align-items:center}.picker{position:relative;border:1px solid var(--m-border,#d8d2c8);border-radius:10px;background:var(--m-surface,#fffdf8);min-width:0}.picker summary{cursor:pointer;min-height:44px;display:flex;align-items:center;gap:.35rem;padding:0 .5rem}.picker-label{flex-shrink:0;font-size:.68rem;color:var(--m-muted,#625e56)}.picker-value{font-size:.82rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.refresh-icon{flex:none;width:38px;height:38px;padding:0;display:grid;place-items:center;border:1px solid var(--m-border,#d8d2c8);border-radius:50%;background:var(--m-surface,#fffdf8);color:var(--m-accent,#a44213);cursor:pointer}.refresh-icon svg{width:17px;height:17px}.refresh-icon.spinning svg{animation:refresh-spin .9s linear infinite}@keyframes refresh-spin{to{transform:rotate(360deg)}}.picker-menu,.starter-menu{position:absolute;top:calc(100% + 4px);left:0;z-index:25;width:min(19rem,calc(100vw - 2rem));display:grid;gap:.25rem;padding:.4rem;border:1px solid var(--m-border,#d8d2c8);border-radius:12px;background:var(--m-card,#fffdf8);box-shadow:0 12px 28px rgba(77,48,30,.16);max-height:60vh;overflow:auto}.starter-menu{left:auto;right:0}.picker-menu button,.picker-menu a,.starter-menu button{min-height:44px;padding:.5rem .75rem;border:1px solid var(--m-border,#d8d2c8);border-radius:8px;background:var(--m-surface,#fffdf8);text-align:left;font:inherit}.picker-menu a{color:var(--m-accent,#a44213)}.m-muted{font-size:.875rem;line-height:1.6;color:var(--m-muted,#625e56)}.m-muted.small{font-size:.8rem}.m-error{padding:.7rem;color:#86261f;border:1px solid #86261f}.chart-card{margin:.75rem 0;padding:.85rem;border:1px solid var(--m-border,#d8d2c8);border-radius:12px}.chart-title span{font-size:.75rem;color:var(--m-muted,#625e56)}.small-charts{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}.series-chart{min-width:0}.starter-section{padding-bottom:.25rem}.text-button{border:0;background:none;color:var(--m-accent,#a44213);min-height:44px;font:inherit}.compact-summary{min-height:44px;display:flex;align-items:center;cursor:pointer}.starter-menu button{cursor:pointer}.starter-menu button.active{border-color:var(--m-accent,#a44213);color:var(--m-accent,#a44213)}.starter-menu small{display:block;color:var(--m-muted,#625e56);font-size:.75rem}.new-starter{display:grid;gap:.5rem;margin-top:.5rem}.new-starter input{min-height:44px;padding:.5rem;font:inherit}.risk-banner{padding:.75rem;background:#fff0ed;border-left:3px solid #a12c23;color:#86261f;margin:.75rem 0;display:flex;justify-content:space-between;gap:.5rem}.risk-banner a{color:inherit;font-weight:700}button:disabled{opacity:.55}@media(max-width:360px){.small-charts{gap:.5rem}}
.eyebrow{font-size:.72rem;letter-spacing:.12em;color:var(--m-accent,#a44213);font-weight:700;margin:0 0 .25rem}.picker summary::after{content:'▾';margin-left:auto;padding-left:.75rem}.picker[open] summary::after{content:'▴'}.picker-hint{margin:0 0 .5rem}.jar-status{display:flex;align-items:center;gap:.4rem;min-width:0;min-height:38px;padding:0 .75rem;border:1px solid var(--m-border,#d8d2c8);border-radius:999px;background:var(--m-surface,#fffdf8);font-family:inherit;font-size:.72rem;line-height:1.2;color:var(--m-muted,#625e56)}.status-toggle{flex:1;text-align:left;cursor:pointer}.status-caret{flex:none;width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid currentColor;transition:transform .15s}.status-toggle[aria-expanded="true"] .status-caret{transform:rotate(180deg)}.jar-dot{width:7px;height:7px;border-radius:50%;background:#9b958a;flex:none}.jar-status strong{font-size:.75rem;font-weight:700;color:var(--text-primary,#30251f)}.jar-detail{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.jar-status[data-tone="ok"] .jar-dot{background:#2B7A55}.jar-status[data-tone="warn"] .jar-dot{background:#B4761F}.jar-status[data-tone="fault"] .jar-dot{background:#A12C23}.jar-status[data-tone="fault"] strong{color:#A12C23}.chart-note{margin:-.4rem 0 .6rem;font-size:.7rem;line-height:1.5;color:var(--m-muted,#625e56)}.round-link-button{justify-self:start;border:0;background:none;padding:0;font-family:inherit;cursor:pointer}.menu-action{cursor:pointer;color:var(--m-accent,#a44213)}.round-section{display:grid;gap:.5rem;margin:.75rem 0}.round-section>*,.round-empty{min-width:0;padding:.7rem;border:1px solid var(--m-border,#d8d2c8);border-radius:10px;background:var(--m-card,#fff);font-size:.8rem;line-height:1.4}.round-card{display:grid;gap:.45rem}.round-head{display:flex;align-items:center;justify-content:space-between;gap:.5rem}.round-head strong{font-size:.9rem}.round-state{padding:.15rem .5rem;border-radius:999px;font-size:.7rem;font-weight:600;color:#2B7A55;background:#e7f4ed;white-space:nowrap}.round-state[data-tone="warn"]{color:#8a5a12;background:#fbefd9}.round-state[data-tone="neutral"]{color:#625e56;background:#efeae2}.round-window{margin:0;font-size:.75rem;color:var(--m-muted,#625e56);min-width:0;display:flex;align-items:center;gap:.35rem;flex-wrap:wrap}.compact-range{display:inline-flex;align-items:center;gap:.18rem;white-space:nowrap;font-variant-numeric:tabular-nums;color:var(--text-primary,#30251f);font-weight:700}.range-separator{color:var(--m-muted,#625e56)}.day-offset{display:inline-grid;place-items:center;min-width:.68rem;height:.68rem;padding:0 .04rem;border-radius:50%;background:#f2dcd7;color:#a4524a;font-size:.46rem;line-height:1;font-weight:600}.round-duration{white-space:nowrap;font-variant-numeric:tabular-nums}.round-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.45rem .5rem;margin:0}.round-metrics>div{display:grid;gap:.15rem;min-width:0}.round-metrics dt{font-size:.7rem;color:var(--m-muted,#6f6a61);white-space:nowrap}.round-metrics dd{margin:0;min-width:0;font-size:clamp(.66rem,2.8vw,.8rem);font-weight:700;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.round-note{margin:0;font-size:.72rem;line-height:1.5;color:#a12c23}.round-actions{display:grid;gap:.4rem}.round-actions>.m-secondary{min-height:44px}.round-actions>.m-primary{text-align:center}.close-panel{display:grid;gap:.35rem;padding:.5rem;border:1px solid var(--m-border,#d8d2c8);border-radius:10px}.close-panel p{margin:0;font-size:.75rem;color:var(--m-muted,#625e56)}.close-panel button{min-height:40px;padding:.4rem .6rem;border:1px solid var(--m-border,#d8d2c8);border-radius:8px;background:var(--m-surface,#fffdf8);font:inherit;text-align:left;cursor:pointer}.close-panel .text-button{text-align:center;color:var(--m-accent,#a44213);border:0;background:none}.round-link{font-size:.8rem;font-weight:600;color:var(--m-accent,#a44213)}.round-empty{display:flex;flex-wrap:wrap;align-items:center;gap:.65rem;margin:.75rem 0}.round-empty-action{flex-basis:100%;text-align:center}.round-empty-copy{display:grid;gap:.35rem;min-width:0}.round-empty strong{font-size:.9rem}.round-empty p{margin:0;font-size:.78rem;line-height:1.5;color:var(--m-muted,#625e56)}.jojo-mascot{display:block;object-fit:contain;flex:none}.jojo-login{width:min(52vw,190px);height:auto;margin:.2rem auto .85rem}.jojo-empty{width:72px;height:72px}.chart-card :deep(.chart-feature .series-plot),.small-charts :deep(.series-plot){position:relative;height:76px}.chart-card :deep(.chart-feature .series-plot){height:180px}.chart-card :deep(svg){display:block;width:100%;height:76px}.chart-card :deep(.chart-feature svg){height:180px}.chart-card :deep(.series-line){fill:none;stroke-width:1.5}.chart-card :deep(.chart-feature .series-line){stroke-width:2}.chart-card :deep(.series-chart){--series-stroke:1.5px}.chart-card :deep(.chart-feature){--series-stroke:2px}.chart-card :deep(.series-grid){stroke:var(--m-border,#d8d2c8);stroke-width:.3}.chart-card :deep(.series-dot),.chart-card :deep(.series-hover-dot){position:absolute;transform:translate(-50%,-50%)}.chart-card :deep(.series-dot){border-radius:0}.chart-card :deep(.series-hover-dot){width:6px;height:6px;border-radius:50%}.chart-card :deep(.series-range){display:flex;flex-wrap:nowrap;align-items:center;justify-content:space-between;gap:.25rem;min-width:0}.chart-card :deep(.series-time-range){white-space:nowrap}.chart-card :deep(.series-head){display:flex;align-items:baseline;justify-content:space-between;gap:.25rem;margin-bottom:.25rem;min-width:0}.chart-card :deep(.series-label){min-width:0;overflow:hidden;text-overflow:ellipsis;font-weight:700}.chart-card :deep(.series-headline){min-width:0;flex-wrap:nowrap;gap:.25rem}.chart-card :deep(.series-value),.chart-card :deep(.series-delta){flex-shrink:0}.chart-card :deep(.series-value){font-size:.9rem}.chart-card :deep(.series-delta){font-size:.7rem}.small-charts :deep(.series-delta){display:none}.small-charts{padding-top:.65rem;border-top:1px solid var(--m-border,#d8d2c8)}.picker-menu button,.picker-menu a{border-left:0;border-right:0}.picker-menu button.active{background:color-mix(in srgb,var(--m-accent,#a44213) 8%,transparent)}
.chart-card :deep(.chart-feature .series-value){font-size:1.75rem;letter-spacing:-.04em;font-variant-numeric:tabular-nums}.chart-card :deep(.series-headline){display:flex;align-items:baseline;gap:.25rem;flex-wrap:nowrap;min-width:0;justify-content:flex-end}.chart-card :deep(.height-expansion){display:flex;align-items:center;justify-content:flex-end;gap:.3rem;margin:-.15rem 0 .2rem;color:var(--m-muted,#625e56);font-size:.72rem;line-height:1.2}.chart-card :deep(.height-expansion strong){color:var(--text-primary,#30251f);font-size:.78rem;font-variant-numeric:tabular-nums}.chart-card :deep(.series-tip){position:absolute;z-index:2;transform:translate(-50%,-115%);background:var(--m-card);border:1px solid var(--m-border);padding:.25rem .4rem;pointer-events:none;white-space:nowrap;font-size:.72rem;box-shadow:0 3px 12px #30251f12}.chart-card :deep(.series-tip span){display:block;color:var(--m-muted)}.chart-card :deep(.series-guide){stroke:var(--m-muted);stroke-width:.5;stroke-dasharray:2 2;vector-effect:non-scaling-stroke}.chart-card :deep(.series-grid){stroke-dasharray:2 2}.chart-card :deep(.series-empty){min-height:76px;display:grid;place-items:center;font-size:.8rem;color:var(--m-muted);background:var(--m-surface)}.chart-card :deep(.chart-feature .series-empty){min-height:180px}.chart-title{margin-bottom:.65rem}.round-section{align-items:stretch}
@media(max-width:380px){.round-metrics{gap:.3rem}.round-metrics dt{font-size:.66rem}.round-metrics dd{font-size:.76rem}}

</style>
