<script setup>
import { computed, onMounted, onScopeDispose, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { useVisiblePolling } from '../../composables/useVisiblePolling.js';
import { archiveStarter, createStarter, listCareRecords, listStarters } from '../../services/care.service.js';
import MConfirmDialog from '../../components/mobile/MConfirmDialog.vue';
import MToast from '../../components/mobile/MToast.vue';
import { listMeasurementsRange } from '../../services/device.service.js';
import { mobileDeviceService } from '../../services/mobile-device.service.js';
import { listStarterDeviceLinks } from '../../services/starter-device.service.js';
import { clipWindows, filterRowsByWindows } from '../../lib/starter-link-windows.js';
import { roundDeviceWindows } from '../../lib/round-device-attribution.js';
import { LOCAL_LINK_NOTICE } from '../../lib/link-change.js';
import { loadFeedingEvidence, summarizeFeedingMeasurements } from '../../services/feeding-analysis.service.js';
import { closeFeedingWindow, loadWindowClosure } from '../../services/fermentation-window.service.js';
import { loadSessionReport } from '../../services/mobile-diagnosis.service.js';
import { rememberSelectedStarter } from '../../lib/mobile-selection.js';
import { feedingEvidenceCacheKey, roundState } from '../../lib/mobile-records.js';
import { READ_TTL, cachedRead, invalidateReadCache } from '../../lib/read-cache.js';

import { guestLoginTarget, guestRegisterTarget, isAuthPending } from '../../lib/mobile-guest.js';
import MGuestNotice from '../../components/mobile/MGuestNotice.vue';
import MStarterJar from '../../components/mobile/MStarterJar.vue';
import { JAR_MOOD_LABELS, jarLevel as levelFor, jarMoodFor } from '../../components/mobile/MStarterJar.js';

import iconThermometer from '../../assets/device/icon-thermometer.svg';
import iconDrop from '../../assets/device/icon-drop.svg';
import iconChartUp from '../../assets/device/icon-chart-up.svg';
import iconScales from '../../assets/device/icon-scales.svg';
import iconTimer from '../../assets/device/icon-timer.svg';
import iconChevron from '../../assets/device/icon-chevron-down.svg';
// 与日记页「酵种医生 ›」同一个右向箭头，两处文字入口的箭头形状与间距保持一致。
import iconChevronRight from '../../assets/icons/diary-chevron.svg';
import iconJar from '../../assets/device/icon-jar.svg';

defineOptions({ name: 'MobileDeviceHome' });
const auth = useAuth();
const route = useRoute();
const accountId = computed(() => auth.user.value?.id || '');
const devices = ref([]); const starters = ref([]); const measurements = ref([]);
const deviceId = ref(''); const starterId = ref(''); const records = ref([]); const link = ref(null); const previousFeeding = ref(null);
const loading = ref(false); const saving = ref(false); const error = ref(''); const deviceError = ref('');
const starterOpen = ref(false); const newStarterOpen = ref(false); const contextOpen = ref(false);
const newName = ref(''); const now = ref(Date.now()); const explicitStarter = ref(false);
const evidence = ref(null); const mutationError = ref(''); const allLinks = ref([]);
const nextFeedingAt = ref(null); const closure = ref(null);
const closing = ref(false); const closeError = ref('');
const confirmOpen = ref(false); const toast = ref(''); const starterPendingDelete = ref(null);
let generation = 0; let disposed = false; let inFlight = null; let pending = false; let mutationGeneration = 0;
// 与 feeding-analysis 的新鲜度窗口保持一致，仅用于「数据是否还新鲜」的提示。
const FRESH_MS = 40 * 60000;
// 迁移未执行时关联只存在于本机浏览器：明确告知，避免用户以为已经同步到云端。
const localLinkNotice = computed(() => allLinks.value.some((row) => row.local_only) ? LOCAL_LINK_NOTICE : '');
const activeDevice = computed(() => devices.value.find((item) => item.device_id === deviceId.value));
const starter = computed(() => starters.value.find((item) => item.id === starterId.value));
const feeding = computed(() => records.value.find((item) => item.kind === 'feeding') || null);
const roundWindows = computed(() => roundDeviceWindows(allLinks.value, {
  feeding: feeding.value,
  // 每个酵种最新一次喂养足以决定它当前是否接管某台共享设备。
  feedings: starters.value.map((item) => item.feeding).filter(Boolean),
  nextFeedingAt: nextFeedingAt.value,
  windowEndedAt: closure.value?.ended_at,
  now: now.value
}));
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
  // 轮次归属取该酵种的全部历史关联（含已关闭窗口）；当前活跃关联只用于下方「实时」展示。
  link: link.value,
  links: allLinks.value.filter((row) => row.starter_id === starterId.value),
  now: now.value,
  nextFeedingAt: nextFeedingAt.value,
  windowEndedAt: closure.value?.ended_at || null
}) : null);
// measurements 已在读取时按该酵种全部历史窗口过滤；这里只排序。
const chartRows = computed(() => measurements.value.slice().sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at)));

