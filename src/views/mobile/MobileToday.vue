<script setup>
import { computed, onActivated, onDeactivated, onMounted, onScopeDispose, ref, watch } from 'vue';
import { useAuth } from '../../composables/useAuth.js';
import { useVisiblePolling } from '../../composables/useVisiblePolling.js';
import { createStarter, listCareRecords, listStarters } from '../../services/care.service.js';
import { listMeasurementsRange } from '../../services/device.service.js';
import { mobileDeviceService } from '../../services/mobile-device.service.js';
import { linkStarterDevice, listStarterDeviceLinks } from '../../services/starter-device.service.js';
import { loadFeedingEvidence, summarizeFeedingMeasurements } from '../../services/feeding-analysis.service.js';
import {
  HEIGHT_ALERT_TARGETS, enableSystemNotification, heightAlertMessage, markHeightAlertNotified,
  notificationPermission, pendingHeightAlerts, readHeightAlerts, sendSystemNotification, toggleHeightTarget, writeHeightAlerts
} from '../../services/height-alert.service.js';
import { loadSessionReport } from '../../services/mobile-diagnosis.service.js';
import SeriesChart from '../../components/SeriesChart.vue';

defineOptions({ name: 'MobileToday' });
const auth = useAuth();
const accountId = computed(() => auth.user.value?.id || '');
const devices = ref([]); const starters = ref([]); const measurements = ref([]);
const deviceId = ref(''); const starterId = ref(''); const records = ref([]); const link = ref(null);
const loading = ref(false); const saving = ref(false); const error = ref(''); const deviceError = ref('');
const deviceOpen = ref(false); const starterOpen = ref(false); const newStarterOpen = ref(false);
const newName = ref(''); const now = ref(Date.now()); const explicitStarter = ref(false);
const evidence = ref(null); const mutationError = ref('');
const alerts = ref(readHeightAlerts(''));
const alertPermission = ref(notificationPermission());
const alertNotice = ref('');
let generation = 0; let disposed = false; let inFlight = null; let pending = false; let mutationGeneration = 0;

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
const summary = computed(() => feeding.value && link.value ? summarizeFeedingMeasurements({ measurements: evidence.value || measurements.value, feeding: feeding.value, link: link.value, now: now.value }) : null);
const chartRows = computed(() => (starterId.value && !link.value ? [] : measurements.value.slice().sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at))));
const heightPoints = computed(() => chartRows.value.map((row) => ({ t: row.recorded_at, v: valid(row, 'height_mm'), sensor_error: row.sensor_error || row.mode === 'sleep' })));
const tempPoints = computed(() => chartRows.value.map((row) => ({ t: row.recorded_at, v: valid(row, 'temperature_c'), sensor_error: row.sensor_error || row.mode === 'sleep' })));
const humidityPoints = computed(() => chartRows.value.map((row) => ({ t: row.recorded_at, v: valid(row, 'humidity_percent'), sensor_error: row.sensor_error || row.mode === 'sleep' })));
const heightBaseline = computed(() => summary.value?.baselineHeightMm > 0 ? summary.value.baselineHeightMm : null);

