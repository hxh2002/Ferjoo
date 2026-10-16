<script setup>
import { computed, onMounted, onScopeDispose, ref, watch } from 'vue';
import { useAuth } from '../../composables/useAuth.js';
import { readDraft } from '../../composables/useCheckinDraft.js';
import { useVisiblePolling } from '../../composables/useVisiblePolling.js';
import { createStarter, listCareRecords, listStarters } from '../../services/care.service.js';
import { getLatestMeasurement } from '../../services/device.service.js';
import { mobileDeviceService } from '../../services/mobile-device.service.js';
import { getStarterDeviceLink, linkStarterDevice } from '../../services/starter-device.service.js';
import { emptyCheckin, loadSessionReport, usableDeviceSample } from '../../services/mobile-diagnosis.service.js';
import { diagnoseFromForm } from '../../services/diagnosis.service.js';

defineOptions({ name: 'MobileToday' });
const auth = useAuth();
const accountId = computed(() => auth.user.value?.id || '');
const starters = ref([]);
const devices = ref([]);
const starterId = ref('');
const records = ref([]);
const link = ref(null);
const sample = ref(null);
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
const starter = computed(() => starters.value.find((item) => item.id === starterId.value));
const feeding = computed(() => records.value.find((item) => item.kind === 'feeding') || null);
const observation = computed(() => records.value.find((item) => item.kind === 'observation') || null);
const roundObservation = computed(() => {
  const session = report.value ? { input: report.value.input, occurred_at: report.value.occurredAt } : null;
  const latest = session && (!observation.value || Date.parse(session.occurred_at) >= Date.parse(observation.value.occurred_at)) ? session : observation.value;
  return latest && feeding.value && Date.parse(latest.occurred_at) >= Date.parse(feeding.value.occurred_at) ? latest : null;
});
const currentDevice = computed(() => devices.value.find((item) => item.device_id === link.value?.device_id));
const historical = computed(() => sample.value && now.value - Date.parse(sample.value.recorded_at) > 40 * 60000);
const healthySample = computed(() => link.value && usableDeviceSample(sample.value, link.value, now.value));
const baseline = computed(() => {
  if (feeding.value?.input?.baseline_source === 'device' && link.value && Date.parse(feeding.value.occurred_at) < Date.parse(link.value.active_from)) return null;
  return number(feeding.value?.input?.baseline_height_mm);
});
const expansion = computed(() => {
  const height = number(sample.value?.height_mm);
  if (!sample.value || sample.value.sensor_error || baseline.value == null || baseline.value <= 0 || height == null) return null;
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
const mainAction = computed(() => hasDraft.value ? { label: '继续本次观察', path: '/checkin' } : feeding.value ? { label: '记录观察并获取建议', path: '/checkin' } : { label: '记录这次喂养', path: '/feeding' });
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
  // A progress estimate needs a confirmed observation, not invented safety or height facts.
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
  records.value = []; link.value = null; sample.value = null; report.value = null;
  deviceError.value = ''; linkOpen.value = false; selectedDevice.value = '';
}
function selectStarter(id) {
  starterId.value = id;
  selectorOpen.value = false;
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
  report.value = session?.accountId === owner && session.starterId === starterId.value ? session : null;
  inFlight = (async () => {
    try {
      const [rows, deviceResult] = await Promise.all([
        listStarters({ userId: owner }),
        mobileDeviceService().then((service) => service.listDevices(owner)).then((value) => ({ value }), (cause) => ({ cause }))
      ]);
      const contexts = await Promise.all(rows.map(async (item) => {
        const [latest, latestFeeding, latestObservation, linked] = await Promise.all([
          listCareRecords({ userId: owner, starterId: item.id, limit: 1 }),
          listCareRecords({ userId: owner, starterId: item.id, kind: 'feeding', limit: 1 }),
          listCareRecords({ userId: owner, starterId: item.id, kind: 'observation', limit: 1 }),
          getStarterDeviceLink({ userId: owner, starterId: item.id }).then((value) => ({ value }), (cause) => ({ cause }))
        ]);
        return { ...item, latest: latest[0] || null, feeding: latestFeeding[0], observation: latestObservation[0], link: linked.value || null, linkError: linked.cause };
      }));
      if (!current()) return;
      contexts.sort((a, b) => (Date.parse(b.latest?.occurred_at) || 0) - (Date.parse(a.latest?.occurred_at) || 0));
      starters.value = contexts;
      devices.value = deviceResult.value || [];
      assigning = true;
      starterId.value = contexts.some((item) => item.id === starterId.value) ? starterId.value : contexts[0]?.id || '';
      assigning = false;
      const selected = contexts.find((item) => item.id === starterId.value);
      records.value = [selected?.feeding, selected?.observation].filter(Boolean).sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at));
      link.value = selected?.link || null;
      deviceError.value = selected?.linkError ? '设备关联读取失败；仍可手工记录，请刷新重试。' : deviceResult.cause ? '设备列表读取失败，请刷新后再管理关联。' : '';
      report.value = session?.accountId === owner && session.starterId === starterId.value ? session : null;
      sample.value = null;
      if (link.value?.device_id) {
        const activeLink = link.value;
        try {
          const latest = await getLatestMeasurement(activeLink.device_id);
          if (!current()) return;
          now.value = Date.now();
          const time = Date.parse(latest?.recorded_at);
          // Never substitute an earlier device sample belonging to another association period.
          sample.value = latest && Number.isFinite(time) && time <= now.value
            && time >= Date.parse(activeLink.active_from)
            && (!activeLink.active_to || time < Date.parse(activeLink.active_to)) ? latest : null;
          if (latest && !sample.value) deviceError.value = '最新读数不在当前关联时间段，等待关联后的新数据。';
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
  starters.value = []; devices.value = []; starterId.value = ''; clearContext();
  draft.value = emptyCheckin(); name.value = ''; error.value = ''; selectorOpen.value = false;
  if (accountId.value) void refresh();
}, { immediate: true, flush: 'sync' });
watch(starterId, () => {
  if (assigning) return;
  ++generation;
  clearContext();
  if (accountId.value && starterId.value) void refresh();
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
  selectedDevice.value = link.value?.device_id || '';
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
    <header class="today-heading"><div><p class="eyebrow">今天 · 酵种养护</p><h1>照看这份生长</h1></div><button v-if="accountId" class="m-secondary compact" :disabled="loading || saving" @click="refresh">{{ loading ? '刷新中…' : '刷新状态' }}</button></header>
    <p v-if="error" class="m-error" role="alert">{{ error }}</p>
    <p v-if="loading" class="m-muted" role="status">正在读取养护状态…</p>
    <section v-if="!accountId" class="m-card intro-card">
      <p class="eyebrow">无需设备，也能完整养护</p><h2>看清状态，知道下一步</h2>
      <p>记录喂养与观察，获取养护建议。有设备时，还能查看温湿度和高度变化。</p>
      <div class="action-list"><RouterLink class="m-primary" :to="{ path: '/login', query: { redirect: '/today' } }">登录后开始记录</RouterLink><RouterLink class="m-secondary" :to="{ path: '/register', query: { redirect: '/today' } }">邀请码注册</RouterLink></div>
    </section>
    <section v-else-if="!starters.length && !loading" class="m-card">
      <h2>添加你的第一份酵种</h2><p class="m-muted">只需要一个名字。阶段与设备关联可稍后设置，无需设备也可完整使用。</p>
      <form class="add-form" @submit.prevent="addStarter"><label class="m-field">酵种名称<input v-model="name" required maxlength="80" placeholder="例如：小橙" :disabled="saving"></label><button class="m-primary" :disabled="saving || !name.trim()">{{ saving ? '添加中…' : '添加第一份酵种' }}</button></form>
    </section>
    <template v-else-if="starter">
      <button class="starter-selector m-card" aria-haspopup="dialog" :aria-expanded="selectorOpen" @click="selectorOpen = true"><span><strong>{{ starter.name }}</strong><small>{{ link ? '已关联设备' : '手工养护模式' }} · {{ starter.latest ? `最近${starter.latest.kind === 'feeding' ? '喂养' : '观察'} ${relative(starter.latest.occurred_at)}` : '尚无记录' }}</small></span><span aria-hidden="true">⌄</span></button>
      <section class="m-card status-card" aria-labelledby="status-title">
        <div v-if="riskAdvice" class="risk-banner" role="alert"><strong>{{ lastAdvice.result.status === 'discard' ? '上次建议提示食品安全风险' : '上次观察的安全问题尚未确认' }}</strong><p>暂勿使用或品尝；设备读数不能排除食品安全风险。</p><RouterLink :to="lastAdvice.savedId ? `/records/${lastAdvice.savedId}` : '/reports/session'">查看风险建议 →</RouterLink></div>
        <div class="section-heading"><h2 id="status-title">{{ link ? '设备状态' : '手工养护模式' }}</h2><button class="text-button" :disabled="loading || saving" @click="openLink">{{ link ? '更换 / 解除关联' : '关联设备' }}</button></div>
        <p v-if="deviceError" class="warning" role="status">{{ deviceError }}</p>
        <template v-if="link">
          <p class="m-muted">{{ currentDevice?.name || link.device_id }}<span v-if="link.local_only"> · 仅本机保存关联</span></p>
          <p v-if="!sample" class="empty-reading">{{ deviceError ? '当前暂无可展示的关联读数' : '已绑定设备，等待首次数据' }}</p>
          <template v-else>
            <p v-if="sample.sensor_error" class="warning" role="alert">传感器故障，读数不可靠；不计算膨胀率或估时。</p>
            <p v-if="sample.mode === 'sleep'" class="m-muted">设备休眠 · 不显示发酵进度估时</p>
            <p class="sample-time">{{ historical ? '历史读数' : sample.mode === 'fer' && !sample.sensor_error ? '实时采样' : '设备读数' }} · 采于 {{ dateTime(sample.recorded_at) }}（{{ relative(sample.recorded_at) }}）</p>
            <div class="metric-grid" :class="{ unreliable: sample.sensor_error }">
              <div class="metric"><span>{{ expansion != null ? '膨胀率' : '高度变化' }}</span><strong>{{ expansion != null ? `${expansion.toFixed(0)}%` : sample.sensor_error ? '不可计算' : number(sample.height_delta_mm) != null ? `Δ ${number(sample.height_delta_mm) > 0 ? '+' : ''}${sample.height_delta_mm} mm` : 'Δ 未测量' }}</strong><small v-if="expansion == null && !sample.sensor_error">无可用本轮基准，不推算百分比</small><small v-else-if="expansion != null">基准 {{ baseline }} mm</small></div>
              <div class="metric" :class="{ 'high-temperature': number(sample.temperature_c) > 32 }"><span>温度</span><strong>{{ number(sample.temperature_c) != null ? `${sample.temperature_c}°C` : '未测量' }}</strong><small v-if="number(sample.temperature_c) > 32">高温警告 · 超过 32°C</small></div>
              <div class="metric secondary-metric"><span>当前高度</span><strong>{{ number(sample.height_mm) != null ? `${sample.height_mm} mm` : '未测量' }}</strong></div>
              <div v-if="number(sample.humidity_percent) != null" class="metric secondary-metric"><span>湿度</span><strong>{{ sample.humidity_percent }}%</strong></div>
            </div>
            <p class="m-muted">{{ sample.mode === 'fer' ? '发酵模式' : sample.mode === 'sleep' ? '休眠' : '模式未知' }}</p>
          </template>
          <RouterLink class="text-link" :to="target(`/devices/${encodeURIComponent(link.device_id)}/trend`, { returnTo: '/today' })">查看完整趋势 →</RouterLink>
        </template>
        <template v-else><p>无需设备也可以完整使用，手工记录喂养、观察并获取建议。</p><p v-if="observation" class="m-muted">上次观察：{{ dateTime(observation.occurred_at) }} · {{ observation.result?.title || '已记录' }}</p><p v-else class="m-muted">还没有观察记录，从这次状态开始。</p><RouterLink class="text-link" :to="target('/checkin')">记录观察 →</RouterLink></template>
      </section>
      <section class="m-card progress-card" aria-labelledby="progress-title">
        <p class="eyebrow">本轮养护</p><h2 id="progress-title">{{ feeding ? '从上次喂养开始' : '本轮尚未记录喂养' }}</h2>
        <template v-if="feeding"><p>{{ dateTime(feeding.occurred_at) }} · 比例 {{ feeding.ratio }}</p><p class="elapsed">已过 {{ Math.floor(elapsedHours) }} 小时 {{ Math.floor((elapsedHours % 1) * 60) }} 分钟</p><p v-if="timing" class="timing">{{ timing.display }}（基于 {{ timing.temp }}°C 估算）<small>经验范围，非倒计时，也不是安全保证。</small></p><p v-else class="m-muted">暂不显示剩余估时：需本轮确认的成熟阶段、实测 8–32°C 温度与未翻倍/越峰的观察。故障、休眠或历史读数不参与估时。</p><RouterLink class="text-link" :to="`/records/${feeding.id}`">查看喂养记录 →</RouterLink></template>
        <p v-else class="m-muted">记录已经发生的喂养时间，或直接记录观察；不需要先绑定设备。</p>
      </section>
      <section class="primary-actions" aria-label="下一步行动"><RouterLink class="m-primary" :to="target(mainAction.path)">{{ mainAction.label }}</RouterLink><RouterLink class="m-secondary" :to="target(feeding ? '/feeding' : mainAction.path === '/feeding' ? '/checkin' : '/feeding')">{{ feeding ? '再次喂养（新一轮）' : mainAction.path === '/feeding' ? '跳过，直接记录观察' : '记录这次喂养' }}</RouterLink><RouterLink v-if="report" class="text-link" to="/reports/session">查看这次建议 →</RouterLink></section>
      <details v-if="lastAdvice" class="m-card last-advice"><summary>上次建议 · {{ relative(lastAdvice.occurredAt) }}</summary><p>{{ lastAdvice.result.badge }}</p><h3>{{ lastAdvice.result.title }}</h3><p class="m-muted">观察时刻：{{ dateTime(lastAdvice.occurredAt) }} · {{ lastAdvice.savedId ? '已云端保存' : '本会话结果，未云端保存' }}</p><RouterLink class="text-link" :to="lastAdvice.savedId ? `/records/${lastAdvice.savedId}` : '/reports/session'">查看完整建议 →</RouterLink></details>
    </template>
    <div v-if="selectorOpen" class="sheet-backdrop" @click.self="selectorOpen = false" @keydown.esc="selectorOpen = false">
      <section class="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="starter-sheet-title" tabindex="-1"><div class="section-heading"><h2 id="starter-sheet-title">选择酵种</h2><button class="m-secondary compact" autofocus @click="selectorOpen = false">关闭</button></div><p class="m-muted">按最近喂养或观察时间排序</p><ul class="starter-list"><li v-for="item in starters" :key="item.id"><button :aria-pressed="item.id === starterId" @click="selectStarter(item.id)"><strong>{{ item.id === starterId ? '● ' : '○ ' }}{{ item.name }}</strong><small>{{ item.latest ? `最近${item.latest.kind === 'feeding' ? '喂养' : '观察'} ${relative(item.latest.occurred_at)}` : '暂无记录' }} · {{ item.link ? '已关联设备' : item.linkError ? '关联状态待刷新' : '未关联设备' }}</small></button></li></ul><form class="add-form" @submit.prevent="addStarter"><label class="m-field">添加新酵种<input v-model="name" required maxlength="80" placeholder="输入名称（1–80字符）" :disabled="saving"></label><button class="m-primary" :disabled="saving || !name.trim()">{{ saving ? '添加中…' : '添加新酵种' }}</button></form></section>
    </div>
    <div v-if="linkOpen" class="sheet-backdrop" @click.self="linkOpen = false" @keydown.esc="linkOpen = false"><section class="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="link-sheet-title" tabindex="-1"><div class="section-heading"><h2 id="link-sheet-title">为 {{ starter?.name }} 关联设备</h2><button class="m-secondary compact" autofocus @click="linkOpen = false">关闭</button></div><p class="m-muted">只展示当前关联时间段内的读数；更换设备不会混入之前的采样。关联同一设备会结束其此前的酵种关联。</p><form @submit.prevent="saveLink"><label class="m-field">选择设备<select v-model="selectedDevice" :disabled="saving"><option value="">不关联设备（手工养护）</option><option v-for="device in devices" :key="device.device_id" :value="device.device_id">{{ device.name || device.device_id }}</option></select></label><button class="m-primary" :disabled="saving || loading">{{ saving ? '保存中…' : '保存关联' }}</button></form><RouterLink class="text-link" to="/me/devices">绑定或管理设备 →</RouterLink></section></div>
  </main>
</template>

<style scoped>
.today-page{max-width:42rem;margin:auto;padding:1.25rem 1rem calc(var(--m-tab-height,64px) + 2rem + env(safe-area-inset-bottom));color:var(--m-text,#292923)}
.today-heading,.section-heading{display:flex;align-items:center;justify-content:space-between;gap:1rem}.today-heading{margin:.5rem 0 1.5rem}.today-heading h1{font-size:1.65rem;margin:.4rem 0}.eyebrow{font-size:.75rem;letter-spacing:.12em;color:var(--m-accent,#a44213);font-weight:700;margin:0 0 .5rem}.m-card{margin:1rem 0;padding:1.25rem;background:var(--m-surface,#fffdf8);border:1px solid var(--m-border,#d8d2c8)}h2{font-size:1.15rem;margin:0 0 .6rem}h3{font-size:1rem}.section-heading h2{margin:0}.m-muted,.sample-time{font-size:.875rem;line-height:1.65;color:var(--m-muted,#625e56)}.m-error,.risk-banner{color:#86261f}.m-error{padding:.75rem;border:1px solid #86261f}.warning{color:#8c450d;background:#fff1d6;padding:.75rem;line-height:1.6}.risk-banner{padding:1rem;background:#fff0ed;border-left:4px solid #a12c23;margin:-1.25rem -1.25rem 1.25rem}.risk-banner p{font-size:.875rem}.risk-banner a{color:inherit;font-weight:700}.starter-selector{display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;cursor:pointer;font:inherit;border-left:4px solid var(--m-accent,#a44213)}.starter-selector strong{font-size:1.4rem}.starter-selector small,.starter-list small{display:block;color:var(--m-muted,#625e56);font-size:.8rem;margin-top:.4rem}.metric-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin:1.25rem 0}.metric{display:flex;flex-direction:column;gap:.4rem;min-width:0}.metric span,.metric small{font-size:.8rem;color:var(--m-muted,#625e56)}.metric strong{font-size:clamp(1.3rem,5vw,2rem);font-weight:600}.secondary-metric strong{font-size:1.1rem}.high-temperature strong,.high-temperature small{color:#a12c23}.unreliable .metric{opacity:.55}.elapsed{font-size:1.5rem}.timing{color:#52603b;font-weight:600}.timing small{display:block;font-size:.75rem;font-weight:400;margin-top:.5rem}.m-primary,.m-secondary{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:.65rem 1rem;font:inherit;text-decoration:none;box-sizing:border-box;border-radius:0;cursor:pointer}.m-primary{background:var(--m-accent,#a44213);color:#fff;border:1px solid var(--m-accent,#a44213)}.m-secondary{border:1px solid var(--m-border,#938d83);background:transparent;color:inherit}.compact{font-size:.8rem;padding:.4rem .65rem;flex-shrink:0}.text-link,.text-button{display:inline-flex;align-items:center;min-height:44px;color:var(--m-accent,#a44213);font:inherit;font-size:.875rem}.text-button{border:0;background:transparent;padding:0;cursor:pointer}.primary-actions,.action-list{display:grid;gap:.75rem;margin:1.5rem 0}.primary-actions .text-link{justify-content:center}.last-advice summary{cursor:pointer;min-height:44px;display:list-item;align-content:center;font-weight:600}.m-field{display:grid;gap:.5rem;margin:1rem 0;font-size:.875rem}.m-field input,.m-field select{width:100%;box-sizing:border-box;min-height:48px;padding:.75rem;font:inherit;border:1px solid #938d83;border-radius:0;background:#fff}.add-form>.m-primary{width:100%}.sheet-backdrop{position:fixed;inset:0;background:#191b1866;z-index:100;display:flex;align-items:flex-end;justify-content:center}.bottom-sheet{width:100%;max-width:42rem;box-sizing:border-box;max-height:85dvh;overflow:auto;padding:1.25rem 1.25rem calc(1.5rem + env(safe-area-inset-bottom));background:var(--m-surface,#fffdf8);border-top:3px solid var(--m-accent,#a44213)}.starter-list{list-style:none;margin:0;padding:0}.starter-list button{width:100%;min-height:72px;padding:.75rem;text-align:left;background:transparent;border:0;border-bottom:1px solid #d8d2c8;font:inherit;cursor:pointer}.starter-list button[aria-pressed=true]{background:#f3eee3;border-left:3px solid var(--m-accent,#a44213)}button:disabled{opacity:.55;cursor:wait}:focus-visible{outline:3px solid #52603b;outline-offset:3px}@media(max-width:360px){.today-page{padding-inline:.75rem}.m-card{padding:1rem}.today-heading h1{font-size:1.4rem}.section-heading{flex-wrap:wrap}.risk-banner{margin:-1rem -1rem 1rem}}
</style>