// 本轮喂养时间确定时，读取窗口从起始前 10 分钟开始；没有确定起点才回退到最近 24 小时。
const chartFrom = computed(() => {
  const earliest = Date.parse(feeding.value?.occurred_at);
  const base = from.value;
  if (!Number.isFinite(earliest)) return base;
  return new Date(Math.min(Date.parse(base), earliest - 10 * 60000)).toISOString();
});
const chartTo = computed(() => to.value);
const expansionText = computed(() => Number.isFinite(summary.value?.expansionPercent) ? `${summary.value.expansionPercent.toFixed(1)}%` : '—');
// 罐子只做定性展示：液面跟平滑后的实测高度走，表情跟本轮的上涨/到顶/回落阶段走，
// 回落后在峰值处留一道痕迹。具体数值仍看下方膨胀率与详情曲线。
const jarLevel = computed(() => levelFor(summary.value?.trendHeightMm, summary.value?.baselineHeightMm));
const jarPeakLevel = computed(() => (summary.value?.risePhase === 'fallen' ? levelFor(summary.value.peakHeightMm, summary.value.baselineHeightMm) : null));
const jarMood = computed(() => jarMoodFor({ active: !!summary.value?.windowActive, phase: summary.value?.risePhase }));
const jarCaption = computed(() => {
  const s = summary.value;
  if (!starterId.value) return '未选择酵种';
  if (!feeding.value) return '还没开始新一轮';
  if (!s?.windowActive) return '本轮已结束';
  if (s.baselineHeightMm == null) return s.baselinePending ? '刚喂完，正在记录起始高度' : '暂无高度数据';
  if (s.risePhase === 'fallen') return '已过 Peak 回落，虚线是峰值高度';
  if (s.risePhase === 'peak') return '到达 Peak，开始回落';
  if (s.risePhase === 'pre-peak') return '涨到 2 倍（+100%），接近高点';
  if (s.trendHeightMm / s.baselineHeightMm < 1.1) return '刚喂完，等待起发';
  return s.trendHeightMm < s.highHeightMm ? '涨势放缓' : '正在上涨';
});
const jarMoodLabel = computed(() => `${JAR_MOOD_LABELS[jarMood.value]} · ${jarCaption.value}`);
// 指标只取最近一条有效样本：休眠与传感器故障的读数不能当作当前环境展示。
// 「当前数据」只描述实时：酵种当前没有活跃关联时，不把旧窗口里的读数当作当前环境展示。
const latest = computed(() => starterId.value && !link.value ? null : chartRows.value.filter((row) => !row.sensor_error && (!row.mode || row.mode === 'fer')).at(-1) || null);
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
// 状态按最近一次采样描述；异常与休眠要单独说清，避免把设备问题读成发酵结束。
const jarStatus = computed(() => {
  if (!starterId.value) return { tone: 'none', label: '未选择酵种', detail: '点按选择酵种' };
  if (!link.value) return { tone: 'none', label: '未关联设备', detail: '请到设备设置关联酵种' };
  const last = chartRows.value.at(-1);
  if (!last) return { tone: 'none', label: '暂无数据', detail: '最近 24 小时未收到采样' };
  if (last.sensor_error) return { tone: 'fault', label: '传感器异常', detail: `保留最后有效读数 · 最近更新 ${relative(last.recorded_at)}` };
  if (last.mode && last.mode !== 'fer') return { tone: last.mode === 'sleep' ? 'none' : 'warn', label: last.mode === 'sleep' ? '设备休眠中' : '设备模式异常', detail: `保留最后有效读数 · 最近更新 ${relative(last.recorded_at)}` };
  if (summary.value?.dataQuality === 'insufficient' || summary.value?.dataQuality === 'partial') return { tone: 'warn', label: '采样不足', detail: `保留最后有效读数 · 最近更新 ${relative(last.recorded_at)}` };
  const at = Date.parse(last.recorded_at);
  if (Number.isFinite(at) && now.value - at <= FRESH_MS) return { tone: 'ok', label: '设备已连接', detail: `最近更新 ${relative(last.recorded_at)}` };
  return { tone: 'warn', label: '断连', detail: `数据延迟 · 保留最后有效读数 · 最近更新 ${relative(last.recorded_at)}` };
});
const detailTarget = computed(() => ({
  path: `/devices/${encodeURIComponent(deviceId.value)}/trend`,
  query: { ...(starterId.value ? { starter: starterId.value } : {}), day: localDay(now.value) }
}));
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
function clearSelected() { allLinks.value = []; records.value = []; previousFeeding.value = null; link.value = null; measurements.value = []; evidence.value = []; report.value = null; nextFeedingAt.value = null; closure.value = null; closeError.value = ''; confirmOpen.value = false; }
function selectStarter(id) {
  if (saving.value || id && !starters.value.some((row) => row.id === id)) return;
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
      const loadedLinks = linkResult.value || []; const linkMap = new Map();
      for (const row of loadedLinks) if (row.active_to == null && !linkMap.has(row.starter_id)) linkMap.set(row.starter_id, row);
      const rows = starterResult.value || [];
      const contexts = await Promise.all(rows.map(async (item) => {
        const [latestRow, feedRows, obsRows] = await Promise.all([
          listCareRecords({ userId: owner, starterId: item.id, limit: 1 }),
          listCareRecords({ userId: owner, starterId: item.id, kind: 'feeding', limit: 2 }),
          listCareRecords({ userId: owner, starterId: item.id, kind: 'observation', limit: 1 })
        ]);
        return { ...item, link: linkMap.get(item.id) || null, hasLinkHistory: loadedLinks.some((row) => row.starter_id === item.id), latest: latestRow[0] || null, feeding: feedRows[0] || null, previousFeeding: feedRows[1] || null, observation: obsRows[0] || null };
      }));
      if (!current(token, owner)) return;
      contexts.sort((a, b) => (Date.parse(b.latest?.occurred_at) || 0) - (Date.parse(a.latest?.occurred_at) || 0));
      devices.value = deviceResult.value || []; starters.value = contexts;
      let selected = contexts.find(row => row.id === starterId.value);
      if (!selected && !explicitStarter.value) selected = contexts.find(row => row.link) || null;
      starterId.value = selected?.id || '';
      // 设备由所选酵种的活跃关联决定；一台设备可同时服务多个酵种，首页只切换酵种。
      deviceId.value = selected?.link?.device_id || '';
      link.value = selected?.link || null; allLinks.value = loadedLinks;
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
        if (loadedResult.cause) error.value = loadedResult.cause?.message || '本轮设备证据读取失败，请刷新重试。';
        else {
          const loaded = loadedResult.value;
          nextFeedingAt.value = loaded?.nextFeedingAt || null;
          // 证据已按该酵种全部历史窗口读取并过滤（含已关闭窗口），不要求与当前活跃关联一致。
          evidence.value = loaded?.link ? loaded.measurements : [];
          if (loaded?.unavailableReason && loaded?.link) error.value = loaded.unavailableReason;
        }
        closure.value = closureResult.value || null;
      }
      if (!current(token, owner)) return;
      // 选了酵种时，只在它于这台设备上有过关联窗口（含已关闭窗口）时才读取，并按窗口并集过滤。
      // 首页的实时数据只来自当前酵种本轮实际归属，不能共享给同时关联的其他酵种。
      const windows = feeding.value ? roundWindows.value.filter((window) => window.deviceId === deviceId.value) : [];
      if (!deviceId.value || !windows.length) { measurements.value = []; return; }
      const rangeFrom = chartFrom.value;
      const measuredRows = await listMeasurementsRange(deviceId.value, { from: rangeFrom, to: to.value, bucketed: false, starterId: starterId.value });
      if (!current(token, owner)) return;
      const inRange = measuredRows.filter(row => {
        const at = Date.parse(row.recorded_at);
        return at >= Date.parse(rangeFrom) && at <= now.value && (!row.device_id || row.device_id === deviceId.value);
      });
      const scoped = windows ? filterRowsByWindows(inRange.map(row => ({ ...row, device_id: row.device_id || deviceId.value })), clipWindows(windows, Date.parse(rangeFrom), now.value + 1)) : inRange;
      measurements.value = scoped.map(row => ({ ...row, height_mm: Number(row.height_mm) > 0 ? Number(row.height_mm) : null }));
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
    closure.value = saved; confirmOpen.value = false; now.value = Date.now();
    toast.value = '历史记录已保存';
  } catch (cause) {
    if (current(token, owner)) closeError.value = cause?.message || '结束本轮失败，请重试。';
  } finally {
    if (current(token, owner)) closing.value = false;
  }
}
// 删除改为归档（027）：物理删除会级联清空喂养/观察与设备关联历史，数据库也不授予 delete 权限。
// 无历史的酵种归档后从列表消失；有历史的归档后历史全部保留，因此这里不再拒绝任何酵种。
function archiveNote(item) {
  return item.latest || item.feeding || item.observation || item.hasLinkHistory
    ? '该酵种有喂养/观察记录或设备关联历史；归档后入口会收起，历史记录、曲线与关联时段全部保留。'
    : '这个酵种还没有喂养、观察或设备关联历史，归档后会从列表移除。';
}
async function removeStarter() {
  const item = starterPendingDelete.value;
  starterPendingDelete.value = null;
  if (!item || saving.value) return;
  const owner = accountId.value; const token = generation; const wasSelected = starterId.value === item.id;
  saving.value = true; mutationError.value = '';
  let archived = false;
  try {
    const result = await archiveStarter(item.id);
    if (!current(token, owner)) return;
    archived = true;
    starters.value = starters.value.filter((row) => row.id !== item.id);
    allLinks.value = allLinks.value.filter((row) => row.starter_id !== item.id);
    showToast(result.hasHistory ? '已归档，历史记录已保留' : '已归档');
  } catch (cause) {
    if (current(token, owner)) mutationError.value = cause?.message || '归档失败，请重试。';
  } finally {
    if (current(token, owner)) saving.value = false;
  }
  // 归档时服务端已关闭该酵种的活跃关联：重新读取关联与列表，避免首页继续展示旧设备。
  if (archived && !disposed) {
    if (wasSelected) { starterId.value = ''; explicitStarter.value = false; }
    void refresh();
  }
}
async function addStarter() {
  if (saving.value || !accountId.value || !newName.value.trim()) return;
  const owner = accountId.value; const token = generation; const mutationToken = ++mutationGeneration; saving.value = true; error.value = '';
  try {
    const created = await createStarter(newName.value.trim());
    if (!current(token, owner)) return;
    starters.value.unshift({ ...created, link: null });
    explicitStarter.value = true; starterId.value = created.id; deviceId.value = ''; mutationError.value = ''; clearSelected();
    newName.value = ''; newStarterOpen.value = false;
    pending = true;
  } catch (cause) { if (current(token, owner)) error.value = cause?.message || '新建酵种失败，请重试。'; }
  finally { if (mutationToken === mutationGeneration) { saving.value = false; if (pending) { pending = false; void refresh(); } } }
}
watch(accountId, () => { generation++; mutationGeneration++; saving.value = false; deviceId.value = ''; starterId.value = ''; explicitStarter.value = false; devices.value = []; starters.value = []; newName.value = ''; newStarterOpen.value = false; starterOpen.value = false; contextOpen.value = false; mutationError.value = ''; clearSelected(); error.value = ''; deviceError.value = ''; if (accountId.value) void refresh(); }, { immediate: true, flush: 'sync' });
// 记录页读取同一偏好作为默认酵种，切回设备页时两处看到的是同一罐。
watch(starterId, (id) => { if (id) rememberSelectedStarter(accountId.value, id); });
useVisiblePolling(refresh, 60000);
onMounted(() => auth.init());
onScopeDispose(() => { disposed = true; generation++; });
</script>

