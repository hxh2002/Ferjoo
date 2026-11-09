<script setup>
import { computed, onMounted, onScopeDispose, ref, watch } from 'vue';
import { onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { useCheckinDraft } from '../../composables/useCheckinDraft.js';
import { saveFeeding } from '../../services/care.service.js';
import { useStarterName } from '../../composables/useStarterName.js';
import { randomUuid, isUuid } from '../../lib/uuid.js';
import { localDateTimeValue, parseLocalDateTime } from '../../lib/localDateTime.js';
import { computeWeights, ratioParts, weightFields } from '../../lib/feeding-weights.js';
import { HEIGHT_ALERT_TARGETS } from '../../services/height-alert.service.js';
import { loadHeightTargets, saveHeightTargets } from '../../services/web-push.service.js';
import MRecordCard from '../../components/mobile/MRecordCard.vue';
import MCalendar from '../../components/mobile/MCalendar.vue';
import MWheelPicker from '../../components/mobile/MWheelPicker.vue';
import MGuestNotice from '../../components/mobile/MGuestNotice.vue';
import { guestLoginTarget, guestRegisterTarget, isAuthPending, isGuest } from '../../lib/mobile-guest.js';

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const { user } = auth;
const accountId = computed(() => user.value?.id || 'guest');
// 记录喂养是 meta.requiresAuth 页面，但会话过期时组件仍可能渲染：游客只保留本机草稿，不落云端。
const guest = computed(() => isGuest(auth));
const authPending = computed(() => isAuthPending(auth));
const { draft, storageAvailable, persist, replace } = useCheckinDraft(accountId, {
  kind: 'feeding',
  defaults: () => ({
    starterId: '',
    occurredAt: localDateTimeValue(),
    ratio: '',
    weightField: '',
    weightValue: '',
    baselineHeightMm: '',
    baselineSource: '',
    deviceId: '',
    step: 1,
    requestId: '',
    submission: {},
    confirmed: false,
    heightAlert: ''
  })
});
const { starterName } = useStarterName(accountId, computed(() => draft.value.starterId));
const weightLabels = { starter: '老种', water: '水', flour: '面粉', total: '合计' };
const canConvert = computed(() => Boolean(ratioParts(draft.value.ratio)));
const weights = computed(() => computeWeights(draft.value.ratio, draft.value.weightField, draft.value.weightValue));

// 正在输入的那一项保持原始字符，避免输入过程被换算结果打断；其余三项显示推算值。
function weightDisplay(field) {
  if (draft.value.weightField === field) return draft.value.weightValue;
  return weights.value ? String(weights.value[field]) : '';
}
function setWeight(field, value) {
  draft.value.weightField = value === '' ? '' : field;
  draft.value.weightValue = String(value);
}

const error = ref('');
const status = ref('');
const saving = ref(false);
const openCard = ref('');
const timePicker = ref('');
const alertNotice = ref('');
// 五个预设 + 一个「自定义」正好 2 行 × 3 个按钮；不再有折叠的第二层比例。
const ratioPresets = [
  { value: '1:1:1', label: '1 : 1 : 1' },
  { value: '1:2:2', label: '1 : 2 : 2' },
  { value: '1:3:3', label: '1 : 3 : 3' },
  { value: '1:5:5', label: '1 : 5 : 5' },
  { value: '1:2:1', label: '1 : 2 : 1' }
];
// 'deep_reset' 是旧草稿里的历史值：保留可保存，但既不算预设也不展开滑块。
const customRatio = computed(() => Boolean(draft.value.ratio) && draft.value.ratio !== 'deep_reset' && !ratioPresets.some((item) => item.value === draft.value.ratio));
const ratioMode = ref('preset');
const showCustom = computed(() => ratioMode.value === 'custom' || customRatio.value);
// 自定义比例改成三条滑块，比例值仍然是 draft.ratio 这一个来源；滑块只是它的编辑面。
const CUSTOM_FALLBACK = { starter: 1, water: 1, flour: 1 };
const customSliders = [
  { field: 'starter', min: 1, max: 5 },
  { field: 'water', min: 1, max: 10 },
  { field: 'flour', min: 1, max: 10 }
];
const customParts = computed(() => {
  const parts = ratioParts(draft.value.ratio);
  return parts ? { starter: parts.starter, water: parts.water, flour: parts.flour } : CUSTOM_FALLBACK;
});
const customRatioLabel = computed(() => ['starter', 'water', 'flour'].map((field) => partText(customParts.value[field])).join(' : '));
function partText(value) {
  return String(Math.round(Number(value) * 10) / 10);
}
function sliderProgress(item) {
  const span = item.max - item.min;
  const step = span ? (customParts.value[item.field] - item.min) / span : 0;
  return `${Math.min(1, Math.max(0, step)) * 100}%`;
}
const hourOptions = Array.from({ length: 24 }, (_, hour) => ({ value: String(hour).padStart(2, '0'), label: `${String(hour).padStart(2, '0')} 时` }));
const minuteOptions = Array.from({ length: 60 }, (_, minute) => ({ value: String(minute).padStart(2, '0'), label: `${String(minute).padStart(2, '0')} 分` }));
const alertOptions = [{ value: '', label: '不提醒' }, ...HEIGHT_ALERT_TARGETS.map((target) => ({ value: String(target), label: `${target}×` }))];

function dayKey(date = new Date()) {
  return localDateTimeValue(date).slice(0, 10);
}
function addDays(day, amount) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return dayKey(date);
}
const today = computed(() => dayKey());
const earliestDay = computed(() => addDays(today.value, -365));
const occurredDate = computed(() => String(draft.value.occurredAt || '').slice(0, 10));
const occurredHour = computed(() => String(draft.value.occurredAt || '').slice(11, 13) || '00');
const occurredMinute = computed(() => String(draft.value.occurredAt || '').slice(14, 16) || '00');
const timeSummary = computed(() => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(draft.value.occurredAt || '');
  if (!match) return '选择时间';
  return `${Number(match[2])} 月 ${Number(match[3])} 日 ${match[4]}:${match[5]}`;
});
const ratioSummary = computed(() => {
  const preset = ratioPresets.find((item) => item.value === draft.value.ratio);
  if (preset) return preset.label;
  if (draft.value.ratio === 'deep_reset') return '大比例刷新';
  return draft.value.ratio ? `自定义 ${draft.value.ratio.split(':').join(' : ')}` : '选择比例';
});
const alertSummary = computed(() => {
  const value = Number(draft.value.heightAlert);
  return Number.isFinite(value) && value > 0 ? `${Math.round(value * 100)}%` : '不提醒';
});
const inputsLocked = computed(() => locked.value || saving.value);

