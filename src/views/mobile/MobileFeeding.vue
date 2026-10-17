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
const { draft, storageAvailable, persist, replace } = useCheckinDraft(accountId, { kind: 'feeding', defaults: () => ({ starterId: '', occurredAt: localDateTimeValue(), ratio: '', weightField: '', weightValue: '', baselineHeightMm: '', baselineSource: '', deviceId: '', savedFeedingId: '', step: 1, requestId: '', submission: {}, confirmed: false }) });
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
const savedFeedingId = ref('');
let generation = 0;
watch(accountId, () => {
  generation += 1;
  saving.value = false;
  error.value = '';
  status.value = '';
}, { flush: 'sync' });
onScopeDispose(() => { generation += 1; });
watch([accountId, () => route.query.starter, () => route.query.new], () => {
  // 时间默认取当前时刻：草稿不再沿用上次进入时保存的旧时间，避免用户误提交错时间。
  if (!locked.value) draft.value.occurredAt = localDateTimeValue();
  const starterId = typeof route.query.starter === 'string' ? route.query.starter : '';
  if (route.query.new === '1' && draft.value.confirmed) {
    startNext(starterId || draft.value.starterId);
  } else if (!locked.value && starterId && starterId !== draft.value.starterId) {
    if (draft.value.starterId) replace({ starterId });
    else draft.value.starterId = starterId;
  }
  savedFeedingId.value = draft.value.savedFeedingId || '';
  if (!locked.value && draft.value.baselineSource === 'device') {
    draft.value.baselineHeightMm = '';
    draft.value.baselineSource = '';
  }
}, { immediate: true, flush: 'sync' });
function validate() {
  if (!isUuid(draft.value.starterId)) return '请先在今日添加或选择有效酵种，再记录喂养。';
  try {
    if (parseLocalDateTime(draft.value.occurredAt) > new Date()) return '喂养时间不能晚于现在。';
  } catch (cause) { return cause.message; }
  if (!draft.value.ratio) return '请选择这次使用的喂养比例。';
  if (draft.value.weightValue !== '' && !weights.value) return '投喂重量需大于 0，且当前比例需可换算。';
  if (draft.value.baselineHeightMm !== '' && (!Number.isFinite(Number(draft.value.baselineHeightMm)) || Number(draft.value.baselineHeightMm) <= 0)) return '起始高度需为大于 0 的毫米数，未测量可留空。';
  return '';
}
function startNext(starterId = draft.value.starterId) {
  if (saving.value || !draft.value.confirmed) return;
  try {
    const requestId = randomUuid();
    replace({ starterId, occurredAt: localDateTimeValue(), ratio: '', requestId });
    savedFeedingId.value = '';
    status.value = '已开始下一条喂养记录，请填写本次事实。';
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
      replace({ ...draft.value, requestId, submission: { requestId, starterId: draft.value.starterId, occurredAt: parseLocalDateTime(draft.value.occurredAt).toISOString(), ratio: draft.value.ratio, input: { baseline_height_mm: draft.value.baselineHeightMm === '' ? null : Number(draft.value.baselineHeightMm), baseline_source: draft.value.baselineSource || null, starter_g: grams?.starter ?? null, water_g: grams?.water ?? null, flour_g: grams?.flour ?? null, total_g: grams?.total ?? null } } });
    }
    // Persist the immutable operation before sending, including after a page reload.
    persist();
    if (!storageAvailable.value || !globalThis.localStorage) throw new Error('本机存储不可用，无法保证刷新后安全重试；请恢复存储后重试。');
    const payload = JSON.parse(JSON.stringify(draft.value.submission));
    if (!isUuid(payload.requestId) || payload.requestId !== draft.value.requestId) throw new Error('待确认草稿的请求编号无效，请勿重复新建，先核对已有记录。');
    const result = await saveFeeding(payload);
    if (!current()) return;
    if (!result?.id && result?.saved !== true) throw new Error('未收到云端保存确认。');
    savedFeedingId.value = result.id || '';
    draft.value.savedFeedingId = savedFeedingId.value;
    draft.value.confirmed = true;
    persist();
    status.value = '已云端保存喂养记录。要记录另一次喂养，请明确开始下一条。';
  } catch (cause) {
    if (current()) error.value = `${cause.message || '保存未完成。'}${locked.value ? ' 本次内容已锁定，重试将沿用同一请求及内容，不会重复新增。' : ''}`;
  } finally { if (current()) saving.value = false; }
}
</script>