<template>
  <main class="m-page device-page">
    <!-- 日记 / 我的在游客与恢复态也保留一级标题，设备页对齐：没有账号时只画标题，选择酵种的入口留给登录后的 device-head。 -->
    <header v-if="!accountId" class="device-head"><h1>我的设备</h1></header>
    <!-- 会话恢复期间先给骨架屏：此时既无账号也没有游客身份，直接出「登录后开始」会闪一下再跳走。 -->
    <div v-if="!accountId && isAuthPending(auth)" class="m-skeleton" role="status" aria-label="正在恢复登录状态"><span></span><span></span></div>
    <template v-else-if="!accountId">
      <!-- 游客可以看首页的引导，但不读取任何设备数据；登录回跳保留到设备页（mobile-login 是 MobileShell 子路由）。 -->
      <MGuestNotice
        hero
        eyebrow="设备"
        title="连接设备，开始记录"
        description="登录后可查看酵种罐的实时温度、湿度与膨胀率。"
        action="登录后开始"
        :login-to="guestLoginTarget(route)"
        :register-to="guestRegisterTarget(route)"
        register
      />
    </template>
    <template v-else>
      <button v-if="contextOpen" type="button" class="picker-backdrop" aria-label="关闭酵种选择" @click="contextOpen = false"></button>
      <header class="device-head">
        <h1>我的设备</h1>
        <div class="starter-anchor">
          <button type="button" class="starter-switch" :aria-expanded="contextOpen" aria-haspopup="dialog" @click="openPicker">
            <img class="switch-jar" :src="iconJar" alt="" width="16" height="16" />
            <span class="switch-name">{{ starter?.name || '选择酵种' }}</span>
            <img class="switch-caret" :src="iconChevron" alt="" width="16" height="16" />
          </button>
          <section v-if="contextOpen" class="picker-row" role="dialog" aria-label="选择酵种">
            <div class="sheet-head"><strong>选择酵种</strong><button type="button" class="sheet-close" aria-label="收起" @click="contextOpen = false">收起</button></div>
            <details class="picker" :open="starterOpen" @toggle="starterOpen = $event.target.open">
              <summary><span class="picker-label">酵种</span><span class="picker-value">{{ starter?.name || '未选择' }}</span></summary>
              <div class="picker-menu starter-menu">
                <div v-for="item in starters" :key="item.id" class="starter-choice">
                  <button type="button" :class="{ active: item.id === starterId }" @click="selectStarter(item.id)">{{ item.name }}<small>{{ item.link ? `已关联 ${devices.find(device => device.device_id === item.link.device_id)?.name || item.link.device_id}` : '未关联设备 · 仅查看记录' }}</small></button>
                  <button type="button" class="starter-archive" :disabled="saving" @click="starterPendingDelete = item">归档</button>
                </div>
                <button class="menu-action" type="button" @click="newStarterOpen = !newStarterOpen">+ 新增酵种</button>
                <form v-if="newStarterOpen" class="new-starter" @submit.prevent="addStarter"><input v-model="newName" maxlength="80" placeholder="酵种名称" :disabled="saving"><button class="m-primary" type="submit" :disabled="saving || !newName.trim()">{{ saving ? '保存中…' : '新建酵种' }}</button></form>
                <RouterLink class="menu-action" :to="deviceId ? `/me/devices/${encodeURIComponent(deviceId)}` : '/me/devices'">在设备设置中管理关联</RouterLink>
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
      <p v-if="localLinkNotice && !mutationError" class="m-muted" role="status">{{ localLinkNotice }}</p>

      <div class="jar-preview">
        <div class="jar-figure" role="img" :aria-label="`酵种状态：${jarMoodLabel}`">
          <MStarterJar class="jar-stage" :mood="jarMood" :level="jarLevel" :peak-level="jarPeakLevel" />
        </div>
        <p class="jar-caption" aria-hidden="true">{{ jarMoodLabel }}</p>
      </div>

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
      <div class="section-head">
        <p class="section-label">当前数据</p>
        <RouterLink v-if="deviceId" class="detail-link" :to="detailTarget"><span>详情</span><img :src="iconChevronRight" alt="" width="14" height="14" /></RouterLink>
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
      <p v-if="closeError" class="m-error" role="alert">{{ closeError }}</p>
      <button v-if="windowActive" type="button" class="device-cta is-soft" :disabled="closing" @click="confirmOpen = true">结束当前发酵</button>
      <RouterLink v-else class="device-cta" :to="feedTarget">喂养</RouterLink>
      <p v-if="!feeding" class="cta-note"><span>记录喂养后，本轮发酵会自动开始计时。</span></p>

      <div v-if="riskAdvice" class="risk-banner" role="alert"><strong>上次风险结果：{{ lastAdvice.result.title }}</strong><RouterLink :to="lastAdvice.savedId ? `/diary/records/${lastAdvice.savedId}` : '/reports/session'">查看结果</RouterLink></div>

      <MConfirmDialog :open="!!starterPendingDelete" danger title="归档酵种" :message="archiveNote(starterPendingDelete || {})" confirm-label="归档" @cancel="starterPendingDelete = null" @confirm="removeStarter" />
      <MConfirmDialog :open="confirmOpen" danger title="结束当前发酵？" message="结束后，本次发酵将停止记录。你可以开始下一次喂养。" :confirm-label="closing ? '正在结束…' : '确认结束'" cancel-label="继续发酵" @cancel="confirmOpen = false" @confirm="endRound(null)" />

      <MToast :open="!!toast" :message="toast" subtitle="本次发酵已结束" tone="success" @close="toast = ''" />
    </template>
  </main>