function toggleCard(name) {
  if (inputsLocked.value) return;
  openCard.value = openCard.value === name ? '' : name;
  if (openCard.value !== 'time') timePicker.value = '';
}
function toggleTimePicker(name) {
  timePicker.value = timePicker.value === name ? '' : name;
}
function setOccurred(date = occurredDate.value, hour = occurredHour.value, minute = occurredMinute.value) {
  if (inputsLocked.value) return;
  draft.value.occurredAt = `${date || today.value}T${hour || '00'}:${minute || '00'}`;
}
function restoreNow() {
  draft.value.occurredAt = localDateTimeValue();
  timePicker.value = '';
}
function selectRatio(value) {
  ratioMode.value = 'preset';
  draft.value.ratio = value;
  draft.value.weightField = '';
  draft.value.weightValue = '';
}
function selectCustom() {
  if (inputsLocked.value) return;
  ratioMode.value = 'custom';
  // 首次进入自定义时把滑块落到一份可用的起点，避免三条滑块都停在 0 无法保存。
  if (!ratioParts(draft.value.ratio)) {
    draft.value.ratio = ['starter', 'water', 'flour'].map((field) => partText(CUSTOM_FALLBACK[field])).join(':');
    draft.value.weightField = '';
    draft.value.weightValue = '';
  }
}
function setCustomSlider(field, raw) {
  if (inputsLocked.value) return;
  const item = customSliders.find((slider) => slider.field === field);
  const value = Number(raw);
  if (!item || !Number.isFinite(value)) return;
  const parts = { ...customParts.value, [field]: Math.min(item.max, Math.max(item.min, value)) };
  ratioMode.value = 'custom';
  draft.value.ratio = ['starter', 'water', 'flour'].map((key) => partText(parts[key])).join(':');
}
async function chooseHeightAlert(value) {
  const previous = draft.value.heightAlert;
  draft.value.heightAlert = value;
  alertNotice.value = '';
  if (!isUuid(draft.value.starterId)) return;
  try {
    const current = await loadHeightTargets(draft.value.starterId);
    const retained = current.filter((target) => String(target) !== String(previous));
    const next = value === '' ? retained : [...new Set([...retained, Number(value)])].sort((a, b) => a - b);
    await saveHeightTargets(draft.value.starterId, next);
    alertNotice.value = value === '' ? '已关闭这罐酵种的高度提醒。' : `高度提醒已设为 ${value}×。`;
  } catch (cause) {
    draft.value.heightAlert = previous;
    alertNotice.value = cause?.message || '高度提醒没有保存。';
  }
}
const locked = computed(() => Object.keys(draft.value.submission).length > 0);
const baselineOpen = ref(false);

