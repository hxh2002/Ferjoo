<script setup>
import { computed, onMounted, onScopeDispose, ref, watch } from 'vue';
import { useAuth } from '../../composables/useAuth.js';
import { useVisiblePolling } from '../../composables/useVisiblePolling.js';
import { createStarter, deleteStarter, listCareRecords, listStarters } from '../../services/care.service.js';
import MConfirmDialog from '../../components/mobile/MConfirmDialog.vue';
import { listMeasurementsRange } from '../../services/device.service.js';
import { mobileDeviceService } from '../../services/mobile-device.service.js';
import { linkStarterDevice, listStarterDeviceLinks } from '../../services/starter-device.service.js';
import { loadFeedingEvidence, summarizeFeedingMeasurements } from '../../services/feeding-analysis.service.js';
import { closeFeedingWindow, loadWindowClosure } from '../../services/fermentation-window.service.js';
import { loadSessionReport } from '../../services/mobile-diagnosis.service.js';
import { rememberSelectedStarter } from '../../lib/mobile-selection.js';
import { CLOSE_REASON_LABELS, feedingEvidenceCacheKey, roundState } from '../../lib/mobile-records.js';
import { READ_TTL, cachedRead, invalidateReadCache } from '../../lib/read-cache.js';

import iconThermometer from '../../assets/device/icon-thermometer.svg';
import iconDrop from '../../assets/device/icon-drop.svg';
import iconChartUp from '../../assets/device/icon-chart-up.svg';
import iconScales from '../../assets/device/icon-scales.svg';
import iconTimer from '../../assets/device/icon-timer.svg';
import iconChevron from '../../assets/device/icon-chevron-down.svg';
import iconJar from '../../assets/device/icon-jar.svg';
import jarBody from '../../assets/device/jar-body.svg';
import jarFace from '../../assets/device/jar-face.png';
import jarHat from '../../assets/device/jar-hat.png';
import jarRise from '../../assets/device/jar-rise.svg';
import jarFaceSmall from '../../assets/device/jar-face-small.svg';