</template>

<style scoped>
.mobile-area .m-page.device-page{padding-top:calc(12px + env(safe-area-inset-top));padding-bottom:calc(var(--m-tab-height) + env(safe-area-inset-bottom) + 88px);gap:0}
/* 本页 gap 为 0，节奏靠 margin，但 `.m-page > *` 的 margin-block 归零会把它们全部吃掉：
   实测「我的设备」→ 状态行 → 罐体都是 0，状态行贴着标题、罐体帽檐（top:-9）反过来压住状态行。
   这里用高优先级别名写回，并把罐体与状态行之间留 12，让帽檐不再侵入状态文字。 */
.mobile-area .mobile-main .m-page.device-page > .jar-status{margin-block:8px 0}
.mobile-area .mobile-main .m-page.device-page > .jar-preview{margin-block:12px 0}
.mobile-area .mobile-main .m-page.device-page > .cta-note{margin-block:10px 0}
.mobile-area .mobile-main .m-page.device-page > .risk-banner{margin-block:16px 0}
.mobile-area .mobile-main .m-page.device-page > :is(.m-guest-notice,.m-skeleton){margin-block:16px 0}
.device-head{position:relative;z-index:calc(var(--m-z-header) + 2);display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:36px}
.starter-anchor{position:relative;flex:none}
/* 选择浮层的遮罩要盖住 sticky 顶栏（--m-z-header）但低于弹层（--m-z-modal），
   原先是手写的 31/32，跟令牌不成比例，顶栏层级再调整时会漏盖。 */