// 六态状态机：editing 输入 / validating 校验失败 / saving 保存中 / pending 待确认锁定 / saved 已保存 / next 已保存待下一条。
// 派生而不是单独存储，避免和草稿、提交载荷的权威来源分叉。
const phase = computed(() => {
  if (draft.value.confirmed) return 'saved';
  if (saving.value) return 'saving';
  if (locked.value) return 'pending';
  if (error.value) return 'validating';
  return 'editing';
});
const phaseLabel = computed(() => ({
  editing: '记录已发生的喂养',
  validating: '请先修正表单',
  saving: '正在保存到云端',
  pending: '待确认 · 内容已锁定',
  saved: '已保存',
  next: '开始下一条'
}[phase.value]));
const submitLabel = computed(() => {
  if (saving.value) return '保存中…';
  if (locked.value) return '重试确认本次保存';
  return '保存喂养记录';
});

let generation = 0;
watch(accountId, () => {
  generation += 1;
  saving.value = false;
  error.value = '';
  status.value = '';
}, { flush: 'sync' });
onScopeDispose(() => { generation += 1; });

watch([accountId, () => route.query.starter], () => {
  // 时间默认取当前时刻：草稿不再沿用上次进入时保存的旧时间，避免用户误提交错时间。
  if (!locked.value) draft.value.occurredAt = localDateTimeValue();
  const starterId = typeof route.query.starter === 'string' ? route.query.starter : '';
  // 同一次访问保留已保存横幅；真正进入 starter 路由时由导航钩子开启下一条。
  if (!draft.value.confirmed && !locked.value && starterId && starterId !== draft.value.starterId) {
    if (draft.value.starterId) replace({ starterId });
    else draft.value.starterId = starterId;
  }
  if (!locked.value && draft.value.baselineSource === 'device') {
    draft.value.baselineHeightMm = '';
    draft.value.baselineSource = '';
  }
  baselineOpen.value = draft.value.baselineHeightMm !== '';
}, { immediate: true, flush: 'sync' });

