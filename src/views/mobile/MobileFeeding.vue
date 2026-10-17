<script setup>
import { computed, onScopeDispose, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';
import { useCheckinDraft } from '../../composables/useCheckinDraft.js';
import { saveFeeding } from '../../services/care.service.js';

import { useStarterName } from '../../composables/useStarterName.js';
import { randomUuid, isUuid } from '../../lib/uuid.js';
import { localDateTimeValue, parseLocalDateTime } from '../../lib/localDateTime.js';


const route = useRoute();
const { user } = useAuth();
const accountId = computed(() => user.value?.id || 'guest');
const { draft, storageAvailable, persist, replace } = useCheckinDraft(accountId, { kind: 'feeding', defaults: () => ({ starterId: '', occurredAt: localDateTimeValue(), ratio: '', baselineHeightMm: '', baselineSource: '', deviceId: '', savedFeedingId: '', step: 1, requestId: '', submission: {}, confirmed: false }) });
const { starterName } = useStarterName(accountId, computed(() => draft.value.starterId));
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
      replace({ ...draft.value, requestId, submission: { requestId, starterId: draft.value.starterId, occurredAt: parseLocalDateTime(draft.value.occurredAt).toISOString(), ratio: draft.value.ratio, input: { baseline_height_mm: draft.value.baselineHeightMm === '' ? null : Number(draft.value.baselineHeightMm), baseline_source: draft.value.baselineSource || null } } });
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
      <p class="m-muted">关联设备会自动观察喂养后前 50 分钟的有效高度，窗口结束前为暂定值；样本不足会保留缺失，不捏造起始高度。</p>
      <details :open="draft.baselineHeightMm !== ''">
        <summary>喂养后起始高度（可选）<span v-if="draft.baselineHeightMm !== ''"> · {{ draft.baselineHeightMm }} mm</span></summary>
        <label class="m-field">手动修正起始高度（mm）<input v-model="draft.baselineHeightMm" type="number" min="0" step="any" inputmode="decimal" :disabled="locked || saving" @input="draft.baselineSource = 'manual'"><span class="m-muted">可留空；填写后以手工修正值计算膨胀率，不使用设备最新单点作为起始高度。</span></label>
      </details>
      <details><summary>记录说明</summary><p class="m-muted">这里只记录已经发生的喂养，不会远程控制设备。</p></details>
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
</style>
