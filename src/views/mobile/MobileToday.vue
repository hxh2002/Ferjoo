<script setup>
import { computed, onMounted, onScopeDispose, ref, watch } from 'vue';
import { useAuth } from '../../composables/useAuth.js';
import { readDraft } from '../../composables/useCheckinDraft.js';
import { useVisiblePolling } from '../../composables/useVisiblePolling.js';
import { createStarter, listCareRecords, listStarters } from '../../services/care.service.js';
import { getLatestMeasurement } from '../../services/device.service.js';
import { mobileDeviceService } from '../../services/mobile-device.service.js';
import { getStarterDeviceLink, linkStarterDevice, listStarterDeviceLinks } from '../../services/starter-device.service.js';
import { emptyCheckin, loadSessionReport, usableDeviceSample } from '../../services/mobile-diagnosis.service.js';
import { diagnoseFromForm } from '../../services/diagnosis.service.js';

defineOptions({ name: 'MobileToday' });
const auth = useAuth();
const accountId = computed(() => auth.user.value?.id || '');
const deviceId = ref('');
const rawSample = ref(null);
const devices = ref([]);
const starters = ref([]);
const starterId = ref('');
const records = ref([]);
const link = ref(null);
const report = ref(null);
const draft = ref(emptyCheckin());
const now = ref(Date.now());
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const deviceError = ref('');
const selectorOpen = ref(false);
const linkOpen = ref(false);
const selectedDevice = ref('');
const name = ref('');
let generation = 0;
let disposed = false;
let inFlight = null;
let pending = false;
let assigning = false;

const categories = computed(() => {
  if (!deviceId.value) return starters.value;
  return starters.value.filter((item) => item.link?.device_id === deviceId.value);
});
const starter = computed(() => starters.value.find((item) => item.id === starterId.value));
const activeDevice = computed(() => devices.value.find((item) => item.device_id === deviceId.value));
const feeding = computed(() => records.value.find((item) => item.kind === 'feeding') || null);
const observation = computed(() => records.value.find((item) => item.kind === 'observation') || null);
const roundObservation = computed(() => {
  const session = report.value ? { input: report.value.input, occurred_at: report.value.occurredAt } : null;
  const latest = session && (!observation.value || Date.parse(session.occurred_at) >= Date.parse(observation.value.occurred_at)) ? session : observation.value;
  return latest && feeding.value && Date.parse(latest.occurred_at) >= Date.parse(feeding.value.occurred_at) ? latest : null;
});
const sample = ref(null);
const currentDevice = computed(() => devices.value.find((item) => item.device_id === link.value?.device_id));
const healthySample = computed(() => link.value && usableDeviceSample(sample.value, link.value, now.value));
const historical = computed(() => sample.value && now.value - Date.parse(sample.value.recorded_at) > 40 * 60000);
const baseline = computed(() => {
  if (feeding.value?.input?.baseline_source === 'device' && link.value && Date.parse(feeding.value.occurred_at) < Date.parse(link.value.active_from)) return null;
  return number(feeding.value?.input?.baseline_height_mm);
});
const expansion = computed(() => {
  const height = number(sample.value?.height_mm);
  if (!healthySample.value || baseline.value == null || baseline.value <= 0 || height == null) return null;
  if (Date.parse(sample.value.recorded_at) < Date.parse(feeding.value.occurred_at)) return null;
  return (height - baseline.value) / baseline.value * 100;
});
const lastAdvice = computed(() => {
  const saved = observation.value?.result?.title ? { result: observation.value.result, input: observation.value.input, occurredAt: observation.value.occurred_at, savedId: observation.value.id } : null;
  if (report.value && (!saved || Date.parse(report.value.occurredAt) >= Date.parse(saved.occurredAt))) return report.value;
  return saved;
});
const riskAdvice = computed(() => lastAdvice.value && ['discard', 'needs-check'].includes(lastAdvice.value.result?.status));
const hasDraft = computed(() => draft.value.starterId === starterId.value && Object.entries(draft.value).some(([key, value]) => !['starterId', 'step', 'sources'].includes(key) && value !== '' && value != null));
const mainAction = computed(() => hasDraft.value ? { label: '继续本次观察', path: '/checkin' } : { label: '记录观察', path: '/checkin' });
const elapsedHours = computed(() => feeding.value ? Math.max(0, (now.value - Date.parse(feeding.value.occurred_at)) / 3600000) : null);
const timing = computed(() => {
  if (!feeding.value || riskAdvice.value) return null;
  const facts = roundObservation.value?.input || {};
  const stage = facts.stage || feeding.value.input?.stage;
  const height = facts.height;
  const manualTemp = /设备/.test(facts.sources?.tempC || '') ? null : number(facts.tempC);
  const temp = healthySample.value ? number(sample.value.temperature_c) ?? manualTemp : !link.value && !deviceError.value ? manualTemp : null;
  if (stage !== 'mature' || temp == null || temp < 8 || temp > 32 || elapsedHours.value == null || !Number.isFinite(elapsedHours.value)) return null;
  if (link.value && !healthySample.value) return null;
  if (['double', 'peak_plus', 'over3', 'fallen'].includes(height) || expansion.value >= 100) return null;
  if (facts.color !== 'normal' || facts.smell !== 'normal' || !height || height === 'unknown') return null;
  const result = diagnoseFromForm({ ...facts, stage, ratio: feeding.value.ratio, tempC: temp, elapsedHours: elapsedHours.value });
  return result.timing?.status === 'remaining' ? { display: result.timing.display, temp } : null;
});