function validate() {
  if (!isUuid(draft.value.starterId)) return '请先在设备页添加或选择有效酵种，再记录喂养。';
  try {
    if (parseLocalDateTime(draft.value.occurredAt) > new Date()) return '喂养时间不能晚于现在。';
  } catch (cause) { return cause.message; }
  if (!draft.value.ratio) return '请选择这次使用的喂养比例。';
  if (draft.value.weightValue !== '' && !weights.value) return '投喂重量需大于 0，且当前比例需可换算。';
  if (draft.value.baselineHeightMm !== '' && (!Number.isFinite(Number(draft.value.baselineHeightMm)) || Number(draft.value.baselineHeightMm) <= 0)) return '起始高度需为大于 0 的毫米数，未测量可留空。';
  return '';
}
function startNext(starterId = draft.value.starterId, { quiet = false } = {}) {
  if (saving.value || !draft.value.confirmed) return false;
  try {
    const requestId = randomUuid();
    replace({ starterId, occurredAt: localDateTimeValue(), ratio: '', requestId, heightAlert: '' });
    baselineOpen.value = false;
    openCard.value = '';
    ratioMode.value = 'preset';
    alertNotice.value = '';
    status.value = quiet ? '' : '已开始下一条喂养记录，请填写本次事实。';
    error.value = '';
    return true;
  } catch (cause) { error.value = cause.message; return false; }
}
function resetConfirmedOnEntry(starter = route.query.starter) {
  const starterId = typeof starter === 'string' ? starter : '';
  // 保存确认后已经自动回设备首页，再次进入本页就是新一轮；待确认提交绝不能被新入口覆盖。
  if (draft.value.confirmed) startNext(starterId || draft.value.starterId, { quiet: true });
}
onMounted(() => resetConfirmedOnEntry());
onBeforeRouteUpdate((to) => { resetConfirmedOnEntry(to.query.starter); });
// 保存确认后不停留在表单：直接回设备首页，本轮摘要与发酵计时在首页立即可见。
// 用 replace 让返回键不会回到已完成的表单；导航失败时留在已保存态，横幅仍是兜底。
async function returnHome() {
  try { await router.replace('/device'); } catch { /* 留在已保存态 */ }
}
async function save() {
  if (saving.value || draft.value.confirmed) return;
  if (!user.value) { error.value = '保存喂养需要登录；草稿已在本机保留。'; return; }
  const token = generation;
  const owner = accountId.value;
  const current = () => token === generation && owner === accountId.value;
  saving.value = true; status.value = ''; error.value = '';
  try {
    if (!locked.value) {
      const invalid = validate();
      if (invalid) throw new Error(invalid);
      const requestId = isUuid(draft.value.requestId) ? draft.value.requestId : randomUuid();
      const grams = weights.value;
      replace({
        ...draft.value,
        requestId,
        submission: {
          requestId,
          starterId: draft.value.starterId,
          occurredAt: parseLocalDateTime(draft.value.occurredAt).toISOString(),
          ratio: draft.value.ratio,
          input: {
            baseline_height_mm: draft.value.baselineHeightMm === '' ? null : Number(draft.value.baselineHeightMm),
            baseline_source: draft.value.baselineSource || null,
            starter_g: grams?.starter ?? null,
            water_g: grams?.water ?? null,
            flour_g: grams?.flour ?? null,
            total_g: grams?.total ?? null
          }
        }
      });
    }
    // Persist the immutable operation before sending, including after a page reload.
    persist();
    if (!storageAvailable.value || !globalThis.localStorage) throw new Error('本机存储不可用，无法保证刷新后安全重试；请恢复存储后重试。');
    const payload = JSON.parse(JSON.stringify(draft.value.submission));
    if (!isUuid(payload.requestId) || payload.requestId !== draft.value.requestId) throw new Error('待确认草稿的请求编号无效，请勿重复新建，先核对已有记录。');
    const result = await saveFeeding(payload);
    if (!current()) return;
    if (!result?.id && result?.saved !== true) throw new Error('未收到云端保存确认。');
    draft.value.confirmed = true;
    persist();
    status.value = '已云端保存喂养记录。';
    // 保存成功后直接回设备首页：首页展示新的喂养摘要，不再让用户点「开始下一条」。
    await returnHome();
  } catch (cause) {
    if (current()) error.value = `${cause.message || '保存未完成。'}${locked.value ? ' 本次内容已锁定，重试将沿用同一请求及内容，不会重复新增。' : ''}`;
  } finally {
    if (current()) saving.value = false;
  }
}
</script>