.picker-backdrop{position:fixed;inset:0;z-index:calc(var(--m-z-header) + 1);border:0;background:transparent;cursor:default}
.device-head h1{margin:0;font-size:28px;line-height:36px;font-weight:500;letter-spacing:-.02em}
.starter-switch{display:inline-flex;align-items:center;gap:6px;flex:none;box-sizing:border-box;width:100px;height:36px;min-height:36px;padding:0 10px;border:0;border-radius:18px;background:var(--surface-card);box-shadow:0 3px 12px rgba(48,37,31,.07);color:var(--text-primary);font:inherit;font-size:12px;font-weight:500;cursor:pointer}
.switch-jar{flex:none;width:16px;height:16px}
.switch-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}
.switch-caret{flex:none;width:16px;height:16px;transition:transform var(--motion-fast) var(--ease-standard)}
.starter-switch[aria-expanded="true"] .switch-caret{transform:rotate(180deg)}
.jar-status{display:flex;align-items:center;gap:6px;min-height:24px;margin:8px 0 0;font-size:14px;line-height:21px;font-weight:500;color:var(--brand-action)}.jar-dot{width:7px;height:7px;border-radius:50%;background:currentColor;flex:none}
.jar-status[data-tone="none"]{color:var(--text-secondary)}
.jar-status[data-tone="warn"]{color:var(--warning-text)}
.jar-status[data-tone="fault"]{color:var(--danger-text)}
.jar-label{flex:1;min-width:0}
.jar-refresh{flex:none;display:grid;place-items:center;width:24px;height:24px;min-height:0;margin-right:-4px;padding:4px;border:0;border-radius:50%;background:transparent;color:var(--text-secondary);cursor:pointer}
.jar-refresh svg{width:16px;height:16px;min-height:0}
.jar-refresh.spinning svg{animation:device-spin .9s linear infinite}
@keyframes device-spin{to{transform:rotate(360deg)}}
.jar-preview{position:relative}
.jar-figure{display:block;width:180px;height:180px;margin:0 auto}
.jar-caption{position:absolute;top:188px;left:0;right:0;margin:0;text-align:center;font-size:11px;line-height:16px;color:var(--text-secondary);pointer-events:none}
.section-label{margin:28px 0 9px;font-size:14px;line-height:21px;font-weight:500;color:var(--text-secondary)}
.section-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin:14px 0 3px}
.section-head .section-label{margin:0}
/* 全局把 .m-page 直接子元素的 margin-block 归零，本页按设计稿的间距用更高优先级写回。 */
.mobile-area .mobile-main .m-page.device-page > .section-label{margin-block:28px 9px}
.mobile-area .mobile-main .m-page.device-page > .section-head{margin-block:14px 3px}
.mobile-area .mobile-main .m-page.device-page > .metric-row{margin-block:0}
.mobile-area .mobile-main .m-page.device-page > .device-cta{margin-block:14px 0}
/* 与日记页「酵种医生 ›」同款文字入口：13/20 的 --m-text-doctor、14px 箭头、6px 间距、32 高。 */
.detail-link{display:inline-flex;align-items:center;gap:6px;flex:none;min-height:32px;color:var(--m-text-doctor);font-size:13px;line-height:20px;font-weight:500;text-decoration:none}
.detail-link img{display:block;flex:none}
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
.metric-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:3px 0 0;padding:18px 0;border-radius:24px}
.metric{display:grid;justify-items:start;gap:2px;min-width:0;height:116px;padding:10px 12px;border-radius:20px;background:var(--m-metric-soft)}
.metric[data-level="2"]{background:var(--m-metric-mid)}
.metric[data-level="3"]{background:var(--m-metric-strong)}
.metric .disc{width:30px;height:30px;background:rgba(255,176,90,.16)}
.metric strong{margin-top:8px;font-size:18px;line-height:26px;font-weight:500;color:var(--text-primary);font-variant-numeric:tabular-nums;white-space:nowrap}
.metric-label{font-size:14px;line-height:21px;color:var(--text-secondary)}
.device-cta{display:flex;align-items:center;justify-content:center;width:100%;height:60px;min-height:60px;margin:14px 0 0;padding:0 16px;border:0;border-radius:var(--m-radius-button);background:var(--brand-light);color:var(--text-primary);font:inherit;font-size:16px;font-weight:500;text-decoration:none;cursor:pointer}
.device-cta:active:not(:disabled){background:var(--brand-accent)}
/* 「结束当前发酵」是收尾动作，不是这一屏要做的事：退成日记页「本日全部数据」同款柔和胶囊
   （--m-disc 底 + --m-text-link 橙字 + --m-chart-line 细边框），仍保持整宽与 60 高可点区域。
   只加修饰类，不动 .device-cta 本身，「喂养」在无进行中轮次时仍是醒目的主按钮。
   按下只加深边框：16px 字在 --m-disc 上是 4.52:1，换成更深的 --m-date-mark 会掉到 4.16:1。 */