function number(value) {
  if (value == null || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}
function relative(value) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '暂无记录';
  const minutes = Math.max(0, Math.floor((now.value - time) / 60000));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}小时前`;
  return `${Math.floor(minutes / 1440)}天前`;
}
function dateTime(value) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '暂无记录'; }
function target(path, extra = {}) { return { path, query: { starter: starterId.value, ...extra } }; }
function clearContext() {
  records.value = []; link.value = null; report.value = null;
  deviceError.value = ''; linkOpen.value = false; selectedDevice.value = '';
}
function selectDevice(id) {
  if (id === deviceId.value) return;
  deviceId.value = id;
  rawSample.value = null;
  sample.value = null;
  starterId.value = '';
  clearContext();
}
function selectStarter(id) {
  sample.value = null;
  link.value = null;
  records.value = [];
  report.value = null;
  if (!id) { starterId.value = ''; return; }
  const item = starters.value.find((entry) => entry.id === id);
  if (!item) { starterId.value = ''; return; }
  const itemDevice = item.link?.device_id || '';
  if (itemDevice && deviceId.value && itemDevice !== deviceId.value) { starterId.value = ''; return; }
  if (itemDevice && !deviceId.value) { assigning = true; deviceId.value = itemDevice; rawSample.value = null; assigning = false; }
  starterId.value = id;
}
async function refresh() {
  if (disposed || !accountId.value) return;
  if (inFlight || saving.value) { pending = true; return inFlight; }
  const owner = accountId.value;
  const token = generation;
  const current = () => !disposed && token === generation && owner === accountId.value;
  loading.value = true;
  error.value = '';
  now.value = Date.now();
  draft.value = readDraft(owner, 'checkin', emptyCheckin());
  const session = loadSessionReport(owner);
  inFlight = (async () => {
    try {
      const [starterResult, deviceResult, linkResult] = await Promise.all([
        listStarters({ userId: owner }).then((value) => ({ value }), (cause) => ({ cause })),
        mobileDeviceService().then((service) => service.listDevices(owner)).then((value) => ({ value }), (cause) => ({ cause })),
        (typeof listStarterDeviceLinks === 'function' ? listStarterDeviceLinks({ userId: owner }) : Promise.resolve([])).then((value) => ({ value }), (cause) => ({ cause }))
      ]);
      const rows = starterResult.value || [];
      if (starterResult.cause) error.value = '分类读取失败，设备数据仍可展示。';
      if (!current()) return;
      const allLinks = linkResult.value || [];
      const linkByStarter = new Map();
      for (const row of allLinks) {
        if (row.active_to == null && !linkByStarter.has(row.starter_id)) linkByStarter.set(row.starter_id, row);
      }
      const contexts = await Promise.all(rows.map(async (item) => {
        const [latest, latestFeeding, latestObservation, linked] = await Promise.all([
          listCareRecords({ userId: owner, starterId: item.id, limit: 1 }),
          listCareRecords({ userId: owner, starterId: item.id, kind: 'feeding', limit: 1 }),
          listCareRecords({ userId: owner, starterId: item.id, kind: 'observation', limit: 1 }),
          getStarterDeviceLink({ userId: owner, starterId: item.id }).then((value) => ({ value }), (cause) => ({ cause }))
        ]);
        return { ...item, latest: latest[0] || null, feeding: latestFeeding[0], observation: latestObservation[0], link: linkByStarter.get(item.id) || linked.value || null, linkError: linked.cause };
      }));
      if (!current()) return;
      contexts.sort((a, b) => (Date.parse(b.latest?.occurred_at) || 0) - (Date.parse(a.latest?.occurred_at) || 0));
      starters.value = contexts;
      devices.value = deviceResult.value || [];
      if (linkResult.cause) error.value = '分类读取失败，设备数据仍可展示。';
      else if (contexts.some((item) => item.linkError)) deviceError.value = '设备关联读取失败；仍可手工记录，请刷新重试。';
      if (deviceResult.cause) deviceError.value = '设备列表读取失败，请刷新后再管理关联。';
      assigning = true;
      deviceId.value = devices.value.some((item) => item.device_id === deviceId.value) ? deviceId.value : devices.value[0]?.device_id || '';
      const validStarter = contexts.find((item) => item.id === starterId.value);
      if (!validStarter) {
        const linked = contexts.find((item) => item.link?.device_id === deviceId.value);
        starterId.value = linked?.id || '';
      } else if (deviceId.value && validStarter.link?.device_id && validStarter.link.device_id !== deviceId.value) {
        starterId.value = '';
      }
      assigning = false;
      report.value = session?.accountId === owner && session.starterId === starterId.value ? session : null;
      const selected = contexts.find((item) => item.id === starterId.value);
      records.value = [selected?.feeding, selected?.observation].filter(Boolean).sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));
      link.value = selected?.link || null;
      if (!selected?.linkError && !deviceResult.cause && !linkResult.cause) deviceError.value = '';
      sample.value = null;
      rawSample.value = null;
      if (deviceId.value) {
        const activeDevice = deviceId.value;
        try {
          const latest = await getLatestMeasurement(activeDevice);
          if (!current()) return;
          now.value = Date.now();
          const time = Date.parse(latest?.recorded_at);
          rawSample.value = latest && Number.isFinite(time) && time <= now.value ? latest : null;
          if (latest && !rawSample.value) deviceError.value = '设备读数时间异常，等待新的采样。';
          if (link.value && rawSample.value) {
            const sampleTime = Date.parse(rawSample.value.recorded_at);
            if (sampleTime >= Date.parse(link.value.active_from) && (!link.value.active_to || sampleTime < Date.parse(link.value.active_to))) {
              sample.value = rawSample.value;
            } else {
              deviceError.value = '最新读数不在当前关联时间段，等待关联后的新数据。';
            }
          }
        } catch (cause) {
          if (current()) deviceError.value = cause?.message || '设备状态读取失败，请刷新重试。';
        }
      }
    } catch (cause) {
      if (current()) error.value = cause?.message || '读取失败，请稍后重试。';
    }
  })();
  try { await inFlight; }
  finally {
    inFlight = null;
    loading.value = false;
    if (pending && !disposed) { pending = false; void refresh(); }
  }
}
watch(accountId, () => {
  ++generation;
  deviceId.value = ''; rawSample.value = null; sample.value = null; devices.value = []; starters.value = []; starterId.value = ''; clearContext();
  draft.value = emptyCheckin(); name.value = ''; error.value = ''; selectorOpen.value = false;
  if (accountId.value) void refresh();
}, { immediate: true, flush: 'sync' });
watch(deviceId, (value) => {
  if (assigning) return;
  ++generation;
  rawSample.value = null;
  sample.value = null;
  const linked = starters.value.find((item) => item.link?.device_id === value);
  starterId.value = linked?.id || '';
  clearContext();
  if (accountId.value && value) void refresh();
}, { flush: 'sync' });
watch(starterId, () => {
  if (assigning) return;
  ++generation;
  clearContext();
  if (accountId.value) void refresh();
}, { flush: 'sync' });
async function addStarter() {
  if (saving.value || !accountId.value || !name.value.trim()) return;
  const owner = accountId.value;
  const token = generation;
  saving.value = true; error.value = '';
  try {
    const created = await createStarter(name.value.trim());
    if (disposed || token !== generation || owner !== accountId.value) return;
    starters.value.unshift(created);
    name.value = '';
    selectStarter(created.id);
    pending = true;
  } catch (cause) {
    if (token === generation && owner === accountId.value) error.value = cause?.message || '添加失败，请稍后重试。';
  } finally { saving.value = false; if (pending) { pending = false; void refresh(); } }
}
function openLink() {
  selectedDevice.value = link.value?.device_id || deviceId.value || '';
  linkOpen.value = true;
}
async function saveLink() {
  if (saving.value || loading.value || !accountId.value || !starterId.value) return;
  const owner = accountId.value;
  const id = starterId.value;
  const token = ++generation;
  saving.value = true; error.value = '';
  try {
    await linkStarterDevice({ userId: owner, starterId: id, deviceId: selectedDevice.value || null });
    if (disposed || token !== generation || owner !== accountId.value) return;
    clearContext();
    pending = true;
  } catch (cause) {
    if (token === generation && owner === accountId.value) error.value = cause?.message || '关联未完成，请重试。';
  } finally { saving.value = false; if (pending) { pending = false; void refresh(); } }
}
useVisiblePolling(refresh, 60000);
onMounted(() => auth.init());
onScopeDispose(() => { disposed = true; ++generation; });
</script>

<template>
  <main class="m-page today-page">
    <header class="today-heading"><div><p class="eyebrow">今天 · 发酵监测</p><h1>{{ activeDevice ? activeDevice.name || activeDevice.device_id : '设备总览' }}</h1></div><button v-if="accountId" class="m-secondary compact" :disabled="loading || saving" @click="refresh">{{ loading ? '刷新中…' : '刷新' }}</button></header>
    <p v-if="error" class="m-error" role="alert">{{ error }}</p>
    <p v-if="loading" class="m-muted" role="status">正在读取…</p>
    <section v-if="!accountId" class="m-card intro-card">
      <p class="eyebrow">无需设备，也能完整记录</p><h2>看清状态，知道下一步</h2>
      <p>记录喂养与观察，获取养护建议。有设备时，还能查看温湿度和高度变化。</p>
      <div class="action-list"><RouterLink class="m-primary" :to="{ path: '/login', query: { redirect: '/today' } }">登录后开始记录</RouterLink><RouterLink class="m-secondary" :to="{ path: '/register', query: { redirect: '/today' } }">邀请码注册</RouterLink></div>
    </section>
    <template v-else>
      <section class="m-card device-card" aria-labelledby="device-title">
        <div class="section-heading"><h2 id="device-title">设备</h2><RouterLink v-if="devices.length" class="text-button" to="/me/devices">管理</RouterLink></div>
        <template v-if="devices.length">
          <div class="device-tabs" role="group" aria-label="选择设备">
            <button v-for="item in devices" :key="item.device_id" class="device-tab" :class="{ active: item.device_id === deviceId }" type="button" @click="selectDevice(item.device_id)">{{ item.name || item.device_id }}</button>
          </div>
          <p v-if="deviceError" class="warning" role="status">{{ deviceError }}</p>
          <template v-if="rawSample">
            <p v-if="rawSample.sensor_error" class="warning" role="alert">传感器故障，读数不可靠；不计算膨胀率或估时。</p>
            <p class="sample-time">{{ historical ? '历史读数' : rawSample.mode === 'fer' && !rawSample.sensor_error ? '实时采样' : '设备读数' }} · {{ relative(rawSample.recorded_at) }}</p>
            <div class="metric-grid" :class="{ unreliable: rawSample.sensor_error }">
              <div class="metric"><span>{{ link && expansion != null ? '膨胀率' : '高度' }}</span><strong>{{ link && expansion != null ? `${expansion.toFixed(0)}%` : number(rawSample.height_mm) != null ? `${rawSample.height_mm} mm` : '未测量' }}</strong><small v-if="link && expansion != null">基准 {{ baseline }} mm</small><small v-else-if="link && expansion == null && !rawSample.sensor_error">高度变化 · 原始读数</small></div>
              <div class="metric" :class="{ 'high-temperature': number(rawSample.temperature_c) > 32 }"><span>温度</span><strong>{{ number(rawSample.temperature_c) != null ? `${rawSample.temperature_c}°C` : '未测量' }}</strong><small v-if="number(rawSample.temperature_c) > 32">高温警告</small></div>
              <div v-if="number(rawSample.humidity_percent) != null" class="metric secondary-metric"><span>湿度</span><strong>{{ rawSample.humidity_percent }}%</strong></div>
            </div>
            <p v-if="rawSample.mode === 'sleep'" class="m-muted">设备休眠 · 不显示发酵进度估时</p>
            <RouterLink class="text-link" :to="`/devices/${encodeURIComponent(deviceId)}/trend`">查看完整趋势 →</RouterLink>
          </template>
          <p v-else class="empty-reading">{{ deviceError ? '当前暂无可展示的读数' : '已绑定设备，等待首次数据' }}</p>
        </template>
        <p v-else class="m-muted">暂无设备。无需设备也可手工记录喂养与观察。</p>
      </section>
      <section class="classification-card" aria-labelledby="classification-title">
        <div class="section-heading"><h2 id="classification-title">分类</h2><button v-if="starterId" class="text-button" :disabled="loading || saving" @click="openLink">{{ link ? '更换关联' : '关联设备' }}</button></div>
        <div v-if="riskAdvice" class="risk-banner" role="alert"><strong>{{ lastAdvice.result.status === 'discard' ? '上次建议提示食品安全风险' : '上次观察的安全问题尚未确认' }}</strong><RouterLink :to="lastAdvice.savedId ? `/records/${lastAdvice.savedId}` : '/reports/session'">查看风险建议 →</RouterLink></div>
        <div class="category-list" role="group" aria-label="选择分类">
          <button v-if="deviceId" class="category-chip" :class="{ active: !starterId }" type="button" @click="selectStarter('')">未分类</button>
          <button v-for="item in categories" :key="item.id" class="category-chip" :class="{ active: item.id === starterId }" type="button" @click="selectStarter(item.id)">{{ item.name }}<small v-if="item.latest"> · {{ relative(item.latest.occurred_at) }}</small></button>
          <button class="category-chip add" type="button" @click="selectorOpen = true">+ 添加酵种</button>
        </div>
        <p v-if="!link && !deviceError" class="m-muted small">手工养护模式 · 设备读数不作为分类证据</p>
        <template v-if="starterId && starter">
          <div class="round-summary">
            <p v-if="feeding"><strong>{{ Math.floor(elapsedHours) }}h {{ Math.floor((elapsedHours % 1) * 60) }}m</strong> · 比例 {{ feeding.ratio }}</p>
            <p v-else class="m-muted">本轮尚未记录喂养</p>
            <p v-if="timing" class="timing">{{ timing.display }}（{{ timing.temp }}°C）</p>
          </div>
        </template>
      </section>
      <section class="primary-actions" aria-label="下一步行动">
        <RouterLink class="m-primary" :to="target(mainAction.path)">{{ mainAction.label }}</RouterLink>
        <RouterLink class="m-secondary" :to="target('/feeding')">{{ feeding ? '再次喂养（新一轮）' : '记录喂养' }}</RouterLink>
        <RouterLink v-if="report" class="text-link" to="/reports/session">查看这次建议 →</RouterLink>
      </section>
      <details v-if="lastAdvice" class="m-card last-advice"><summary>上次建议 · {{ relative(lastAdvice.occurredAt) }}</summary><p>{{ lastAdvice.result.badge }}</p><h3>{{ lastAdvice.result.title }}</h3><RouterLink class="text-link" :to="lastAdvice.savedId ? `/records/${lastAdvice.savedId}` : '/reports/session'">查看完整建议 →</RouterLink></details>
    </template>
    <div v-if="selectorOpen" class="sheet-backdrop" @click.self="selectorOpen = false" @keydown.esc="selectorOpen = false">
      <section class="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="starter-sheet-title" tabindex="-1"><div class="section-heading"><h2 id="starter-sheet-title">选择酵种</h2><button class="m-secondary compact" autofocus @click="selectorOpen = false">关闭</button></div><p class="m-muted">按最近喂养或观察时间排序</p><ul class="starter-list"><li v-for="item in starters" :key="item.id"><button :aria-pressed="item.id === starterId" @click="selectStarter(item.id); selectorOpen = false"><strong>{{ item.name }}</strong><small>{{ item.latest ? `最近${item.latest.kind === 'feeding' ? '喂养' : '观察'} ${relative(item.latest.occurred_at)}` : '暂无记录' }} · {{ item.link ? '已关联设备' : '未关联设备' }}</small></button></li></ul><form class="add-form" @submit.prevent="addStarter"><label class="m-field">添加新酵种<input v-model="name" required maxlength="80" placeholder="输入名称（1–80字符）" :disabled="saving"></label><button class="m-primary" :disabled="saving || !name.trim()">{{ saving ? '添加中…' : '添加新酵种' }}</button></form></section>
    </div>
    <div v-if="linkOpen" class="sheet-backdrop" @click.self="linkOpen = false" @keydown.esc="linkOpen = false"><section class="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="link-sheet-title" tabindex="-1"><div class="section-heading"><h2 id="link-sheet-title">为 {{ starter?.name }} 关联设备</h2><button class="m-secondary compact" autofocus @click="linkOpen = false">关闭</button></div><p class="m-muted">只展示当前关联时间段内的读数；更换设备不会混入之前的采样。</p><form @submit.prevent="saveLink"><label class="m-field">选择设备<select v-model="selectedDevice" :disabled="saving"><option value="">不关联设备（手工养护）</option><option v-for="item in devices" :key="item.device_id" :value="item.device_id">{{ item.name || item.device_id }}</option></select></label><button class="m-primary" :disabled="saving || loading">{{ saving ? '保存中…' : '保存关联' }}</button></form><RouterLink class="text-link" to="/me/devices">绑定或管理设备 →</RouterLink></section></div>
  </main>
</template>

<style scoped>
.today-page{max-width:42rem;margin:auto;color:var(--m-text,#292923)}
.today-heading,.section-heading{display:flex;align-items:center;justify-content:space-between;gap:.75rem}.today-heading{margin:0 0 .75rem}.today-heading h1{font-size:1.5rem;margin:.25rem 0;font-weight:600}.eyebrow{font-size:.72rem;letter-spacing:.12em;color:var(--m-accent,#a44213);font-weight:700;margin:0 0 .25rem}h2{font-size:1.05rem;margin:0;font-weight:600}.today-page .section-heading h2{margin-bottom:0}.m-muted,.sample-time{font-size:.875rem;line-height:1.6;color:var(--m-muted,#625e56)}.m-muted.small{font-size:.8rem;margin:.25rem 0 .5rem}.m-error,.risk-banner{color:#86261f}.m-error{padding:.75rem;border:1px solid #86261f}.warning{color:#8c450d;background:#fff1d6;padding:.625rem .75rem;line-height:1.6;font-size:.875rem}.risk-banner{padding:.75rem;background:#fff0ed;border-left:3px solid #a12c23;margin:.5rem 0}.risk-banner a{color:inherit;font-weight:700;font-size:.875rem}
.device-tabs{display:flex;gap:.5rem;flex-wrap:wrap;margin:.5rem 0}.device-tab{min-height:44px;padding:.4rem .9rem;border:1px solid var(--m-border,#938d83);background:transparent;font:inherit;font-size:.9rem;cursor:pointer}.device-tab.active{border-color:var(--m-accent,#a44213);color:var(--m-accent,#a44213);font-weight:600;background:#fdf3ec}
.sample-time{font-size:.8rem;line-height:1.4;margin:.25rem 0 .5rem}.metric-grid{display:flex;gap:1.5rem;margin:.5rem 0;flex-wrap:wrap}.metric{display:flex;flex-direction:column;gap:.15rem;min-width:0}.metric span{font-size:.75rem;color:var(--m-muted,#625e56)}.metric strong{font-size:clamp(1.4rem,6vw,1.9rem);font-weight:600;line-height:1.2}.metric small{font-size:.72rem;color:var(--m-muted,#625e56)}.secondary-metric strong{font-size:1.05rem}.high-temperature strong,.high-temperature small{color:#a12c23}.unreliable .metric{opacity:.55}.empty-reading{color:var(--m-muted,#625e56);font-size:.9rem}
.classification-card{margin:.75rem 0;padding:.5rem 0;border-block:1px solid var(--m-border,#d8d2c8)}.category-list{display:flex;gap:.5rem;flex-wrap:wrap;margin:.25rem 0 .5rem}.category-chip{min-height:44px;padding:.35rem .85rem;border:1px solid var(--m-border,#938d83);background:transparent;font:inherit;font-size:.875rem;cursor:pointer}.category-chip.active{border-color:var(--m-accent,#a44213);color:var(--m-accent,#a44213);font-weight:600;background:#fdf3ec}.category-chip.add{border-style:dashed;color:var(--m-muted,#625e56)}.category-chip small{font-size:.75rem;color:var(--m-muted,#625e56);font-weight:400}
.round-summary{margin-top:.25rem;padding-top:.25rem;border-top:1px solid var(--m-border,#d8d2c8)}.round-summary p{margin:.25rem 0;font-size:.9rem}.timing{color:#52603b;font-weight:600}
.compact{font-size:.8rem;padding:.4rem .65rem;flex-shrink:0}.text-link,.text-button{display:inline-flex;align-items:center;min-height:44px;color:var(--m-accent,#a44213);font:inherit;font-size:.875rem}.text-button{border:0;background:transparent;padding:0;cursor:pointer}.primary-actions,.action-list{display:grid;gap:.5rem;margin:.75rem 0}.primary-actions{grid-template-columns:repeat(2,minmax(0,1fr))}.primary-actions>:not(.text-link){text-align:center}.primary-actions .text-link{grid-column:1 / -1;justify-content:center}.last-advice summary{cursor:pointer;min-height:44px;display:list-item;align-content:center;font-weight:600}.add-form>.m-primary{width:100%}.sheet-backdrop{position:fixed;inset:0;background:#191b1866;z-index:100;display:flex;align-items:flex-end;justify-content:center}.bottom-sheet{width:100%;max-width:42rem;box-sizing:border-box;max-height:85dvh;overflow:auto;padding:1.25rem 1.25rem calc(1.5rem + env(safe-area-inset-bottom));background:var(--m-surface,#fffdf8);border-top:3px solid var(--m-accent,#a44213)}.starter-list{list-style:none;margin:0;padding:0}.starter-list button{width:100%;min-height:64px;padding:.75rem;text-align:left;background:transparent;border:0;border-bottom:1px solid #d8d2c8;font:inherit;cursor:pointer}.starter-list button[aria-pressed=true]{background:#f3eee3;border-left:3px solid var(--m-accent,#a44213)}button:disabled{opacity:.55;cursor:wait}:focus-visible{outline:3px solid #52603b;outline-offset:3px}
@media(max-width:360px){.today-heading h1{font-size:1.3rem}.section-heading{flex-wrap:wrap}}
</style>