<template>
  <main class="m-page mobile-feeding">
    <p class="m-context m-muted"><span v-if="draft.starterId">当前酵种：{{ starterName }}</span><span v-else>尚未选择酵种，<RouterLink to="/today">去今天选择</RouterLink></span> · 记录已发生的喂养</p>
    <p v-if="!storageAvailable" class="m-error">本机存储不可用，关闭页面可能丢失草稿。</p>
    <form class="m-card" @submit.prevent="save">
      <p v-if="locked && !draft.confirmed" class="m-error" role="alert">当前保留的是「{{ starterName }}」（{{ draft.starterId }}）的待确认喂养草稿，内容已锁定；不会切换酵种或覆盖草稿，请先重试确认原提交后再记录下一条。</p>
      <p v-else-if="draft.confirmed" role="status">本条已确认保存；刷新页面不会重复新增。</p>
      <label class="m-field">这次什么时候喂的<input v-model="draft.occurredAt" type="datetime-local" :disabled="locked || saving" required></label>
      <label class="m-field">喂养比例（老种 : 水 : 面粉）<select v-model="draft.ratio" :disabled="locked || saving" required><option disabled value="">请选择</option><option value="1:1:1">1 : 1 : 1</option><option value="1:2:2">1 : 2 : 2</option><option value="1:3:3">1 : 3 : 3</option><option value="1:5:5">1 : 5 : 5</option><option value="deep_reset">大比例刷新</option><option value="1:2:1">1 : 2 : 1</option></select></label>
      <fieldset v-if="draft.ratio" class="weight-fields" :disabled="locked || saving">
        <legend>投喂重量（g，可选）</legend>
        <div class="weight-grid"><label v-for="field in weightFields" :key="field" class="weight-item"><span>{{ weightLabels[field] }}</span><input type="number" min="0" step="any" inputmode="decimal" :value="weightDisplay(field)" :disabled="!canConvert" @input="setWeight(field, $event.target.value)"></label></div>
        <p class="m-muted">{{ canConvert ? '填任一项或合计，其余自动按比例换算。' : '大比例刷新没有固定配比，重量不换算。' }}</p>
      </fieldset>
      <details :open="draft.baselineHeightMm !== ''">
        <summary>喂养后起始高度（可选）<span v-if="draft.baselineHeightMm !== ''"> · {{ draft.baselineHeightMm }} mm</span></summary>
        <label class="m-field">手动修正起始高度（mm）<input v-model="draft.baselineHeightMm" type="number" min="0" step="any" inputmode="decimal" :disabled="locked || saving" @input="draft.baselineSource = 'manual'"><span class="m-muted">可留空；填写后按此值计算膨胀率。</span></label>
      </details>
      <p v-if="error" class="m-error" role="alert">{{ error }}</p><p v-if="status" role="status">{{ status }}</p>
      <div class="m-actions"><button v-if="!draft.confirmed" type="submit" class="m-primary" :disabled="saving">{{ saving ? '保存中…' : (locked ? '重试确认本次保存' : '保存喂养记录') }}</button><template v-else><RouterLink v-if="savedFeedingId" class="m-primary" :to="{ path: '/checkin', query: { starter: draft.starterId, feeding: savedFeedingId, mode: 'diagnosis' } }">可选：诊断本轮</RouterLink><RouterLink class="m-secondary" to="/today">回今日</RouterLink><button type="button" class="m-secondary" :disabled="saving" @click="startNext(typeof route.query.starter === 'string' ? route.query.starter : draft.starterId)">开始下一条喂养记录</button></template></div>
    </form>
  </main>
</template>

<style scoped>
.mobile-feeding{max-width:42rem;margin:auto}
.m-context{margin:0;overflow-wrap:anywhere}
.m-actions{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:1rem}
.m-actions .m-primary{flex:1}
summary{min-height:44px;padding:.65rem 0;box-sizing:border-box;cursor:pointer}
.weight-fields{min-width:0;margin:.75rem 0;padding:.5rem .75rem .75rem;border:1px solid var(--m-border,#d8d2c8);border-radius:10px}
.weight-fields legend{padding:0 .25rem;font-size:.8rem;color:var(--m-muted,#625e56)}
.weight-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.4rem;margin:.5rem 0}
.weight-item{display:grid;gap:.25rem;min-width:0;font-size:.75rem;color:var(--m-muted,#625e56)}
.weight-item input{width:100%;min-height:44px;box-sizing:border-box;padding:.25rem .5rem;border:1px solid var(--m-border,#d8d2c8);border-radius:8px;font:inherit;font-size:1rem}.mobile-feeding form{display:grid;gap:.2rem}.mobile-feeding .m-context{font-size:.8rem;margin-bottom:.35rem}.mobile-feeding .m-card{padding:1rem}.mobile-feeding .m-field{gap:.35rem}.mobile-feeding .m-field>input,.mobile-feeding .m-field>select{margin-top:.05rem}.mobile-feeding details{border-top:1px solid var(--m-border,#d8d2c8);border-bottom:1px solid var(--m-border,#d8d2c8);margin:.5rem 0}.mobile-feeding details summary{font-size:.9rem;font-weight:600}.mobile-feeding .m-muted{font-size:.78rem;line-height:1.4}.mobile-feeding .m-actions{margin-top:.5rem}
.mobile-feeding .weight-item input{padding:8px 5px;font-variant-numeric:tabular-nums}.weight-item:last-child{font-weight:700;color:var(--m-accent)}
@media(max-width:359px){.weight-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