defineOptions({ name: 'MobileDeviceHome' });
const auth = useAuth();
const accountId = computed(() => auth.user.value?.id || '');
const devices = ref([]); const starters = ref([]); const measurements = ref([]);
const deviceId = ref(''); const starterId = ref(''); const records = ref([]); const link = ref(null); const previousFeeding = ref(null);
const loading = ref(false); const saving = ref(false); const error = ref(''); const deviceError = ref('');
const deviceOpen = ref(false); const starterOpen = ref(false); const newStarterOpen = ref(false); const contextOpen = ref(false);
const newName = ref(''); const now = ref(Date.now()); const explicitStarter = ref(false);
const evidence = ref(null); const mutationError = ref('');
const nextFeedingAt = ref(null); const closure = ref(null);
const closing = ref(false); const closeError = ref('');
const confirmOpen = ref(false); const toast = ref(''); const starterPendingDelete = ref(null);
let toastTimer;
let generation = 0; let disposed = false; let inFlight = null; let pending = false; let mutationGeneration = 0;
// 与 feeding-analysis 的新鲜度窗口保持一致，仅用于「数据是否还新鲜」的提示。
const FRESH_MS = 40 * 60000;
// 记住每个账号手动选过的酵种罐，刷新后回到上次离开时的设备。
const DEVICE_STORAGE = 'ferjoo.mobile.today.device';
function readSavedDevice(owner) {
  if (!owner || typeof localStorage === 'undefined') return '';
  try { return localStorage.getItem(`${DEVICE_STORAGE}:${owner}`) || ''; } catch { return ''; }
}
function rememberDevice(owner, id) {
  if (!owner || !id || typeof localStorage === 'undefined') return;
  try { localStorage.setItem(`${DEVICE_STORAGE}:${owner}`, id); } catch { /* 存储不可用时退回默认设备 */ }
}

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
const summary = computed(() => feeding.value ? summarizeFeedingMeasurements({
  measurements: evidence.value || measurements.value,
  feeding: feeding.value,
  link: link.value,
  now: now.value,
  nextFeedingAt: nextFeedingAt.value,
  windowEndedAt: closure.value?.ended_at || null
}) : null);
const chartRows = computed(() => (starterId.value && !link.value ? [] : measurements.value.slice().sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at))));
// 本轮喂养时间确定时，读取窗口从起始前 10 分钟开始；没有确定起点才回退到最近 24 小时。
const chartFrom = computed(() => {
  const earliest = Date.parse(feeding.value?.occurred_at);
  const base = link.value?.active_from && Date.parse(link.value.active_from) > Date.parse(from.value) ? link.value.active_from : from.value;
  if (!Number.isFinite(earliest)) return base;
  return new Date(Math.min(Date.parse(base), earliest - 10 * 60000)).toISOString();
});
const chartTo = computed(() => to.value);
const expansionText = computed(() => Number.isFinite(summary.value?.expansionPercent) ? `${summary.value.expansionPercent.toFixed(0)}%` : '—');
const jarLevel = computed(() => {
  const base = Number(summary.value?.baselineHeightMm);
  const current = Number(summary.value?.currentHeightMm);
  if (!(base > 0) || !(current > 0)) return null;
  return Math.min(1, Math.max(0, current / base - 1));
});
const jarStyle = computed(() => (jarLevel.value == null ? null : { '--jar-level': String(jarLevel.value) }));
// 指标只取最近一条有效样本：休眠与传感器故障的读数不能当作当前环境展示。
const latest = computed(() => chartRows.value.filter((row) => !row.sensor_error && (!row.mode || row.mode === 'fer')).at(-1) || null);
function metricText(key, unit) {
  const value = Number(latest.value?.[key]);
  return latest.value && Number.isFinite(value) ? `${Math.round(value * 10) / 10}${unit}` : '—';
}
const temperatureText = computed(() => metricText('temperature_c', '°C'));
const humidityText = computed(() => metricText('humidity_percent', '%'));
const ratioText = computed(() => {
  const value = feeding.value?.ratio;
  if (value === 'deep_reset') return '大比例刷新';
  const parts = typeof value === 'string' ? value.match(/\d+(?:\.\d+)?/g) : null;
  return parts?.length ? parts.join(' : ') : '—';
});
const roundElapsed = computed(() => {
  const start = Date.parse(summary.value?.windowFrom);
  if (!Number.isFinite(start)) return '—';
  const end = Date.parse(summary.value?.windowClosedAt) || now.value;
  if (!Number.isFinite(end) || end < start) return '—';
  const minutes = Math.max(0, Math.floor((end - start) / 60000));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = minutes / 60;
  if (!Number.isInteger(hours) && hours < 10) return `${hours.toFixed(1)} 小时`;
  return `${Math.round(hours)} 小时`;
});
const state = computed(() => summary.value ? roundState(summary.value) : null);
const windowActive = computed(() => !!summary.value?.windowActive);
const endReasonText = computed(() => {
  const value = summary.value;
  if (value?.windowStatus !== 'closed') return '';
  if (value.windowEndReason === 'next_feeding') return '下一次喂养';
  return CLOSE_REASON_LABELS[closure.value?.detail] || '手动结束';
});
// 状态按最近一次采样描述；异常与休眠要单独说清，避免把设备问题读成发酵结束。
const jarStatus = computed(() => {
  if (!deviceId.value) return { tone: 'none', label: '未选择酵种罐', detail: '点按选择设备' };
  if (starterId.value && !link.value) return { tone: 'none', label: '未关联设备', detail: '点按切换或关联' };
  const last = chartRows.value.at(-1);
  if (!last) return { tone: 'none', label: '暂无数据', detail: '最近 24 小时未收到采样' };
  if (last.sensor_error) return { tone: 'fault', label: '传感器异常', detail: `保留最后有效读数 · 最近更新 ${relative(last.recorded_at)}` };
  if (last.mode && last.mode !== 'fer') return { tone: last.mode === 'sleep' ? 'none' : 'warn', label: last.mode === 'sleep' ? '设备休眠中' : '设备模式异常', detail: `保留最后有效读数 · 最近更新 ${relative(last.recorded_at)}` };
  if (summary.value?.dataQuality === 'insufficient' || summary.value?.dataQuality === 'partial') return { tone: 'warn', label: '采样不足', detail: `保留最后有效读数 · 最近更新 ${relative(last.recorded_at)}` };
  const at = Date.parse(last.recorded_at);
  if (Number.isFinite(at) && now.value - at <= FRESH_MS) return { tone: 'ok', label: '设备已连接', detail: `最近更新 ${relative(last.recorded_at)}` };
  return { tone: 'warn', label: '断连', detail: `数据延迟 · 保留最后有效读数 · 最近更新 ${relative(last.recorded_at)}` };
});
// 被排除的样本和断档要说清楚，否则用户会把缺口误读成发酵停止。
const dataNote = computed(() => {
  const rows = chartRows.value;
  if (!rows.length) return '';
  const excluded = rows.filter((row) => row.sensor_error || (row.mode && row.mode !== 'fer')).length;
  let gaps = 0;
  for (let i = 1; i < rows.length; i += 1) if (Date.parse(rows[i].recorded_at) - Date.parse(rows[i - 1].recorded_at) > FRESH_MS) gaps += 1;
  return [excluded ? `${excluded} 条休眠/异常样本未计入膨胀率` : '', gaps ? `${gaps} 段超过 40 分钟无采样` : '', summary.value?.dataQuality === 'insufficient' ? '采样不足，当前数字不是实时值' : ''].filter(Boolean).join('；');
});
const detailTarget = computed(() => ({
  path: `/devices/${encodeURIComponent(deviceId.value)}/trend`,
  query: { ...(starterId.value ? { starter: starterId.value } : {}), day: localDay(now.value) }
}));
const diagnosisTarget = computed(() => ({ path: '/checkin', query: { ...(starterId.value ? { starter: starterId.value } : {}), ...(feeding.value ? { feeding: feeding.value.id, mode: 'diagnosis' } : {}) } }));
const feedTarget = computed(() => ({ path: '/feeding', query: starterId.value ? { starter: starterId.value } : {} }));