<template>
  <main class="m-page mobile-feeding" :data-phase="phase">
    <p v-if="phase !== 'editing'" class="phase-chip" :data-phase="phase">{{ phaseLabel }}</p>

    <!-- 会话过期时仍停在表单：草稿按账号分开保存在本机，但保存到云端必须重新登录。 -->
    <MGuestNotice
      v-if="guest || authPending"
      compact
      :title="guest ? '登录后才能保存这次喂养' : '正在恢复登录状态'"
      :description="guest ? '填写内容会保留在本机草稿，登录后即可提交。' : '稍候即可继续填写。'"
      :login-to="guestLoginTarget(route)"
      :register-to="guestRegisterTarget(route)"
      :register="guest && !authPending"
    />

    <p class="m-context m-muted">
      <span v-if="draft.starterId">当前酵种：{{ starterName }}</span>
      <span v-else>尚未选择酵种，<RouterLink to="/device">去设备页选择</RouterLink></span>
    </p>
    <p v-if="!storageAvailable" class="m-error" role="alert">本机存储不可用，关闭页面可能丢失草稿。</p>

    <section v-if="phase === 'saved'" class="saved-banner" role="status">
      <span class="saved-disc" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
      </span>
      <div class="saved-copy"><strong>已保存</strong><small>本轮发酵已开始计时，可在设备页查看。</small></div>
      <RouterLink class="saved-link" :to="{ path: '/device', query: { starter: draft.starterId } }">查看本轮</RouterLink>
    </section>

    <p v-if="phase === 'pending'" class="m-error" role="alert">
      当前保留的是「{{ starterName }}」的待确认喂养草稿，内容已锁定；不会切换酵种或覆盖草稿，请先重试确认原提交后再记录下一条。
    </p>

    <p class="feeding-section">喂养措施</p>
    <form class="feeding-form" @submit.prevent="save">
      <MRecordCard class="time-record" title="时间" icon="clock" :summary="timeSummary" :open="openCard === 'time'" :disabled="inputsLocked" content-id="feeding-time" @toggle="toggleCard('time')">
        <div class="time-switch">
          <button type="button" :aria-expanded="timePicker === 'date'" :disabled="inputsLocked" @click="toggleTimePicker('date')">{{ occurredDate }}</button>
          <button type="button" :aria-expanded="timePicker === 'time'" :disabled="inputsLocked" @click="toggleTimePicker('time')">{{ occurredHour }}:{{ occurredMinute }}</button>
        </div>
        <MCalendar v-if="timePicker === 'date'" size="compact" :model-value="occurredDate" :min="earliestDay" :max="today" :disabled="inputsLocked" @update:model-value="setOccurred($event)" />
        <div v-if="timePicker === 'time'" class="time-wheels">
          <MWheelPicker :model-value="occurredHour" :options="hourOptions" label="小时" :height="130" :row-height="36" :disabled="inputsLocked" @update:model-value="setOccurred(occurredDate, $event, occurredMinute)" />
          <MWheelPicker :model-value="occurredMinute" :options="minuteOptions" label="分钟" :height="130" :row-height="36" :disabled="inputsLocked" @update:model-value="setOccurred(occurredDate, occurredHour, $event)" />
        </div>
        <button type="button" class="restore-time" :disabled="inputsLocked" @click="restoreNow">恢复当前时间</button>
      </MRecordCard>

      <MRecordCard title="比例" icon="scales" :summary="ratioSummary" :open="openCard === 'ratio'" :disabled="inputsLocked" content-id="feeding-ratio" @toggle="toggleCard('ratio')">
        <div class="ratio-presets" role="group" aria-label="喂养比例">
          <button v-for="item in ratioPresets" :key="item.value" type="button" :class="{ 'is-selected': draft.ratio === item.value && !showCustom }" :disabled="inputsLocked" :aria-pressed="draft.ratio === item.value && !showCustom" @click="selectRatio(item.value)">{{ item.label }}</button>
          <button type="button" class="custom-ratio" :class="{ 'is-selected': showCustom }" :disabled="inputsLocked" :aria-pressed="showCustom" @click="selectCustom">自定义</button>
        </div>
        <div v-if="showCustom" class="custom-ratio-panel">
          <p v-if="!canConvert" class="custom-ratio-hint">这次草稿里的旧比例已不再提供，请重新选择或点「自定义」重新设置。</p>
          <template v-else>
            <p class="custom-ratio-value">当前比例 {{ customRatioLabel }}</p>
            <label v-for="item in customSliders" :key="item.field" class="custom-slider">
              <span class="custom-slider-head">{{ weightLabels[item.field] }}<strong>{{ partText(customParts[item.field]) }}</strong></span>
              <input
                type="range"
                :min="item.min"
                :max="item.max"
                step="1"
                :value="customParts[item.field]"
                :disabled="inputsLocked"
                :style="{ '--slider-progress': sliderProgress(item) }"
                :aria-label="`${weightLabels[item.field]}份数`"
                @input="setCustomSlider(item.field, $event.target.value)"
              />
            </label>
          </template>
        </div>
        <fieldset v-if="draft.ratio && canConvert" class="weight-fields" :disabled="inputsLocked">
          <legend>投喂重量（g，可选）</legend>
          <div class="weight-grid">
            <label v-for="field in weightFields" :key="field" class="weight-item">
              <span>{{ weightLabels[field] }}</span>
              <input type="number" min="0" step="any" inputmode="decimal" :value="weightDisplay(field)" :disabled="!canConvert" @input="setWeight(field, $event.target.value)" />
            </label>
          </div>
          <p class="m-muted">填任一项，自动换算其余。</p>
        </fieldset>
      </MRecordCard>

      <MRecordCard class="alert-card" title="高度提醒" icon="alert" :summary="alertSummary" :open="openCard === 'alert'" :disabled="inputsLocked" content-id="feeding-alert" @toggle="toggleCard('alert')">
        <MWheelPicker class="alert-wheel" :model-value="String(draft.heightAlert)" :options="alertOptions" label="高度提醒" :disabled="inputsLocked" @update:model-value="chooseHeightAlert" />
        <p class="m-muted">{{ alertNotice || '留空表示不提醒。达到后每轮只推送一次。' }}</p>
        <RouterLink class="alert-settings" to="/me/notifications">高度预约的完整阈值在通知设置中管理</RouterLink>
      </MRecordCard>

      <details class="baseline-details" :open="baselineOpen" @toggle="baselineOpen = $event.target.open">
        <summary>喂养后起始高度（可选）<span v-if="draft.baselineHeightMm !== ''"> · {{ draft.baselineHeightMm }} mm</span></summary>
        <label class="m-field">
          <span class="field-label">手动修正起始高度（mm）</span>
          <input v-model="draft.baselineHeightMm" type="number" min="0" step="any" inputmode="decimal" :disabled="inputsLocked" @input="draft.baselineSource = 'manual'" />
          <span class="m-muted">可留空；填写后按此值计算膨胀率。</span>
        </label>
      </details>

      <p v-if="error" class="m-error" role="alert">{{ error }}</p>
      <p v-if="status" class="m-status" role="status">{{ status }}</p>

      <div class="m-actions">
        <button v-if="!draft.confirmed" type="submit" class="m-primary feeding-submit" :disabled="saving || (!locked && !draft.ratio)">{{ submitLabel }}</button>
        <button v-else type="button" class="m-primary feeding-submit" :disabled="saving" @click="startNext(typeof route.query.starter === 'string' ? route.query.starter : draft.starterId)">开始下一条</button>
      </div>
    </form>
  </main>
