<script setup>
import { computed, onScopeDispose, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { useCheckinDraft } from '../../composables/useCheckinDraft.js';
import { saveFeeding } from '../../services/care.service.js';
import { useStarterName } from '../../composables/useStarterName.js';
import { randomUuid, isUuid } from '../../lib/uuid.js';
import { localDateTimeValue, parseLocalDateTime } from '../../lib/localDateTime.js';
import { computeWeights, ratioParts, weightFields } from '../../lib/feeding-weights.js';

const route = useRoute();
const { user } = useAuth();
const accountId = computed(() => user.value?.id || 'guest');
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
    confirmed: false
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
  // 进入本页就是为了记下一条喂养：已确认保存的草稿直接换成空白新表单，
  // 不要让用户停在一个只有「开始下一条」的只读页上。
  if (draft.value.confirmed) {
    startNext(starterId || draft.value.starterId, { quiet: true });
  } else if (!locked.value && starterId && starterId !== draft.value.starterId) {
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
  if (saving.value || !draft.value.confirmed) return;
  try {
    const requestId = randomUuid();
    replace({ starterId, occurredAt: localDateTimeValue(), ratio: '', requestId });
    baselineOpen.value = false;
    status.value = quiet ? '' : '已开始下一条喂养记录，请填写本次事实。';
    error.value = '';
  } catch (cause) { error.value = cause.message; }
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
  } catch (cause) {
    if (current()) error.value = `${cause.message || '保存未完成。'}${locked.value ? ' 本次内容已锁定，重试将沿用同一请求及内容，不会重复新增。' : ''}`;
  } finally {
    if (current()) saving.value = false;
  }
}
</script>

<template>
  <main class="m-page mobile-feeding" :data-phase="phase">
    <header class="feeding-head">
      <h1>记录喂养</h1>
      <span class="phase-chip" :data-phase="phase">{{ phaseLabel }}</span>
    </header>

    <p class="m-context m-muted">
      <span v-if="draft.starterId">当前酵种：{{ starterName }}</span>
      <span v-else>尚未选择酵种，<RouterLink to="/device">去设备页选择</RouterLink></span>
    </p>
    <p v-if="!storageAvailable" class="m-error" role="alert">本机存储不可用，关闭页面可能丢失草稿。</p>

    <section v-if="phase === 'saved'" class="saved-banner" role="status">
      <span class="saved-disc" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
      </span>
      <div class="saved-copy"><strong>喂养已保存</strong><small>本轮发酵已开始计时，可在设备页查看。</small></div>
      <RouterLink class="saved-link" :to="{ path: '/device', query: { starter: draft.starterId } }">查看本轮</RouterLink>
    </section>

    <p v-if="phase === 'pending'" class="m-error" role="alert">
      当前保留的是「{{ starterName }}」的待确认喂养草稿，内容已锁定；不会切换酵种或覆盖草稿，请先重试确认原提交后再记录下一条。
    </p>

    <form class="m-card feeding-form" @submit.prevent="save">
      <label class="m-field">
        <span class="field-label">这次什么时候喂的</span>
        <input v-model="draft.occurredAt" type="datetime-local" :disabled="locked || saving" required />
      </label>

      <label class="m-field">
        <span class="field-label">喂养比例（老种 : 水 : 面粉）</span>
        <select v-model="draft.ratio" :disabled="locked || saving" required>
          <option disabled value="">请选择</option>
          <option value="1:1:1">1 : 1 : 1</option>
          <option value="1:2:2">1 : 2 : 2</option>
          <option value="1:3:3">1 : 3 : 3</option>
          <option value="1:5:5">1 : 5 : 5</option>
          <option value="deep_reset">大比例刷新</option>
          <option value="1:2:1">1 : 2 : 1</option>
        </select>
      </label>

      <fieldset v-if="draft.ratio" class="weight-fields" :disabled="locked || saving">
        <legend>投喂重量（g，可选）</legend>
        <div class="weight-grid">
          <label v-for="field in weightFields" :key="field" class="weight-item">
            <span>{{ weightLabels[field] }}</span>
            <input
              type="number"
              min="0"
              step="any"
              inputmode="decimal"
              :value="weightDisplay(field)"
              :disabled="!canConvert"
              @input="setWeight(field, $event.target.value)"
            />
          </label>
        </div>
        <p class="m-muted">{{ canConvert ? '填任一项或合计，其余自动按比例换算。' : '大比例刷新没有固定配比，重量不换算。' }}</p>
      </fieldset>

      <details class="baseline-details" :open="baselineOpen" @toggle="baselineOpen = $event.target.open">
        <summary>喂养后起始高度（可选）<span v-if="draft.baselineHeightMm !== ''"> · {{ draft.baselineHeightMm }} mm</span></summary>
        <label class="m-field">
          <span class="field-label">手动修正起始高度（mm）</span>
          <input v-model="draft.baselineHeightMm" type="number" min="0" step="any" inputmode="decimal" :disabled="locked || saving" @input="draft.baselineSource = 'manual'" />
          <span class="m-muted">可留空；填写后按此值计算膨胀率。</span>
        </label>
      </details>

      <p v-if="error" class="m-error" role="alert">{{ error }}</p>
      <p v-if="status" class="m-status" role="status">{{ status }}</p>

      <div class="m-actions">
        <button v-if="!draft.confirmed" type="submit" class="m-primary feeding-submit" :disabled="saving">{{ submitLabel }}</button>
        <button v-else type="button" class="m-primary feeding-submit" :disabled="saving" @click="startNext(typeof route.query.starter === 'string' ? route.query.starter : draft.starterId)">开始下一条喂养记录</button>
      </div>
    </form>

    <RouterLink class="m-card feeding-alert" to="/me/notifications">
      <span class="feeding-alert-main">
        <strong>高度预约</strong>
        <small>达到目标膨胀倍数时推送提醒，在通知设置中统一管理。</small>
      </span>
      <span class="feeding-alert-action" aria-hidden="true">›</span>
    </RouterLink>
  </main>