function localDay(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function relative(value) {
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return '暂无记录';
  const minutes = Math.max(0, Math.floor((now.value - at) / 60000));
  return minutes < 1 ? '刚刚' : minutes < 60 ? `${minutes} 分钟前` : `${Math.floor(minutes / 60)} 小时前`;
}
function current(token, owner) { return !disposed && token === generation && owner === accountId.value; }
function clearSelected() { records.value = []; previousFeeding.value = null; link.value = null; measurements.value = []; evidence.value = []; report.value = null; nextFeedingAt.value = null; closure.value = null; closeError.value = ''; confirmOpen.value = false; }
function selectDevice(id) {
  if (saving.value || id === deviceId.value) return;
  generation++; deviceId.value = id; rememberDevice(accountId.value, id);
  const keepEmpty = explicitStarter.value && !starterId.value;
  starterId.value = ''; explicitStarter.value = keepEmpty;
  deviceOpen.value = false; clearSelected(); void refresh();
}
function selectStarter(id) {
  if (saving.value) return;
  const item = starters.value.find((row) => row.id === id);
  if (id && (!item || item.link?.device_id && item.link.device_id !== deviceId.value)) return;
  generation++; explicitStarter.value = true; starterId.value = id || ''; starterOpen.value = false; contextOpen.value = false; clearSelected(); void refresh();
}
function openPicker() { contextOpen.value = !contextOpen.value; }

// 手动刷新必须绕过缓存重新向云端确认；自动轮询仍可复用刚读到的数据。
function refreshNow() {
  invalidateReadCache();
  void refresh();
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
      if (linkResult.cause) { error.value = '设备关联读取失败，请刷新重试；暂不展示酵种数据。'; return; }
      const allLinks = linkResult.value || []; const linkMap = new Map();
      for (const row of allLinks) if (row.active_to == null && !linkMap.has(row.starter_id)) linkMap.set(row.starter_id, row);
      const rows = starterResult.value || [];
      const contexts = await Promise.all(rows.map(async (item) => {
        const [latestRow, feedRows, obsRows] = await Promise.all([
          listCareRecords({ userId: owner, starterId: item.id, limit: 1 }),
          listCareRecords({ userId: owner, starterId: item.id, kind: 'feeding', limit: 2 }),
          listCareRecords({ userId: owner, starterId: item.id, kind: 'observation', limit: 1 })
        ]);
        return { ...item, link: linkMap.get(item.id) || null, latest: latestRow[0] || null, feeding: feedRows[0] || null, previousFeeding: feedRows[1] || null, observation: obsRows[0] || null };
      }));
      if (!current(token, owner)) return;
      contexts.sort((a, b) => (Date.parse(b.latest?.occurred_at) || 0) - (Date.parse(a.latest?.occurred_at) || 0));
      devices.value = deviceResult.value || []; starters.value = contexts;
      const sortedDevices = devices.value.slice().sort((a, b) => { const aa = Date.parse(a.created_at); const bb = Date.parse(b.created_at); return (Number.isFinite(aa) ? aa : Infinity) - (Number.isFinite(bb) ? bb : Infinity); });
      if (!devices.value.some(row => row.device_id === deviceId.value)) {
        // 优先回到上次手动选择的设备；首次进入或设备已移除时才用最早的设备。
        const savedDevice = readSavedDevice(owner);
        deviceId.value = devices.value.some(row => row.device_id === savedDevice) ? savedDevice : sortedDevices[0]?.device_id || '';
      }
      let selected = contexts.find(row => row.id === starterId.value);
      if (!explicitStarter.value && !selected) { selected = contexts.find(row => row.link?.device_id === deviceId.value); if (selected) starterId.value = selected.id; }
      if (!selected || selected.link?.device_id && selected.link.device_id !== deviceId.value) { starterId.value = ''; selected = null; }
      link.value = selected?.link || null;
      records.value = [selected?.feeding, selected?.observation].filter(Boolean).sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));
      previousFeeding.value = selected?.previousFeeding || null;
      const session = loadSessionReport(owner);
      report.value = session?.accountId === owner && session.starterId === starterId.value ? session : null;
      evidence.value = []; nextFeedingAt.value = null; closure.value = null;
      if (feeding.value) {
        // 证据读取较重，短时间内与轮次详情页共用同一份缓存。
        const [loadedResult, closureResult] = await Promise.all([
          cachedRead(
            feedingEvidenceCacheKey(owner, starterId.value, feeding.value.id),
            () => loadFeedingEvidence(owner, starterId.value, feeding.value.id),
            { ttl: READ_TTL.records }
          ).then(value => ({ value }), cause => ({ cause })),
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
      const rangeFrom = chartFrom.value;
      const measuredRows = await listMeasurementsRange(deviceId.value, { from: rangeFrom, to: to.value, bucketed: false });
      if (!current(token, owner)) return;
      measurements.value = measuredRows.filter(row => {
        const at = Date.parse(row.recorded_at);
        return at >= Date.parse(rangeFrom) && at <= now.value && (!row.device_id || row.device_id === deviceId.value)
          && (!link.value || link.value.device_id === deviceId.value && (!link.value.active_to || at < Date.parse(link.value.active_to)));
      }).map(row => ({ ...row, height_mm: Number(row.height_mm) > 0 ? Number(row.height_mm) : null }));
    } catch (cause) { if (current(token, owner)) error.value = cause?.message || '读取失败，请稍后重试。'; }
  })();
  try { await inFlight; } finally { inFlight = null; loading.value = false; if (pending && !disposed) { pending = false; void refresh(); } }
}
function showToast(text) {
  toast.value = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value = ''; }, 2600);
}
async function endRound(detail = null) {
  if (closing.value || !feeding.value || !summary.value?.windowActive) return;
  const owner = accountId.value; const token = generation; const feedingId = feeding.value.id;
  closing.value = true; closeError.value = '';
  try {
    const saved = await closeFeedingWindow({ feedingId, endedAt: new Date().toISOString(), detail });
    if (!current(token, owner)) return;
    closure.value = saved; confirmOpen.value = false; now.value = Date.now();
    showToast('历史记录已保存');
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
async function removeStarter() {
  const item = starterPendingDelete.value;
  starterPendingDelete.value = null;
  if (!item || item.link || saving.value) return;
  const owner = accountId.value; const token = generation; saving.value = true; mutationError.value = '';
  try {
    await deleteStarter(item.id);
    if (!current(token, owner)) return;
    starters.value = starters.value.filter((row) => row.id !== item.id);
    if (starterId.value === item.id) selectStarter('');
  } catch (cause) {
    if (current(token, owner)) mutationError.value = cause?.message || '删除失败，请重试。';
  } finally {
    if (current(token, owner)) saving.value = false;
  }
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
// 记录页读取同一偏好作为默认酵种，切回设备页时两处看到的是同一罐。
watch(starterId, (id) => { if (id) rememberSelectedStarter(accountId.value, id); });
useVisiblePolling(refresh, 60000);
onMounted(() => auth.init());
onScopeDispose(() => { disposed = true; generation++; clearTimeout(toastTimer); });
</script>

<template>
  <main class="m-page device-page">
    <template v-if="!accountId">
      <section class="m-card intro-card"><img class="jojo-mascot jojo-login" src="/assets/jojo1.png" alt="Jojo 吉祥物"><p class="eyebrow">设备</p><h1>连接设备，开始记录</h1><RouterLink class="m-primary" :to="{ path: '/login', query: { redirect: '/device' } }">登录后开始</RouterLink></section>
    </template>
    <template v-else>
      <button v-if="contextOpen" type="button" class="picker-backdrop" aria-label="关闭酵种选择" @click="contextOpen = false"></button>
      <header class="device-head">
        <h1>我的设备</h1>
        <div class="starter-anchor">
          <button type="button" class="starter-switch" :aria-expanded="contextOpen" aria-haspopup="dialog" @click="openPicker">
            <img class="switch-jar" :src="iconJar" alt="" width="16" height="16" />
            <span class="switch-name">{{ starter?.name || activeDevice?.name || '选择酵种' }}</span>
            <img class="switch-caret" :src="iconChevron" alt="" width="16" height="16" />
          </button>
          <section v-if="contextOpen" class="picker-row" role="dialog" aria-label="选择酵种">
            <div class="sheet-head"><strong>选择酵种</strong><button type="button" class="sheet-close" aria-label="收起" @click="contextOpen = false">收起</button></div>
            <details class="picker" :open="deviceOpen" @toggle="deviceOpen = $event.target.open">
              <summary><span class="picker-label">酵种罐</span><span class="picker-value">{{ activeDevice?.name || activeDevice?.device_id || '未选择' }}</span></summary>
              <div class="picker-menu">
                <button v-for="item in devices" :key="item.device_id" type="button" :class="{ active: item.device_id === deviceId }" @click="selectDevice(item.device_id)">{{ item.name || item.device_id }}</button>
                <RouterLink to="/me/devices?bind=1">新增/连接酵种罐</RouterLink>
              </div>
            </details>
            <details class="picker" :open="starterOpen" @toggle="starterOpen = $event.target.open">
              <summary><span class="picker-label">酵种</span><span class="picker-value">{{ starter?.name || '未选择' }}</span></summary>
              <div class="picker-menu starter-menu">
                <button type="button" :class="{ active: !starterId }" @click="selectStarter('')">仅查看设备数据</button>
                <div v-for="item in starters" :key="item.id" class="starter-choice">
                  <button type="button" :class="{ active: item.id === starterId }" :disabled="!!item.link?.device_id && item.link.device_id !== deviceId" @click="selectStarter(item.id)">{{ item.name }}<small>{{ item.link ? (item.link.device_id === deviceId ? '已关联当前设备' : '已关联其他设备 · 切换设备后可选') : '未关联设备 · 仅查看记录' }}</small></button>
                  <button v-if="!item.link" type="button" class="starter-delete" :disabled="saving" @click="starterPendingDelete = item">删除</button>
                </div>
                <button class="menu-action" type="button" @click="newStarterOpen = !newStarterOpen">+ 新增酵种</button>
                <form v-if="newStarterOpen" class="new-starter" @submit.prevent="addStarter"><input v-model="newName" maxlength="80" placeholder="酵种名称" :disabled="saving"><button class="m-primary" type="submit" :disabled="saving || !newName.trim()">{{ saving ? '保存中…' : '新建并关联当前设备' }}</button></form>
                <button v-if="starterId && !link && deviceId" class="menu-action" type="button" :disabled="saving || loading" @click="associateSelected">关联当前设备</button>
              </div>
            </details>
          </section>
        </div>
      </header>
      <p class="jar-status" :data-tone="jarStatus.tone">
        <span class="jar-dot" aria-hidden="true"></span><span class="jar-label">{{ jarStatus.label }}</span>
        <button type="button" class="jar-refresh" :class="{ spinning: loading }" :disabled="loading || saving" :aria-label="loading ? '正在刷新' : '刷新'" @click="refreshNow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 12a8.5 8.5 0 0 1-14.6 5.9L4 16" /><path d="M3.5 12A8.5 8.5 0 0 1 18.1 6.1L20 8" /><path d="M20 3.6V8h-4.4" /><path d="M4 20.4V16h4.4" /></svg>
        </button>
      </p>
      <p v-if="error || mutationError || deviceError" class="m-error" role="alert">{{ error || mutationError || deviceError }}</p>

      <section class="jar-stage" aria-label="酵种罐示意">
        <img class="jar-photo" :src="jarFace" alt="" width="128" height="170" />
        <img class="jar-ticks" :src="jarBody" alt="" width="180" height="180" />
        <span class="jar-window"><span class="jar-rise" :class="{ measured: jarLevel != null }" :style="jarStyle"><img :src="jarRise" alt="" width="78" height="52" /></span></span>
        <span class="jar-face"><img :src="jarFaceSmall" alt="" width="30" height="15" /></span>
        <img class="jar-hat" :src="jarHat" alt="" width="147" height="98" />
      </section>

      <p class="section-label">本次喂养</p>
      <RouterLink v-if="feeding" class="feed-summary" :to="{ path: `/diary/records/${feeding.id}`, query: { returnTo: '/device' } }">
        <span class="feed-cell">
          <span class="feed-head"><span class="disc"><img :src="iconScales" alt="" width="16" height="16" /></span><span class="feed-label">喂养比例</span></span>
          <strong class="feed-value">{{ ratioText }}</strong>
        </span>
        <span class="feed-cell">
          <span class="feed-head"><span class="disc"><img :src="iconTimer" alt="" width="16" height="16" /></span><span class="feed-label">已发酵</span></span>
          <strong class="feed-value">{{ roundElapsed }}</strong>
        </span>
        <span v-if="state" class="feed-state" :data-tone="state.tone">{{ state.label }}</span>
      </RouterLink>
      <section v-else class="feed-empty">
        <img class="jojo-mascot jojo-empty" src="/assets/jojo2.png" alt="Jojo 吉祥物" loading="lazy">
        <div class="feed-empty-copy"><strong>还没有开始新一轮</strong><p>记录一次喂养后，本轮会从喂养时间开始。</p></div>
        <RouterLink class="feed-empty-action" :to="feedTarget">记录喂养</RouterLink>
      </section>
      <p v-if="endReasonText" class="round-note">结束原因：{{ endReasonText }}</p>

      <div class="section-head">
        <p class="section-label">当前数据</p>
        <RouterLink v-if="deviceId" class="detail-link" :to="detailTarget">详情</RouterLink>
      </div>
      <section class="metric-row" aria-label="当前数据">
        <article class="metric" data-level="1">
          <span class="disc"><img :src="iconChartUp" alt="" width="18" height="18" /></span>
          <strong>{{ expansionText }}</strong>
          <span class="metric-label">膨胀率</span>
        </article>
        <article class="metric" data-level="2">
          <span class="disc"><img :src="iconThermometer" alt="" width="18" height="18" /></span>
          <strong>{{ temperatureText }}</strong>
          <span class="metric-label">温度</span>
        </article>
        <article class="metric" data-level="3">
          <span class="disc"><img :src="iconDrop" alt="" width="18" height="18" /></span>
          <strong>{{ humidityText }}</strong>
          <span class="metric-label">湿度</span>
        </article>
      </section>
      <p v-if="dataNote" class="data-note">{{ dataNote }}</p>

      <p v-if="closeError" class="m-error" role="alert">{{ closeError }}</p>
      <button v-if="windowActive" type="button" class="device-cta" :disabled="closing" @click="confirmOpen = true">结束当前发酵</button>
      <RouterLink v-else class="device-cta" :to="feedTarget">喂养</RouterLink>
      <p v-if="feeding" class="cta-note"><RouterLink class="text-link" :to="diagnosisTarget">诊断本轮</RouterLink><span>诊断需 3 步，只生成建议。</span></p>
      <p v-else class="cta-note"><span>记录喂养后，本轮发酵会自动开始计时。</span></p>

      <div v-if="riskAdvice" class="risk-banner" role="alert"><strong>上次风险结果：{{ lastAdvice.result.title }}</strong><RouterLink :to="lastAdvice.savedId ? `/diary/records/${lastAdvice.savedId}` : '/reports/session'">查看结果</RouterLink></div>

      <MConfirmDialog :open="!!starterPendingDelete" danger title="删除酵种" :message="`删除「${starterPendingDelete?.name || ''}」后，未关联设备的记录入口会消失。已关联设备的酵种不能在这里删除。`" confirm-label="删除" @cancel="starterPendingDelete = null" @confirm="removeStarter" />
      <MConfirmDialog :open="confirmOpen" danger title="结束当前发酵？" message="结束后，本次发酵将停止记录。你可以开始下一次喂养。" :confirm-label="closing ? '正在结束…' : '确认结束'" cancel-label="继续发酵" @cancel="confirmOpen = false" @confirm="endRound(null)" />

      <div v-if="toast" class="saved-toast" role="status">
        <span class="toast-disc" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>
        <span class="toast-copy"><strong>{{ toast }}</strong><small>本次发酵已结束</small></span>
      </div>
    </template>
  </main>
</template>

<style scoped>
.mobile-area .m-page.device-page{padding-top:calc(12px + env(safe-area-inset-top));padding-bottom:calc(var(--m-tab-height) + env(safe-area-inset-bottom) + 88px);gap:0}
.device-head{position:relative;z-index:32;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:36px}
.starter-anchor{position:relative;flex:none}
.picker-backdrop{position:fixed;inset:0;z-index:31;border:0;background:transparent;cursor:default}
.device-head h1{margin:0;font-size:28px;line-height:36px;font-weight:500;letter-spacing:-.02em}
.starter-switch{display:inline-flex;align-items:center;gap:6px;flex:none;box-sizing:border-box;width:100px;height:36px;min-height:36px;padding:0 10px;border:0;border-radius:18px;background:var(--surface-card);box-shadow:0 3px 12px rgba(48,37,31,.07);color:var(--text-primary);font:inherit;font-size:12px;font-weight:500;cursor:pointer}
.switch-jar{flex:none;width:16px;height:16px}
.switch-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}
.switch-caret{flex:none;width:16px;height:16px;transition:transform var(--motion-fast) ease}
.starter-switch[aria-expanded="true"] .switch-caret{transform:rotate(180deg)}
.jar-status{display:flex;align-items:center;gap:6px;min-height:24px;margin:8px 0 0;font-size:14px;line-height:21px;font-weight:500;color:var(--brand-action)}
.jar-dot{width:7px;height:7px;border-radius:50%;background:currentColor;flex:none}
.jar-status[data-tone="none"]{color:var(--text-secondary)}
.jar-status[data-tone="warn"]{color:var(--warning-text)}
.jar-status[data-tone="fault"]{color:var(--danger-text)}
.jar-label{flex:1;min-width:0}
.jar-refresh{flex:none;display:grid;place-items:center;width:24px;height:24px;min-height:0;margin-right:-4px;padding:4px;border:0;border-radius:50%;background:transparent;color:var(--text-secondary);cursor:pointer}
.jar-refresh svg{width:16px;height:16px;min-height:0}
.jar-refresh.spinning svg{animation:device-spin .9s linear infinite}
@keyframes device-spin{to{transform:rotate(360deg)}}
.jar-stage{position:relative;width:180px;height:180px;margin:0 auto}
.jar-photo{position:absolute;left:26px;top:20px;width:128px;height:170px;object-fit:cover;pointer-events:none}
.jar-ticks{position:absolute;inset:0;width:180px;height:180px}
.jar-window{position:absolute;left:51px;top:118px;width:78px;height:52px;overflow:hidden}
.jar-rise{position:absolute;left:0;bottom:0;width:78px;height:52px;transform-origin:50% 100%;animation:jar-rise 2s ease-in-out infinite}
.jar-rise.measured{height:calc(8px + var(--jar-level, 0) * 44px);animation:none}
.jar-rise img{display:block;width:100%;height:100%;object-fit:cover;object-position:bottom}
.jar-face{position:absolute;left:75px;top:140px;width:30px;height:15px;animation:jar-face 2s ease-in-out infinite}
.jar-face img{display:block;width:100%;height:100%}
.jar-hat{position:absolute;left:18px;top:-9px;width:147px;height:98px;object-fit:contain;pointer-events:none}
@keyframes jar-rise{0%,100%{transform:translateY(9px) scaleY(.65)}50%{transform:translateY(-6px) scaleY(1.25)}}
@keyframes jar-face{0%,100%{transform:translateY(0)}50%{transform:translateY(-18px)}}
.section-label{margin:28px 0 9px;font-size:14px;line-height:21px;font-weight:500;color:var(--text-secondary)}
.section-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin:14px 0 3px}
.section-head .section-label{margin:0}
/* 全局把 .m-page 直接子元素的 margin-block 归零，本页按设计稿的间距用更高优先级写回。 */
.mobile-area .mobile-main .m-page.device-page > .section-label{margin-block:28px 9px}
.mobile-area .mobile-main .m-page.device-page > .section-head{margin-block:14px 3px}
.mobile-area .mobile-main .m-page.device-page > .metric-row{margin-block:0}
.mobile-area .mobile-main .m-page.device-page > .device-cta{margin-block:14px 0}.detail-link{font-size:14px;font-weight:500;line-height:21px;color:var(--brand-accent);text-decoration:none}
.feed-summary{position:relative;display:grid;grid-template-columns:1fr 1fr;min-height:76px;margin:0;padding:8px 0;border-radius:var(--radius-card);background:var(--surface-card);box-shadow:0 4px 18px rgba(48,37,31,.07);color:inherit;text-decoration:none}
.feed-cell{display:grid;gap:4px;align-content:start;min-width:0;padding:0 18px}
.feed-cell+.feed-cell{border-left:1px solid var(--border-default)}
.feed-head{display:flex;align-items:center;gap:6px;min-width:0}
.disc{display:grid;place-items:center;flex:none;width:26px;height:26px;border-radius:50%;background:var(--m-icon-disc)}
.disc img{display:block}
.feed-label{font-size:14px;line-height:21px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.feed-value{font-size:16px;line-height:24px;font-weight:500;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.feed-state{position:absolute;right:18px;bottom:6px;padding:1px 6px;border-radius:var(--radius-badge);background:var(--success-bg);color:var(--success-text);font-size:10px;font-weight:600}
.feed-state[data-tone="pending"]{background:var(--warning-bg);color:var(--warning-text)}
.feed-empty{display:flex;align-items:center;gap:12px;min-height:76px;margin:0;padding:8px 18px;border-radius:var(--radius-card);background:var(--surface-card);box-shadow:0 4px 18px rgba(48,37,31,.07)}
.feed-empty-copy{display:grid;gap:2px;min-width:0;flex:1}
.feed-empty-copy strong{font-size:16px;font-weight:500}
.feed-empty-copy p{margin:0;font-size:12px;line-height:18px;color:var(--text-secondary)}
.feed-empty-action{flex:none;min-height:32px;padding:0 12px;border-radius:16px;background:var(--brand-light);color:var(--text-primary);font-size:13px;font-weight:500;text-decoration:none;display:inline-flex;align-items:center}
.jojo-empty{width:52px;height:52px}
.round-note{margin:8px 0 0;font-size:12px;line-height:18px;color:var(--text-secondary)}
.metric-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:3px 0 0;padding:18px 0;border-radius:24px}
.metric{display:grid;justify-items:start;gap:2px;min-width:0;height:116px;padding:10px 12px;border-radius:20px;background:var(--m-metric-soft)}
.metric[data-level="2"]{background:var(--m-metric-mid)}
.metric[data-level="3"]{background:var(--m-metric-strong)}
.metric .disc{width:30px;height:30px;background:rgba(255,176,90,.16)}
.metric strong{margin-top:8px;font-size:18px;line-height:26px;font-weight:500;color:var(--text-primary);font-variant-numeric:tabular-nums;white-space:nowrap}
.metric-label{font-size:14px;line-height:21px;color:var(--text-secondary)}
.data-note{margin:8px 0 0;font-size:12px;line-height:18px;color:var(--text-secondary)}
.device-cta{display:flex;align-items:center;justify-content:center;width:100%;height:60px;min-height:60px;margin:14px 0 0;padding:0 16px;border:0;border-radius:var(--m-radius-button);background:var(--brand-light);color:var(--text-primary);font:inherit;font-size:16px;font-weight:500;text-decoration:none;cursor:pointer}
.device-cta:active:not(:disabled){background:var(--brand-accent)}
.device-cta:disabled{opacity:.6;cursor:not-allowed}
.cta-note{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:6px;margin:10px 0 0;font-size:12px;line-height:18px;color:var(--text-secondary)}
.cta-note .text-link{min-height:0;padding:0;color:var(--brand-action);font-size:12px;font-weight:500;text-decoration:none}
.risk-banner{margin-top:16px;padding:12px;border-left:3px solid var(--danger-text);background:var(--danger-bg);color:var(--danger-text);font-size:13px;display:flex;align-items:center;justify-content:space-between;gap:8px}
.risk-banner a{color:inherit;font-weight:600}
.picker-row{position:absolute;z-index:2;top:calc(100% + 8px);right:0;display:grid;gap:8px;width:min(280px,calc(100vw - 48px));max-height:min(420px,70vh);margin:0;padding:12px;overflow:auto;border:1px solid var(--border-subtle);border-radius:var(--radius-card);background:var(--surface-card);box-shadow:0 8px 24px rgba(48,37,31,.14)}
.sheet-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.sheet-head strong{font-size:16px;font-weight:500}
.sheet-close{min-height:32px;padding:0 8px;border:0;background:none;color:var(--brand-action);font:inherit;font-size:13px;cursor:pointer}
.picker{position:relative;min-width:0;border:1px solid var(--border-subtle);border-radius:var(--radius-control)}
.picker summary{display:flex;align-items:center;gap:6px;min-height:48px;padding:0 12px;cursor:pointer;list-style:none}
.picker summary::-webkit-details-marker{display:none}
.picker-label{flex:none;font-size:12px;color:var(--text-secondary)}
.picker-value{flex:1;min-width:0;font-size:14px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.picker summary::after{content:'▾';margin-left:auto;padding-left:8px;color:var(--text-secondary)}
.picker[open] summary::after{content:'▴'}
.picker-menu{display:grid;gap:4px;padding:6px;border-top:1px solid var(--border-subtle)}
.picker-menu button,.picker-menu a{display:grid;gap:2px;width:100%;min-height:44px;padding:8px 10px;border:1px solid var(--border-subtle);border-radius:10px;background:var(--surface-input);color:inherit;font:inherit;font-size:14px;text-align:left;text-decoration:none;cursor:pointer}
.picker-menu button.active{border-color:var(--brand-action);background:var(--surface-selected);color:var(--brand-action)}
.picker-menu button:disabled{opacity:.55;cursor:not-allowed}
.starter-choice{display:flex;align-items:center;gap:8px}
.starter-choice > button:first-child{flex:1}
.starter-delete{flex:none;min-height:44px;padding:0 8px;border:0;background:transparent;color:var(--danger-text);font:inherit}
.picker-menu small{font-size:11px;color:var(--text-secondary)}
.menu-action{color:var(--brand-action)!important}
.new-starter{display:grid;gap:8px;margin-top:4px}
.new-starter input{min-height:44px;padding:8px 10px;border:1px solid var(--border-input);border-radius:10px;font:inherit;font-size:14px;background:var(--surface-input);color:var(--text-primary)}
.new-starter .m-primary{width:100%;min-height:44px;font-size:14px}
.saved-toast{position:fixed;left:50%;top:calc(env(safe-area-inset-top) + 87px);z-index:var(--m-z-modal);display:flex;align-items:center;gap:12px;width:280px;max-width:calc(100vw - 48px);min-height:68px;padding:13px;border:1px solid var(--brand-light);border-radius:var(--m-radius-toast);background:var(--surface-card);box-shadow:0 5px 18px rgba(48,37,31,.14);transform:translateX(-50%);animation:toast-in 220ms ease-out}
.toast-disc{display:grid;place-items:center;flex:none;width:40px;height:40px;border-radius:50%;background:rgba(255,176,90,.16);color:var(--brand-action)}
.toast-disc svg{width:20px;height:20px}
.toast-copy{display:grid;gap:2px;min-width:0}
.toast-copy strong{font-size:16px;line-height:20px;font-weight:500;color:var(--text-primary)}
.toast-copy small{font-size:12px;line-height:18px;color:var(--text-secondary)}
@keyframes toast-in{from{opacity:0;transform:translate(-50%,-8px)}to{opacity:1;transform:translate(-50%,0)}}
.intro-card{text-align:center}
.intro-card .m-primary{width:100%;margin-top:12px}
.jojo-login{width:min(52vw,190px);height:auto;margin:.2rem auto .85rem}
.eyebrow{margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:.1em;color:var(--brand-action)}
@media (prefers-reduced-motion:reduce){.jar-rise,.jar-face{animation:none}.saved-toast{animation:none}}
@media (max-width:360px){.metric{padding:10px}.metric strong{font-size:16px}.feed-cell{padding:0 12px}}
</style>