function valid(row, key) { if (!row || row.sensor_error || row.mode !== 'fer') return null; return number(row[key]); }
function number(value) { const n = Number(value); return value == null || value === '' || !Number.isFinite(n) ? null : n; }
function relative(value) { const t = Date.parse(value); if (!Number.isFinite(t)) return '暂无记录'; const m = Math.max(0, Math.floor((now.value - t) / 60000)); return m < 1 ? '刚刚' : m < 60 ? `${m}分钟前` : `${Math.floor(m / 60)}小时前`; }
function target(path, extra = {}) { return { path, query: { ...(starterId.value ? { starter: starterId.value } : {}), ...extra } }; }
function current(token, owner) { return !disposed && token === generation && owner === accountId.value; }
function clearSelected() { records.value = []; link.value = null; measurements.value = []; evidence.value = []; report.value = null; }
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
      evidence.value = [];
      if (feeding.value && link.value) {
        try { const loaded = await loadFeedingEvidence(owner, starterId.value, feeding.value.id); if (!current(token, owner)) return; evidence.value = loaded.link?.device_id === deviceId.value && loaded.link?.active_from === link.value.active_from ? loaded.measurements : []; }
        catch (cause) { if (!current(token, owner)) return; error.value = cause?.message || '本轮设备证据读取失败，可手动诊断。'; }
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
let alertTimer = null; let alertRunning = false;
function stopAlertTimer() { if (alertTimer) { clearInterval(alertTimer); alertTimer = null; } }
// 有有效预约且已授权时，页面切到后台仍继续轮询，才能及时发出系统通知；无预约时不额外查询。
function startAlertTimer() {
  stopAlertTimer();
  if (disposed || !alerts.value.targets.length || alertPermission.value !== 'granted') return;
  alertTimer = setInterval(() => { if (document.hidden) void refresh(); }, 60000);
}
function toggleTarget(target) {
  alertNotice.value = '';
  alerts.value = writeHeightAlerts(accountId.value, toggleHeightTarget(alerts.value, target));
  startAlertTimer();
}
async function enableAlerts() {
  alertPermission.value = await enableSystemNotification();
  alertNotice.value = alertPermission.value === 'granted' ? '已开启系统提醒'
    : alertPermission.value === 'unsupported' ? '当前浏览器不支持系统通知'
      : alertPermission.value === 'denied' ? '浏览器已拒绝通知权限，请在浏览器设置中开启' : '';
  startAlertTimer();
}
async function evaluateAlerts() {
  if (alertRunning || alertPermission.value !== 'granted' || !alerts.value.targets.length || !accountId.value) return;
  const rows = pendingHeightAlerts({ state: alerts.value, feedingId: feeding.value?.id, baselineHeightMm: summary.value?.baselineHeightMm, currentHeightMm: summary.value?.currentHeightMm });
  if (!rows.length) return;
  alertRunning = true;
  try {
    for (const item of rows) {
      if (!current(generation, accountId.value)) return;
      const sent = await sendSystemNotification({ ...heightAlertMessage(item.target, item.ratio), tag: `ferjoo-height-${feeding.value.id}-${item.target}` });
      if (!sent) { alertNotice.value = '系统通知发送失败，请检查浏览器通知设置'; continue; }
      alerts.value = writeHeightAlerts(accountId.value, markHeightAlertNotified(alerts.value, item.target, feeding.value.id));
      alertNotice.value = `${item.target}× 已提醒`;
    }
  } finally { alertRunning = false; }
}
watch(accountId, () => { generation++; mutationGeneration++; saving.value = false; deviceId.value = ''; starterId.value = ''; explicitStarter.value = false; devices.value = []; starters.value = []; newName.value = ''; newStarterOpen.value = false; deviceOpen.value = false; starterOpen.value = false; mutationError.value = ''; alerts.value = readHeightAlerts(accountId.value); alertNotice.value = ''; stopAlertTimer(); clearSelected(); error.value = ''; deviceError.value = ''; if (accountId.value) void refresh(); }, { immediate: true, flush: 'sync' });
watch(summary, () => { void evaluateAlerts(); });
useVisiblePolling(refresh, 60000); onMounted(() => { auth.init(); alertPermission.value = notificationPermission(); startAlertTimer(); }); onActivated(() => { alertPermission.value = notificationPermission(); startAlertTimer(); }); onDeactivated(stopAlertTimer); onScopeDispose(() => { disposed = true; generation++; stopAlertTimer(); });
</script>

<template>
  <main class="m-page today-page">
    <header class="today-heading starter-section">
      <div class="picker-row">
        <details class="picker" :open="deviceOpen" @toggle="deviceOpen = $event.target.open"><summary><span class="picker-label">酵种罐</span><span class="picker-value">{{ activeDevice?.name || activeDevice?.device_id || '未选择' }}</span></summary><div class="picker-menu"><button v-for="item in devices" :key="item.device_id" type="button" :class="{ active: item.device_id === deviceId }" @click="selectDevice(item.device_id)">{{ item.name || item.device_id }}</button><RouterLink to="/me/devices?bind=1">新增/连接酵种罐</RouterLink></div></details>
        <button v-if="accountId" class="m-secondary compact" :disabled="loading || saving" @click="refresh">{{ loading ? '刷新中…' : '刷新' }}</button>
      </div>
      <details class="picker" :open="starterOpen" @toggle="starterOpen = $event.target.open"><summary><span class="picker-label">酵种</span><span class="picker-value">{{ starter?.name || '未选择' }}</span></summary><div class="picker-menu starter-menu"><button type="button" :class="{ active: !starterId }" @click="selectStarter('')">不选择酵种</button><button v-for="item in eligibleStarters" :key="item.id" type="button" :class="{ active: item.id === starterId }" @click="selectStarter(item.id)">{{ item.name }}<small>{{ item.link ? '已关联当前设备' : '未关联设备 · 仅查看记录' }}</small></button><button class="menu-action" type="button" @click="newStarterOpen = !newStarterOpen">+ 新增酵种</button><form v-if="newStarterOpen" class="new-starter" @submit.prevent="addStarter"><input v-model="newName" maxlength="80" placeholder="酵种名称" :disabled="saving"><button class="m-primary" type="submit" :disabled="saving || !newName.trim()">{{ saving ? '保存中…' : '新建并关联当前设备' }}</button></form><button v-if="starterId && !link && deviceId" class="menu-action" type="button" :disabled="saving || loading" @click="associateSelected">关联当前设备</button></div></details>
    </header>
    <p v-if="accountId && (!devices.length || !starters.length)" class="m-muted small picker-hint">{{ !devices.length ? '还没有酵种罐：展开「酵种罐」新增或连接第一个设备，再新建酵种。' : '还没有酵种：展开「酵种」新建第一个酵种并关联当前设备。' }}</p>
    <p v-if="accountId && starterId && !link" class="m-muted small picker-hint">该酵种尚未关联当前设备，暂不显示设备曲线。</p>
    <p v-if="error || mutationError" class="m-error" role="alert">{{ error || mutationError }}</p><p v-if="loading" class="m-muted" role="status">正在读取…</p>
    <section v-if="!accountId" class="m-card intro-card"><p class="eyebrow">今日</p><h1>连接设备，开始记录</h1><RouterLink class="m-primary" :to="{ path: '/login', query: { redirect: '/today' } }">登录后开始</RouterLink></section>
    <template v-else>
      <p v-if="deviceError" class="m-error" role="alert">{{ deviceError }}</p>
        <div v-if="starterId && feeding" class="summary-row">
        <section class="feeding-summary"><strong>本轮喂养概况</strong><span v-if="summary?.baselinePending">暂定：喂养后 50 分钟内持续采集基线。</span><span>基线：{{ summary?.baselineHeightMm != null ? `${summary.baselineHeightMm.toFixed(1)} mm (${summary.baselineSource === 'manual' ? '人工' : '设备'})` : summary?.baselinePending ? '基线采集中（暂定）' : '暂定/未建立' }}</span><span>膨胀率：{{ summary?.expansionPercent != null ? `${summary.expansionPercent.toFixed(1)}%` : '暂不可计算' }}</span><span>距上次喂养：{{ relative(feeding.occurred_at) }}</span></section>
        <section class="alert-card"><div class="alert-head"><strong>高度预约</strong><button class="alert-notify" type="button" :class="{ on: alertPermission === 'granted' }" @click="enableAlerts">{{ alertPermission === 'granted' ? '系统提醒已开' : '开启系统提醒' }}</button></div><div class="alert-targets" role="group" aria-label="高度提醒阈值"><button v-for="target in HEIGHT_ALERT_TARGETS" :key="target" type="button" class="alert-target" :class="{ active: alerts.targets.includes(target) }" :aria-pressed="alerts.targets.includes(target)" @click="toggleTarget(target)">{{ target }}×</button></div><p class="alert-note">{{ alertNotice || (alertPermission === 'granted' ? '达标时发送系统通知 · 每轮只提醒一次' : '未开启通知权限时不会提醒') }}</p></section>
        </div>
        <section v-if="deviceId" class="chart-card"><div class="chart-title"><strong>{{ starter ? starter.name : '未分类设备数据' }}</strong><span>最近 24 小时</span></div><p v-if="!starter" class="m-muted small">当前为设备原始数据，尚未归类到酵种。</p><SeriesChart class="chart-feature" label="高度" unit=" mm" color="#2B6CB0" :points="heightPoints" :baseline="heightBaseline"/><div class="small-charts"><SeriesChart label="温度" unit="°C" color="#C04B0A" :points="tempPoints"/><SeriesChart label="湿度" unit="%" color="#2B7A55" :points="humidityPoints"/></div></section>
      <div v-if="riskAdvice" class="risk-banner" role="alert"><strong>上次风险结果：{{ lastAdvice.result.title }}</strong><RouterLink :to="lastAdvice.savedId ? `/records/${lastAdvice.savedId}` : '/reports/session'">查看结果</RouterLink></div>
      <section class="primary-actions"><RouterLink v-if="starterId" class="m-primary" :to="target('/feeding')">{{ feeding ? '再次喂养' : '记录喂养' }}</RouterLink><RouterLink v-if="feeding && starterId" class="m-secondary" :to="target('/checkin', { feeding: feeding.id, mode: 'diagnosis' })">手动诊断</RouterLink><p v-if="!starterId" class="m-muted">选择酵种后可记录喂养；当前仅展示设备原始数据。</p></section>
    </template>
  </main>
</template>

<style scoped>
.today-page{max-width:42rem;margin:auto}.chart-title{display:flex;align-items:center;justify-content:space-between;gap:.75rem}.today-heading{display:grid;gap:.5rem;margin-bottom:.75rem}.picker-row{display:flex;gap:.5rem;align-items:center}.picker{border:1px solid var(--m-border,#d8d2c8);border-radius:10px;background:var(--m-surface,#fffdf8);min-width:0}.picker-row .picker{flex:1}.picker summary{cursor:pointer;min-height:44px;display:flex;align-items:center;gap:.5rem;padding:0 .75rem}.picker-label{flex-shrink:0;font-size:.75rem;color:var(--m-muted,#625e56)}.picker-value{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.picker-menu,.starter-menu{display:grid;gap:.25rem;padding:.5rem 0}.picker-menu button,.picker-menu a,.starter-menu button{min-height:44px;padding:.5rem .75rem;border:1px solid var(--m-border,#d8d2c8);background:var(--m-surface,#fffdf8);text-align:left;font:inherit}.picker-menu a{color:var(--m-accent,#a44213)}.m-muted{font-size:.875rem;line-height:1.6;color:var(--m-muted,#625e56)}.m-muted.small{font-size:.8rem}.m-error{padding:.7rem;color:#86261f;border:1px solid #86261f}.chart-card{margin:.75rem 0;padding:.85rem;border:1px solid var(--m-border,#d8d2c8);border-radius:12px}.chart-title span{font-size:.75rem;color:var(--m-muted,#625e56)}.small-charts{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}.series-chart{min-width:0}.starter-section{padding-bottom:.25rem}.text-button{border:0;background:none;color:var(--m-accent,#a44213);min-height:44px;font:inherit}.compact-summary{min-height:44px;display:flex;align-items:center;cursor:pointer}.starter-menu button{cursor:pointer}.starter-menu button.active{border-color:var(--m-accent,#a44213);color:var(--m-accent,#a44213)}.starter-menu small{display:block;color:var(--m-muted,#625e56);font-size:.75rem}.new-starter{display:grid;gap:.5rem;margin-top:.5rem}.new-starter input{min-height:44px;padding:.5rem;font:inherit}.risk-banner{padding:.75rem;background:#fff0ed;border-left:3px solid #a12c23;color:#86261f;margin:.75rem 0;display:flex;justify-content:space-between;gap:.5rem}.risk-banner a{color:inherit;font-weight:700}.primary-actions{display:grid;gap:.5rem;margin:.75rem 0}.primary-actions>*{text-align:center}button:disabled{opacity:.55}@media(max-width:360px){.small-charts{grid-template-columns:1fr}.summary-row{grid-template-columns:1fr}}
.eyebrow{font-size:.72rem;letter-spacing:.12em;color:var(--m-accent,#a44213);font-weight:700;margin:0 0 .25rem}.picker summary::after{content:'▾';margin-left:auto;padding-left:.75rem}.picker[open] summary::after{content:'▴'}.picker-hint{margin:0 0 .5rem}.menu-action{cursor:pointer;color:var(--m-accent,#a44213)}.summary-row{display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin:.75rem 0;align-items:start}.summary-row>*{display:grid;gap:.5rem;min-width:0;padding:.75rem;border:1px solid var(--m-border,#d8d2c8);border-radius:10px;font-size:.8rem;background:var(--m-card,#fff)}.summary-row strong{font-size:.85rem}.alert-head{display:flex;align-items:center;justify-content:space-between;gap:.5rem}.alert-notify{padding:0;border:0;background:none;font:inherit;font-size:.72rem;color:var(--m-accent,#a44213);cursor:pointer;text-align:right;flex-shrink:0}.alert-notify.on{color:var(--m-muted,#6f6a61)}.alert-targets{display:flex;gap:.35rem}.alert-target{flex:1;min-height:44px;padding:0 .5rem;border:1px solid var(--m-border,#d8d2c8);border-radius:999px;background:var(--m-card,#fff);font:inherit;font-size:.85rem;color:inherit;cursor:pointer}.alert-target.active{border-color:var(--m-accent,#a44213);background:var(--m-accent,#a44213);color:#fff;font-weight:600}.alert-note{margin:0;font-size:.68rem;color:var(--m-muted,#6f6a61);line-height:1.4}.chart-card :deep(.chart-feature .series-plot),.small-charts :deep(.series-plot){position:relative;height:76px}.chart-card :deep(.chart-feature .series-plot){height:180px}.chart-card :deep(svg){display:block;width:100%;height:76px}.chart-card :deep(.chart-feature svg){height:180px}.chart-card :deep(.series-line){fill:none;stroke-width:1.5}.chart-card :deep(.chart-feature .series-line){stroke-width:2}.chart-card :deep(.series-grid){stroke:var(--m-border,#d8d2c8);stroke-width:.3}.chart-card :deep(.series-dot),.chart-card :deep(.series-hover-dot){position:absolute;width:6px;height:6px;border-radius:50%;transform:translate(-50%,-50%)}.chart-card :deep(.series-range){display:flex;justify-content:space-between;font-size:.65rem;gap:.25rem}
</style>