</template>

<style scoped>
.mobile-area .m-page.mobile-feeding{padding-top:calc(12px + env(safe-area-inset-top));padding-bottom:0;gap:0}
.phase-chip{display:inline-flex;align-items:center;align-self:flex-start;min-height:26px;margin:0 0 10px;padding:0 10px;border-radius:13px;background:var(--m-icon-disc);color:var(--brand-action);font-size:12px;font-weight:500}
.phase-chip[data-phase="saved"]{background:var(--success-bg);color:var(--success-text)}
.phase-chip[data-phase="validating"],.phase-chip[data-phase="pending"]{background:var(--warning-bg);color:var(--warning-text)}
.phase-chip[data-phase="saving"]{background:var(--brand-light);color:var(--text-primary)}
.m-context{margin:0 0 12px;font-size:13px;line-height:19px;overflow-wrap:anywhere}
.m-context a{color:var(--brand-action);text-decoration:none;font-weight:500}
.feeding-section{margin:0 0 9px;color:var(--text-secondary);font-size:var(--text-sm);font-weight:500;line-height:21px}
/* `.m-page > *` 的全局 margin 归零让上面两条 scoped 间距失效，实测「当前酵种」→「喂养措施」
   与「喂养措施」→ 表单都是 0，标题压在第一张记录卡上；这里用高优先级别名把 12 / 9 写回。 */