.device-cta.is-soft{border:1px solid var(--m-chart-line);background:var(--m-disc);color:var(--m-text-link)}
.device-cta.is-soft:active:not(:disabled){background:var(--m-disc);border-color:var(--brand-accent);color:var(--m-text-link)}
.device-cta:disabled{opacity:.6;cursor:not-allowed}
.cta-note{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:6px;margin:10px 0 0;font-size:12px;line-height:18px;color:var(--text-secondary)}.risk-banner{margin-top:16px;padding:12px;border-left:3px solid var(--danger-text);background:var(--danger-bg);color:var(--danger-text);font-size:13px;display:flex;align-items:center;justify-content:space-between;gap:8px}
.risk-banner a{color:inherit;font-weight:600}
.picker-row{position:absolute;z-index:var(--m-z-raised);top:calc(100% + 8px);right:0;display:grid;gap:8px;width:min(280px,calc(100vw - 48px));max-height:min(420px,70vh);margin:0;padding:12px;overflow:auto;border:1px solid var(--border-subtle);border-radius:var(--radius-card);background:var(--surface-card);box-shadow:0 8px 24px rgba(48,37,31,.14)}
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
/* 弹层只有 280 宽，左侧按钮必须能收缩：flex 子项默认 min-width 是内容宽度，
   长酵种名加长注解会把文字挤成一字一行竖排。.starter-choice 自身是 .picker-menu
   的 grid 子项，同样要吃 min-width:0，否则整行按内容宽度撑开、往外横向溢出。 */