</template>

<style scoped>
.mobile-area .m-page.mobile-feeding{padding-top:calc(12px + env(safe-area-inset-top));padding-bottom:calc(var(--m-tab-height) + env(safe-area-inset-bottom) + 24px);gap:0}
.feeding-head{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:36px;margin:0 0 10px}
.feeding-head h1{margin:0;font-size:28px;line-height:36px;font-weight:500;letter-spacing:-.02em}
.phase-chip{flex:none;display:inline-flex;align-items:center;min-height:26px;padding:0 10px;border-radius:13px;background:var(--m-icon-disc);color:var(--brand-action);font-size:12px;font-weight:500}
.phase-chip[data-phase="saved"]{background:var(--success-bg);color:var(--success-text)}
.phase-chip[data-phase="validating"],.phase-chip[data-phase="pending"]{background:var(--warning-bg);color:var(--warning-text)}
.phase-chip[data-phase="saving"]{background:var(--brand-light);color:var(--text-primary)}
.m-context{margin:0 0 12px;font-size:13px;line-height:19px;overflow-wrap:anywhere}
.m-context a{color:var(--brand-action);text-decoration:none;font-weight:500}
.feeding-form{display:grid;gap:12px;padding:var(--m-card-space)}
.field-label{display:block;font-size:13px;font-weight:500;color:var(--text-secondary);margin-bottom:6px}
.feeding-form input,.feeding-form select{width:100%;min-height:44px;padding:10px 12px;box-sizing:border-box;border:1px solid var(--border-input);border-radius:var(--radius-control);background:var(--surface-input);color:var(--text-primary);font:inherit;font-size:15px}
.feeding-form input:disabled,.feeding-form select:disabled{opacity:.7;cursor:not-allowed}
.weight-fields{min-width:0;margin:0;padding:12px;border:1px solid var(--border-subtle);border-radius:var(--radius-control);background:var(--surface-warm)}
.weight-fields legend{padding:0 6px;font-size:12px;color:var(--text-secondary)}
.weight-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:8px 0}
.weight-item{display:grid;gap:4px;min-width:0;font-size:12px;color:var(--text-secondary)}
.weight-item input{width:100%;min-height:44px;box-sizing:border-box;padding:8px 6px;border:1px solid var(--border-input);border-radius:10px;font:inherit;font-size:15px;font-variant-numeric:tabular-nums;background:var(--surface-input);color:var(--text-primary)}
.weight-item:last-child{font-weight:600;color:var(--brand-action)}
.weight-fields .m-muted{font-size:12px;line-height:18px;margin:0}
.baseline-details{border-top:1px solid var(--border-subtle);border-bottom:1px solid var(--border-subtle);padding:0}
.baseline-details summary{min-height:44px;display:flex;align-items:center;padding:10px 0;box-sizing:border-box;cursor:pointer;font-size:14px;font-weight:500;color:var(--text-primary);list-style:none}
.baseline-details summary::-webkit-details-marker{display:none}
.baseline-details .m-field{padding:0 0 12px}
.m-status{margin:0;font-size:13px;line-height:19px;color:var(--success-text)}
.m-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:4px}
.feeding-submit{flex:1;display:flex;align-items:center;justify-content:center;width:100%;height:60px;min-height:60px;padding:0 16px;border:0;border-radius:var(--m-radius-button);background:var(--brand-light);color:var(--text-primary);font:inherit;font-size:16px;font-weight:500;cursor:pointer;text-decoration:none}
.feeding-submit:active:not(:disabled){background:var(--brand-accent)}
.feeding-submit:disabled{opacity:.6;cursor:not-allowed}
.saved-banner{display:flex;align-items:center;gap:12px;padding:14px 16px;margin:0 0 14px;border-radius:var(--radius-card);background:var(--success-bg);color:var(--success-text);box-shadow:var(--m-shadow)}
.saved-disc{display:grid;place-items:center;flex:none;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.7);color:var(--success-text)}
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