.mobile-area .mobile-main .m-page.mobile-feeding > .m-context{margin-block:0 12px}
.mobile-area .mobile-main .m-page.mobile-feeding > .feeding-section{margin-block:0 9px}
.mobile-area .mobile-main .m-page.mobile-feeding > .saved-banner{margin-block:0 14px}
.alert-card :deep(.m-record-card-summary){font-size:14px;line-height:21px}
.feeding-form{display:grid;gap:12px}
.time-switch{display:grid;grid-template-columns:minmax(0,184fr) minmax(0,103fr);gap:8px;max-width:295px;margin:3px 0 6px}
.time-switch button{height:48px;min-height:48px;padding:0 12px;border:1px solid var(--border-warm);border-radius:var(--radius-control);background:var(--surface-card);color:var(--text-primary);font:inherit;font-size:var(--text-sm);font-variant-numeric:tabular-nums;text-align:left;cursor:pointer}
.time-switch button[aria-expanded="true"]{border-color:var(--brand-action);background:var(--surface-selected);color:var(--brand-action)}
.time-fields,.ratio-presets,.time-wheels{display:grid;gap:8px}
.time-fields{grid-template-columns:minmax(0,1.6fr) minmax(0,1fr)}
.time-wheels{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;max-width:295px}
.time-fields label{display:grid;gap:4px;color:var(--text-secondary);font-size:var(--text-xs);line-height:18px}
/* 370:16276 / 370:16790 / 370:16892：按钮 124×28，收起态距输入 6、日历形态距日历 11、滚轮形态距滚轮 20。 */
.restore-time,.custom-ratio,.ratio-presets button{min-height:42px;border:1px solid var(--border-warm);border-radius:var(--radius-control);background:var(--surface-card);color:var(--text-primary);font:inherit}
/* 370:16276 / 370:16790 / 370:16892 的卡片内坐标：输入 68–116；「恢复当前时间」分别落在 122 / 342 / 272，
   卡底再留 10，三种展开高度因此是 160 / 380 / 310。
   日历框标注 295×209，实际内容到 341（6 行 × 28 节距），「恢复当前时间」紧随其后 1px，故按内容高度 219 排。 */
.time-record :deep(.m-record-card-inner){padding:0 16px 10px}
.restore-time{display:block;width:124px;min-height:28px;margin:6px auto 0;border-radius:14px;font-size:var(--text-xs)}
.time-record :deep(.m-calendar){margin-top:6px}
.time-record :deep(.time-wheels){margin-top:6px}
.time-record :deep(.m-calendar) + .restore-time{margin-top:1px}
.time-record :deep(.time-wheels) + .restore-time{margin-top:20px}
.ratio-presets{grid-template-columns:repeat(3,minmax(0,94px));gap:6px;justify-content:space-between;max-width:295px}
.ratio-presets button{width:100%;height:42px;min-height:42px;padding:0}
.ratio-presets button.is-selected,.custom-ratio.is-selected{border-color:var(--brand-action);background:var(--surface-selected);color:var(--brand-action);font-weight:500}
.custom-ratio{width:100%;height:42px;min-height:42px;padding:0;font-size:var(--text-sm)}
.custom-ratio-panel{margin-top:12px;padding:14px 14px 4px;border:1px solid var(--border-subtle);border-radius:var(--radius-control);background:var(--surface-warm)}
.custom-ratio-value{margin:0 0 10px;color:var(--text-primary);font-size:var(--text-sm);font-variant-numeric:tabular-nums}
.custom-ratio-hint{margin:0 0 10px;color:var(--text-secondary);font-size:var(--text-sm);line-height:21px}
.custom-slider{display:block;margin-bottom:12px}
.custom-slider-head{display:flex;align-items:baseline;justify-content:space-between;color:var(--text-secondary);font-size:var(--text-sm);line-height:21px}
.custom-slider-head strong{color:var(--brand-action);font-size:var(--text-md);font-weight:500;font-variant-numeric:tabular-nums}
/* 滑块只改自己的轨道和滑块尺寸，不继承 .feeding-form input 的输入框描边与高度；
   带 .feeding-form 前缀是为了稳稳压过 mobile.css 里 `.mobile-area :is(input…)` 的输入框样式。 */