.starter-choice{display:flex;align-items:center;gap:8px;min-width:0}
.starter-choice > button:first-child{flex:1;min-width:0;overflow-wrap:anywhere}
.starter-choice small{display:block;margin-top:2px;overflow-wrap:anywhere}
/* 上面 .picker-menu button 的 width:100% 也会命中删除键（0,1,1 压过 0,1,0 的 flex:none），
   删除键会占满整行、把名字顶成 22px 竖排。这里提权并还原成内容宽度。 */
.starter-choice .starter-archive{flex:none;width:auto;min-height:44px;padding:0 8px;border:0;background:transparent;color:var(--danger-text);font:inherit}
.picker-menu small{font-size:11px;color:var(--text-secondary)}
.menu-action{color:var(--brand-action)!important}
.new-starter{display:grid;gap:8px;margin-top:4px}
/* 同理：iOS 对 <16px 的输入框 focus 会放大视口，这处新建酵种输入框必须保持 16px。 */
.new-starter input{min-height:44px;padding:8px 10px;border:1px solid var(--border-input);border-radius:10px;font:inherit;font-size:16px;background:var(--surface-input);color:var(--text-primary)}
.new-starter .m-primary{width:100%;min-height:44px;font-size:14px}
/* 游客引导整块交给 MGuestNotice 的 hero 形态，这里不再保留一份重复的插画与按钮样式。 */
@media (max-width:360px){.metric{padding:10px}.metric strong{font-size:16px}.feed-cell{padding:0 12px}}
</style>