.feeding-form .custom-slider input[type="range"]{-webkit-appearance:none;appearance:none;width:100%;min-height:28px;height:28px;margin:4px 0 0;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none;cursor:pointer}
.feeding-form .custom-slider input[type="range"]::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:linear-gradient(to right,var(--brand-action) var(--slider-progress,50%),var(--border-warm) var(--slider-progress,50%))}
.feeding-form .custom-slider input[type="range"]::-moz-range-track{height:4px;border-radius:2px;background:var(--border-warm)}
.feeding-form .custom-slider input[type="range"]::-moz-range-progress{height:4px;border-radius:2px;background:var(--brand-action)}
.feeding-form .custom-slider input[type="range"]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:24px;height:24px;margin-top:-10px;border:0;border-radius:50%;background:var(--brand-action);box-shadow:0 1px 4px rgba(48,37,31,.24)}
.feeding-form .custom-slider input[type="range"]::-moz-range-thumb{width:24px;height:24px;border:0;border-radius:50%;background:var(--brand-action);box-shadow:0 1px 4px rgba(48,37,31,.24)}
.feeding-form .custom-slider input[type="range"]:disabled{cursor:not-allowed;opacity:.55}
.alert-wheel{max-width:295px}
.alert-settings{display:inline-flex;align-items:center;min-height:44px;color:var(--brand-action);font-size:var(--text-sm);font-weight:500;text-decoration:none}
.field-label{display:block;font-size:13px;font-weight:500;color:var(--text-secondary);margin-bottom:6px}
/* 输入控件统一 16px：iOS Safari 对 <16px 的输入框 focus 时会放大页面且不缩回。 */
.feeding-form input,.feeding-form select{width:100%;min-height:44px;padding:10px 12px;box-sizing:border-box;border:1px solid var(--border-input);border-radius:var(--radius-control);background:var(--surface-input);color:var(--text-primary);font:inherit;font-size:16px}
.feeding-form input:disabled,.feeding-form select:disabled{opacity:.7;cursor:not-allowed}
.weight-fields{min-width:0;margin:0;padding:12px;border:1px solid var(--border-subtle);border-radius:var(--radius-control);background:var(--surface-warm)}
.weight-fields legend{padding:0 6px;font-size:12px;color:var(--text-secondary)}
.weight-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:8px 0}
.weight-item{display:grid;gap:4px;min-width:0;font-size:12px;color:var(--text-secondary)}
/* 同理：iOS 对 <16px 的输入框 focus 会放大视口，配比输入框必须保持 16px。 */
.weight-item input{width:100%;min-height:44px;box-sizing:border-box;padding:8px 6px;border:1px solid var(--border-input);border-radius:10px;font:inherit;font-size:16px;font-variant-numeric:tabular-nums;background:var(--surface-input);color:var(--text-primary)}
.weight-item:last-child{font-weight:600;color:var(--brand-action)}
.weight-fields .m-muted{font-size:12px;line-height:18px;margin:0}
.baseline-details{border-top:1px solid var(--border-subtle);border-bottom:1px solid var(--border-subtle);padding:0}
.baseline-details summary{min-height:44px;display:flex;align-items:center;padding:10px 0;box-sizing:border-box;cursor:pointer;font-size:14px;font-weight:500;color:var(--text-primary);list-style:none}
.baseline-details summary::-webkit-details-marker{display:none}
.baseline-details .m-field{padding:0 0 12px}
.m-status{margin:0;font-size:13px;line-height:19px;color:var(--success-text)}
.m-actions{position:sticky;bottom:0;z-index:var(--m-z-raised);display:flex;flex-wrap:wrap;gap:12px;margin-top:16px;padding:12px 0 calc(12px + env(safe-area-inset-bottom));background:var(--surface-page)}
.feeding-submit{flex:1;display:flex;align-items:center;justify-content:center;width:100%;height:60px;min-height:60px;padding:0 16px;border:0;border-radius:var(--m-radius-button);background:var(--brand-light);color:var(--text-primary);font:inherit;font-size:16px;font-weight:500;cursor:pointer;text-decoration:none}
.feeding-submit:active:not(:disabled){background:var(--brand-accent)}
.feeding-submit:disabled{opacity:.6;cursor:not-allowed}
.saved-banner{display:flex;align-items:center;gap:12px;padding:14px 16px;margin:0 0 14px;border-radius:var(--radius-card);background:var(--success-bg);color:var(--success-text);box-shadow:var(--m-shadow)}
.saved-disc{display:grid;place-items:center;flex:none;width:36px;height:36px;border-radius:50%;background:var(--surface-card);color:var(--success-text)}
.saved-disc svg{width:18px;height:18px}
.saved-copy{display:grid;gap:2px;min-width:0;flex:1}
.saved-copy strong{font-size:15px;font-weight:500;color:var(--text-primary)}
.saved-copy small{font-size:12px;line-height:18px;color:var(--text-secondary)}
.saved-link{flex:none;font-size:13px;font-weight:500;color:var(--brand-action);text-decoration:none}
.feeding-alert{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:14px 0 0;padding:14px 16px;text-decoration:none;color:inherit}
.feeding-alert-main{display:grid;gap:2px;min-width:0;flex:1}
.feeding-alert-main strong{font-size:14px;font-weight:500}
.feeding-alert-main small{font-size:12px;line-height:18px;color:var(--text-secondary)}
.feeding-alert-action{flex:none;font-size:18px;color:var(--text-secondary)}
@media(max-width:359px){.weight-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
